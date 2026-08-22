# EduConnect

EduConnect e uma plataforma educacional para professores e alunos. Professores publicam
conteudos, organizam turmas e atividades e acompanham o desempenho. Alunos entram em
turmas, consomem materiais, respondem atividades e acompanham o proprio progresso.

O primeiro lancamento e gratuito e nao expoe funcionalidades de inteligencia artificial.
A verificacao de professores e feita por analise humana dos documentos enviados.

## Stack

- Next.js 16, React 19 e TypeScript
- PostgreSQL 17
- Redis 7.4 separado para filas duraveis e cache descartavel
- BullMQ com dispatcher de outbox e workers independentes
- MinIO/S3 para arquivos privados
- ClamAV para varredura de todos os uploads
- Caddy para ingress HTTPS no perfil de producao
- NextAuth, Tailwind CSS 4, Radix UI e Trix

## Arquitetura de runtime

```text
cliente -> app Next.js -> PostgreSQL
                    |-> Redis cache

transacao de negocio -> outbox_events -> dispatcher -> Redis queue -> worker

uploads -> app Next.js -> MinIO privado
```

A publicacao de artigos e dicas grava a alteracao e o evento de notificacao na mesma
transacao. O dispatcher publica os eventos no BullMQ. O worker registra cada execucao em
`job_executions`, permitindo retry sem duplicar notificacoes.

## Requisitos

- Docker Engine com Compose v2 para executar a stack completa; ou
- Node.js 24, npm, PostgreSQL, Redis e storage S3 compativel para execucao sem Docker.

## Executar com Docker

1. Crie o arquivo de ambiente:

```bash
cp .env.docker.example .env
```

2. Troque todos os valores `change-*` e `troque-*`. As senhas usadas em URLs devem ser
formadas por letras, numeros, hifen ou sublinhado.

3. Suba a stack:

```bash
docker compose up -d --build
```

4. Verifique os servicos:

```bash
docker compose ps
docker compose logs migrate minio-init dispatcher worker app
curl --fail http://localhost:3000/api/health/live
curl --fail http://localhost:3000/api/health/ready
```

A aplicacao fica em `http://localhost:3000`. Use sempre esse origin no navegador: o
callback OAuth e o cookie PKCE precisam usar o mesmo host (nao misture `localhost` com
`127.0.0.1`). PostgreSQL, Redis e MinIO permanecem apenas na rede interna do Compose.
Somente a porta HTTP da aplicacao e publicada no host.

Servicos:

- `db`: PostgreSQL persistente;
- `migrate`: aplica migrations com lock, checksum e historico;
- `redis-queue`: fila duravel com AOF e politica `noeviction`;
- `redis-cache`: cache descartavel com limite de memoria;
- `minio`: storage privado;
- `minio-init`: cria bucket, usuario e policy minima;
- `dispatcher`: entrega a outbox ao BullMQ;
- `worker`: processa jobs de notificacao;
- `scheduler`: agenda o purge de contas apos a retencao;
- `app`: servidor Next.js sem privilegios.

O perfil de producao adiciona o Caddy:

```bash
docker compose --profile production up -d --build
```

O perfil `operations` executa os jobs one-shot de backup de Postgres, MinIO e Restic. Consulte
`docs/RUNBOOK_PRODUCAO_DOCKER.md` antes de usa-lo.

Para parar sem apagar dados:

```bash
docker compose down
```

Nao use `docker compose down -v` em ambientes com dados importantes, pois esse comando
remove os volumes persistentes.

## Migrations

O manifesto canonico esta em `scripts/migrate.mjs`. Cada migration e executada uma unica
vez, dentro de uma transacao, e registrada em `public.schema_migrations`. Um checksum
alterado em migration ja aplicada interrompe o processo.

```bash
npm run db:migrate
```

Use `DATABASE_MIGRATION_URL` com o usuario administrativo somente no processo de migration.
A aplicacao, dispatcher e worker devem usar `DATABASE_URL` com o usuario restrito de
runtime. No Compose, o migrator provisiona e atualiza esse papel automaticamente.

Para criar uma nova migration:

1. Adicione um arquivo SQL novo em `scripts/` sem editar migrations ja aplicadas.
2. Inclua uma nova versao no fim de `MIGRATIONS` em `scripts/migrate.mjs`.
3. Execute a migration em um banco limpo e em uma copia de banco existente.

## Desenvolvimento sem Docker

Configure ao menos:

```bash
DATABASE_URL=postgresql://...
AUTH_SECRET=...
AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
REDIS_QUEUE_URL=redis://...
REDIS_CACHE_URL=redis://...
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=educonnect
S3_REGION=us-east-1
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_FORCE_PATH_STYLE=true
PROFESSOR_VERIFICATION_PROVIDER=none
```

Depois:

```bash
npm install
npm run db:migrate
npm run dev
```

## Validacao

```bash
npx tsc --noEmit
npm run lint
npm run test:oauth
npm run test:password-reset
npm test
npm run build
docker compose config --quiet
```

O build nao ignora erros de TypeScript. Os endpoints de saude sao:

- `GET /api/health/live`: confirma que o processo HTTP esta vivo;
- `GET /api/health/ready`: confirma banco e migrations antes de receber trafego.

## Seguranca e operacao

- Nunca use as credenciais administrativas do PostgreSQL ou MinIO na aplicacao.
- Mantenha `PROFESSOR_VERIFICATION_PROVIDER=none` no primeiro lancamento.
- Use HTTPS no proxy reverso e preserve os cabecalhos definidos em `next.config.mjs`.
- Redis e PostgreSQL nao devem ter portas publicas.
- Segredos nao devem ser commitados; `.env` e apenas local.
- Backups de PostgreSQL e MinIO precisam ser armazenados fora do mesmo host e ter restore
testado antes do lancamento publico.

## Documentacao de producao

- `docs/AUDITORIA_PRODUCAO_ESCALABILIDADE_2026-07-14.md`
- `docs/PLANO_DEMANDAS_PRODUCAO_REDIS_2026-07-14.md`
- `docs/DEC-01_PUBLICO_ALVO_MENORES_2026-07-14.md`
- `docs/DEC-02_IA_NO_LANCAMENTO_2026-07-14.md`
- `docs/DEC-03_SELO_PROFESSOR_OPERACAO_HUMANA_2026-07-14.md`
- `docs/DEC-04_NEGOCIO_FORNECEDORES_2026-07-14.md`

Cloud, dominio, TLS, monitoramento externo e destino dos backups ainda precisam ser
definidos antes de abrir o ambiente ao publico.

O status objetivo do release esta em `docs/STATUS_RELEASE_2026-07-16.md`; os comandos de deploy,
backup e restore estao em `docs/RUNBOOK_PRODUCAO_DOCKER.md`.
