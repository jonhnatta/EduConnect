# Status do release de producao - EduConnect

**Data:** 14/07/2026  
**Estado:** release candidate tecnico; ainda nao autorizado para producao publica.

## Entregue no repositorio

- Postgres, Redis de fila, Redis de cache, MinIO e ClamAV isolados no Docker.
- Migrator canonico com 33 migrations, checksum, lock e transacao.
- Aplicacao, dispatcher e worker em processos independentes.
- Transactional outbox, BullMQ, retry, lease, idempotencia, DLQ e replay administrativo.
- E-mail de verificacao e reset em fila duravel, payload criptografado e chave de idempotencia.
- Cache-aside com TTL, jitter, fallback e chaves sem PII.
- Sessao revogavel, conta ativa, e-mail verificado, rate limit distribuido e MFA administrativo.
- Backoffice humano para aprovar, rejeitar e revogar professores, com auditoria append-only.
- Upload privado com limites, validacao documental e scan ClamAV fail-closed.
- Purge de conta e objetos apos retencao; exportacao JSON de dados pelo titular.
- Readiness de banco/schema, MinIO, ClamAV, dois Redis, dispatcher e worker.
- Caddy opcional para TLS e limite de corpo; scheduler autenticado para purge.
- Backup consistente de Postgres e MinIO, seguido de snapshot Restic criptografado off-site.
- CI com lint, typecheck, testes, build, audit, migrations, matriz de autorizacao, Redis,
  outbox/worker, backups, scan de imagem e secret scan.
- Funcionalidades e claims de IA ocultos no primeiro lancamento.

## Evidencias locais verdes

- `npm test`: 21 testes aprovados.
- `npx tsc --noEmit`: aprovado.
- `npm run lint -- --quiet`: aprovado.
- `npm run build`: aprovado, 46 paginas estaticas geradas e rotas dinamicas compiladas.
- `npm audit --omit=dev --audit-level=high`: zero vulnerabilidades.
- `docker compose --profile production --profile operations config --quiet`: aprovado.
- `node --check workers/worker.mjs` e `dispatcher.mjs`: aprovados.

## Bloqueios externos para abrir ao publico

1. Contratar o host e dimensionar CPU, memoria e disco; o Compose atual e single-host e nao e HA.
2. Registrar o dominio, apontar DNS, abrir 80/443 e comprovar o certificado emitido pelo Caddy.
3. Verificar o dominio no Resend com SPF/DKIM e executar entrega real de cadastro e reset.
4. Informar controlador, endereco, canal de privacidade/suporte e foro; remover todos os
   placeholders legais e obter revisao juridica/DPO.
5. Configurar um repositorio Restic fora do host e executar restore integral cronometrado.
6. Provisionar ao menos um administrador, registrar o TOTP e testar aprovacao/revogacao.
7. Executar a pipeline remota, smoke Docker, E2E por papel, teste EICAR, carga, pentest e piloto.
8. Configurar monitoramento externo, alertas e uma pessoa responsavel por incidentes.

## Restricao da evidencia atual

O Docker Desktop local nao respondeu ao cliente durante esta execucao. Portanto, o smoke real
dos containers e das 33 migrations nao foi concluido nesta maquina; a CI foi preparada para
executar essa prova em um runner limpo. Sem essa evidencia e sem os itens externos acima, a
decisao continua **NO-GO para usuarios reais**, embora o codigo esteja em estado de release
candidate.
