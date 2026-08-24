# EduConnect AI Copilot Implementation Program

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o Copilot do Professor em beta fechado sobre uma fundação de IA desacoplável, com OpenAI, Qdrant e Langfuse self-hosted.

**Architecture:** O EduConnect permanece como fonte de identidade, autorização e dados transacionais. Uma camada interna de IA expõe contratos neutros de provider e usa ferramentas controladas, Qdrant como índice reconstruível e Langfuse como telemetria não crítica. A fronteira interna será compatível com uma futura extração para serviço separado.

**Tech Stack:** Next.js 16, TypeScript, Postgres 17, Redis, BullMQ, OpenAI Responses API, Qdrant, Langfuse v4 server com SDK JS v5, OpenTelemetry, Zod e Playwright.

---

## Documentos de origem

- PRD: `docs/superpowers/specs/2026-08-24-educonnect-ai-copilot-prd.md`
- Plano 1: `docs/superpowers/plans/2026-08-24-ai-foundation-knowledge.md`
- Plano 2: `docs/superpowers/plans/2026-08-24-teacher-copilot-product.md`
- Plano 3: `docs/superpowers/plans/2026-08-24-ai-beta-readiness.md`

## Ordem obrigatória

```text
Plano 1: Fundação e conhecimento
        |
        v
Plano 2: Produto Copilot
        |
        v
Plano 3: Segurança e beta
```

Cada plano deve terminar com build, testes, diff review e um checkpoint humano. Não iniciar o plano seguinte com testes vermelhos ou migrações não validadas.

## Mapa de arquivos

### Domínio de IA

- `lib/ai/contracts.ts`: contratos neutros de provider, citações, uso e guardrails.
- `lib/ai/config.ts`: flags, modelos, limites e configuração validada.
- `lib/ai/access.ts`: acesso ao beta, cotas e reserva transacional.
- `lib/ai/providers/openai.ts`: adaptador OpenAI.
- `lib/ai/telemetry/langfuse.ts`: adapter de telemetria sem falha crítica.
- `lib/ai/vector/qdrant.ts`: adapter do índice vetorial.
- `lib/ai/retrieval/search.ts`: busca híbrida autorizada.
- `lib/ai/guardrails/*`: políticas de entrada, recuperação, saída e ação.
- `lib/ai/tools/*`: ferramentas do Copilot com schemas explícitos.
- `lib/ai/orchestrator.ts`: execução de um turno do Copilot.

### Produto

- `app/dashboard/professor/copilot/page.tsx`: página protegida do Copilot.
- `components/dashboard/copilot/*`: interface de conversa, fontes, rascunhos e cotas.
- `app/api/ai/copilot/route.ts`: streaming autenticado.
- `app/actions/ai-conversations.ts`: histórico e feedback.
- `app/actions/ai-drafts.ts`: confirmação e aplicação de rascunhos.
- `app/actions/ai-admin.ts`: beta, cotas e kill switch.

### Dados e operação

- `scripts/052_ai_foundation.sql`: tabelas, constraints e índices da fundação.
- `scripts/053_ai_knowledge.sql`: documentos, indexação e eventos.
- `scripts/054_ai_beta.sql`: políticas, feedback e controles administrativos.
- `workers/ai-worker.mjs`: filas de ingestão, embedding, geração, avaliação e exclusão.
- `docker-compose.ai.yml`: Qdrant e Langfuse self-hosted.
- `app/api/health/ready/route.ts`: readiness condicional dos serviços de IA.
- `docs/RUNBOOK_IA.md`: operação, backup, restore, kill switch e incidentes.

## Gates entre planos

### Gate do Plano 1

- Configuração falha fechada quando IA está habilitada sem segredos.
- Migrações aplicam e repetem sem alteração.
- Qdrant e Langfuse ficam saudáveis em rede privada.
- Indexação e exclusão são idempotentes.
- Busca nunca cruza professor ou turma.

### Gate do Plano 2

- Professor beta conversa com streaming e histórico.
- Citações são verificáveis.
- Ferramentas produzem schemas válidos.
- Toda gravação usa prévia e confirmação.
- Apenas rascunhos são salvos.
- Dados agregados respeitam grupo mínimo de 5.

### Gate do Plano 3

- Dataset adversarial passa integralmente nos casos críticos.
- Zero vazamento entre tenants e zero exposição de gabarito.
- Langfuse registra traces sanitizadas, custos e scores.
- Backoffice controla acesso, cotas e kill switch.
- Runbooks e restauração são exercitados.
- Produto, Segurança e Privacidade aprovam o beta.

## Cobertura das fundações do PRD

| Fundação | Tarefas |
|---|---|
| Contratos independentes de provider | Plano 1, Tasks 1, 2 e 6 |
| Feature flags | Plano 1, Task 2 |
| Workers e falhas | Plano 1, Task 7; Plano 2, Task 4; Plano 3, Tasks 4 e 6 |
| Conversas e histórico | Plano 2, Tasks 1, 5 e 6 |
| RAG e fontes | Plano 1, Tasks 5, 7 e 8; Plano 2, Task 3 |
| Avaliações e gabaritos | Plano 2, Tasks 2 e 7; Plano 3, Task 2 |
| Prompt, modelo, tokens e custos | Plano 1, Tasks 2, 4 e 6; Plano 3, Tasks 3 e 5 |
| Avaliação de qualidade | Plano 3, Tasks 2, 4 e 8 |
| Cotas e abuso | Plano 1, Task 4; Plano 3, Task 5 |
| Privacidade e menores | Plano 2, Tasks 2 e 9; Plano 3, Tasks 2, 3 e 6 |
| Governança da documentação | Plano 3, Tasks 7 e 8 |

## Verificação global

Executar com Node 24:

```bash
npm test
npm run lint
npm run build
docker compose -f docker-compose.yml -f docker-compose.ai.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.ai.yml up -d --build
npm run db:migrate
npm run test:ai
npm run test:e2e -- --grep "Copilot"
```

Resultado esperado: todos os comandos terminam com código 0. O lint pode manter apenas os 12 warnings preexistentes de `no-img-element`, sem novos warnings em arquivos de IA.

## Estratégia de commits

- Um commit por tarefa concluída.
- Nunca incluir `.env`, `.env.local`, `.claude/`, volumes, traces ou dados do Qdrant.
- Nunca misturar atualização de dependências de segurança não relacionada com uma tarefa de IA.
- Antes de cada commit, executar o teste focal e `git diff --check`.
