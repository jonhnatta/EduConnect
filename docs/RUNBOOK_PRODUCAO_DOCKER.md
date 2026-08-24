# Runbook de producao Docker - EduConnect

## 1. Pre-requisitos

- Host Linux com Docker Engine e Compose v2 atualizados.
- Recomendacao inicial: 4 vCPU, 8 GB RAM e disco SSD monitorado.
- Dominio com registros A/AAAA para o host e portas TCP 80/443 liberadas.
- Conta Resend com dominio verificado, SPF e DKIM validos.
- Bucket/repository externo compativel com Restic para backup fora do host.
- Identidade legal, e-mails de suporte/privacidade e textos juridicos aprovados.

O Compose possui Postgres, Redis e MinIO single-node. Ele suporta separar e escalar web/workers,
mas nao entrega alta disponibilidade dos dados em um unico host.

## 2. Configuracao

```bash
cp .env.example .env
chmod 600 .env
```

Este e o mesmo modelo usado localmente. Na VPS, altere `APP_DOMAIN`, `AUTH_URL` e
`NEXT_PUBLIC_APP_URL` para o dominio HTTPS real, substitua todos os valores `CHANGE_ME_*` e
gere segredos diferentes:

```bash
openssl rand -base64 48
openssl rand -base64 32
openssl rand -hex 32
```

As duas chaves AES devem ser Base64 que decodifica exatamente para 32 bytes. `AUTH_URL` e
`NEXT_PUBLIC_APP_URL` devem apontar para a mesma origem HTTPS. Mantenha
`PROFESSOR_VERIFICATION_PROVIDER=none`. Substitua tambem o placeholder hexadecimal de
`LANGFUSE_ENCRYPTION_KEY` pelo resultado exclusivo de `openssl rand -hex 32`.

Valide antes de criar containers:

```bash
docker compose --env-file .env -f docker-compose.yml -f docker-compose.ai.yml \
  --profile production --profile operations config --quiet
```

## 3. Primeiro deploy

```bash
docker compose --env-file .env -f docker-compose.yml -f docker-compose.ai.yml \
  --profile production up -d --build
docker compose --env-file .env -f docker-compose.yml -f docker-compose.ai.yml \
  --profile production ps
docker compose --env-file .env -f docker-compose.yml -f docker-compose.ai.yml \
  --profile production logs --no-color migrate minio-init dispatcher worker ai-worker scheduler app qdrant caddy
curl --fail https://app.seu-dominio.com/api/health/live
curl --fail https://app.seu-dominio.com/api/health/ready
```

O deploy deve ser abortado se `migrate` ou `minio-init` nao terminarem com codigo zero, se algum
servico estiver unhealthy ou se readiness retornar 503.

## 4. Primeiro administrador

1. Cadastre e confirme o e-mail que sera administrador.
2. Execute o provisionamento e registre o segredo exibido imediatamente no autenticador:

```bash
docker compose run --rm \
  -e ADMIN_TOTP_ENCRYPTION_KEY \
  migrate node scripts/grant-admin.mjs admin@seu-dominio.com admin
```

3. Acesse `/admin/mfa`, confirme o TOTP e teste aprovar, rejeitar e revogar um professor.

## 5. Backup diario

Execute diariamente pelo cron/systemd do host:

```bash
docker compose --profile operations up \
  --abort-on-container-exit --exit-code-from backup-offsite backup-offsite
```

O fluxo gera `pg_dump` consistente, espelha o bucket MinIO para staging e envia um snapshot
criptografado ao Restic. A retencao padrao e 7 diarios, 5 semanais e 12 mensais. Alertar se o
comando sair diferente de zero ou se nao houver snapshot nas ultimas 26 horas.

## 6. Restore drill

Nunca restaure sobre producao durante um teste. Use host/projeto Docker isolado:

```bash
mkdir -p restore-drill
docker run --rm --env-file .env -v "$PWD/restore-drill:/restore" \
  restic/restic:0.18.0 restore latest --target /restore
docker run --rm -v "$PWD/restore-drill/backups/postgres:/backup:ro" \
  postgres:17-alpine pg_restore --list /backup/latest.dump
```

Depois, restaure o dump em Postgres vazio, copie os objetos para bucket vazio, suba a mesma
imagem de release e execute smoke por aluno, professor e admin. Registre duracao, perda medida,
data, responsavel e hashes. Sem restore integral aprovado nao existe backup comprovado.

## 7. Atualizacao e rollback

Antes de atualizar:

```bash
npm ci
npm test
npx tsc --noEmit
npm run lint -- --quiet
npm run build
npm audit --omit=dev --audit-level=high
```

Construa e identifique a imagem por SHA/digest. As migrations devem ser expand/contract e
compativeis com a versao anterior. Em falha de app, reverta a imagem, nunca edite ou apague uma
migration aplicada. Em falha destrutiva de dados, interrompa escritas e siga o restore drill.

## 8. Escala e capacidade

- Escale `worker` separadamente conforme backlog e latencia das filas.
- Escale `app` somente apos remover a publicacao direta `127.0.0.1:3000` e manter o Caddy como
  unico ingress; ajuste o budget total de conexoes do Postgres.
- Dispatcher suporta multiplas instancias por `SKIP LOCKED`, mas uma instancia e suficiente no
  volume inicial.
- Redis queue, Postgres e MinIO single-node continuam pontos unicos de falha. Para SLO/HA, mova
  cada estado para cluster/servico gerenciado mantendo os mesmos contratos de URL/S3.

## 9. Go-live

Use `docs/STATUS_RELEASE_2026-07-16.md`. O go-live exige todos os bloqueios externos fechados,
pipeline remota verde, restore medido, pentest sem high/critical, piloto encerrado e aprovacao
formal do responsavel por Produto, Engenharia, Seguranca/Operacoes e Juridico/DPO.
