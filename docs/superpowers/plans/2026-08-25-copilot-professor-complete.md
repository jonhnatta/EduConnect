# Copilot completo do professor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar geração, revisão, análise e histórico do Copilot do professor para todos os módulos, sempre como proposta editável e salva somente por ação explícita do professor.

**Architecture:** Extrair do plano de aula uma camada comum de propostas, geração e revisão. Cada domínio terá contrato Zod próprio, prompt versionado e adaptador para converter a proposta em rascunho do conteúdo existente. A API valida sessão e posse no servidor, usa retrieval autorizado e mantém OpenAI, Qdrant e Langfuse atrás de interfaces substituíveis.

**Tech Stack:** Next.js App Router, TypeScript, Zod, PostgreSQL, Qdrant, OpenAI structured output, Langfuse self-hosted, Node test runner, ESLint e TypeScript compiler.

---

## Mapa de arquivos e limites

- `lib/ai/copilot/lesson-plan-service.ts`: compatibilidade e migração da implementação existente para a camada comum.
- `lib/ai/copilot/proposal-service.ts`: ciclo comum de proposta, status, idempotência e salvamento.
- `lib/ai/copilot/content-contracts.ts`: contratos por módulo para geração e revisão.
- `lib/ai/copilot/content-prompts.ts`: prompts versionados sem regras de autorização.
- `lib/ai/copilot/content-service.ts`: orquestração de geração e revisão grounded.
- `lib/ai/copilot/postgres-repository.ts`: persistência de propostas e integração com `content_items`.
- `scripts/058_ai_copilot_content_proposals.sql`: tabelas e índices adicionais, sem quebrar `057`.
- `lib/ai/copilot/content-http.ts`: handlers HTTP comuns.
- `app/api/copilot/content/route.ts`: geração e revisão.
- `app/api/copilot/content/[proposalId]/route.ts`: leitura e rejeição.
- `app/api/copilot/content/[proposalId]/save/route.ts`: salvar rascunho.
- `app/api/copilot/content/history/route.ts`: histórico e filtros.
- `app/dashboard/professor/criar/criar-conteudo-client.tsx`: ações de geração e revisão nos editores existentes.
- `app/dashboard/professor/copilot/copilot-client.tsx`: histórico e reutilização.
- `app/dashboard/professor/analise/page.tsx`: análise de desempenho agregada.
- `app/dashboard/professor/salas/[id]/professor-sala-detail.tsx`: sugestões contextuais da sala.
- `tests/copilot-content-contracts.test.ts`: schemas e limites.
- `tests/copilot-content-service.test.ts`: guardrails, retrieval, provider, citações e settlement.
- `tests/copilot-content-api.test.ts`: autenticação, autorização, idempotência e status HTTP.
- `tests/copilot-content-ui.test.ts`: presença e estados dos controles.
- `tests/copilot-content-security.test.ts`: ausência de gabarito e isolamento de métricas.

### Task 1: Extrair a camada comum de propostas

**Files:**
- Create: `lib/ai/copilot/proposal-service.ts`
- Create: `tests/copilot-proposal-service.test.ts`
- Modify: `lib/ai/copilot/lesson-plan-service.ts`
- Modify: `lib/ai/copilot/postgres-repository.ts`

- [ ] Escrever testes para proposta `proposed`, `rejected`, `saved`, `blocked` e `failed`, incluindo hash de payload, retry idempotente e regra `saved` com `contentItemId`.
- [ ] Executar `node --experimental-strip-types --test tests/copilot-proposal-service.test.ts` e confirmar falha inicial por módulo ausente.
- [ ] Implementar o serviço comum com dependências injetadas. O serviço não deve conhecer React, sessão ou provider concreto.
- [ ] Adaptar o plano de aula para usar o serviço comum sem alterar o contrato público existente.
- [ ] Executar `node --experimental-strip-types --test tests/copilot-proposal-service.test.ts tests/lesson-plan-*.test.ts`.
- [ ] Rodar `npx tsc --noEmit` e `git diff --check`.
- [ ] Commitar `refactor(ai): extract copilot proposal lifecycle`.

### Task 2: Contratos e prompts de geração e revisão

**Files:**
- Create: `lib/ai/copilot/content-contracts.ts`
- Create: `lib/ai/copilot/content-prompts.ts`
- Create: `tests/copilot-content-contracts.test.ts`

- [ ] Definir discriminador `module` para `article`, `exercise`, `assessment`, `simulado`, `tip`, `review`, `performance` e `classroom`.
- [ ] Definir entradas com limites explícitos e saídas bounded. Questões devem separar `teacherAnswer` de qualquer DTO público de aluno.
- [ ] Definir `changeSummary`, `warnings`, `citations`, `model`, `usage` e `safety` em toda proposta de geração ou revisão.
- [ ] Criar prompts versionados para geração e revisão. Prompts exigem JSON estrito, contexto autorizado e abstinência quando faltarem evidências.
- [ ] Cobrir entradas grandes, campos desconhecidos, saída sem citação, gabarito em superfície pública e revisão sem conteúdo original.
- [ ] Executar `node --experimental-strip-types --test tests/copilot-content-contracts.test.ts`.
- [ ] Commitar `test(ai): define professor copilot content contracts`.

### Task 3: Serviço grounded de geração e revisão

**Files:**
- Create: `lib/ai/copilot/content-service.ts`
- Create: `tests/copilot-content-service.test.ts`
- Modify: `lib/ai/copilot/runtime.ts`

- [ ] Escrever testes RED para professor não autorizado, posse de conteúdo, prompt injection, retrieval sem evidência, provider inválido, citação não autorizada, sucesso e quota settlement.
- [ ] Implementar `generateContent` e `reviewContent` usando `checkAccess`, posse, `evaluateCopilotInput`, retrieval filtrado, provider injetado, schema estrito, sanitização, auditoria e Langfuse.
- [ ] Implementar análise de desempenho com dados agregados e rejeitar entrada com identificação individual não autorizada ou tentativa de diagnóstico.
- [ ] Implementar sugestões de sala somente com dados da sala pertencente ao professor e retornar proposta sem mutação automática.
- [ ] Manter identidade de documento e chunk separadas, sem adicionar campos opcionais ao schema enviado ao OpenAI.
- [ ] Executar `node --experimental-strip-types --test tests/copilot-content-service.test.ts tests/ai-*.test.ts tests/copilot-*.test.ts tests/lesson-plan-*.test.ts`.
- [ ] Rodar `npx tsc --noEmit`, ESLint nos arquivos tocados e `git diff --check`.
- [ ] Commitar `feat(ai): add grounded professor content copilot service`.

### Task 4: Persistência e migração

**Files:**
- Create: `scripts/058_ai_copilot_content_proposals.sql`
- Modify: `scripts/migrate.mjs`
- Modify: `lib/ai/copilot/postgres-repository.ts`
- Create: `tests/copilot-content-persistence.test.ts`

- [ ] Criar tabela com professor, módulo, modo, conteúdo original opcional, payload normalizado, resumo de alterações, hash, provider, modelo, status, idempotência, conteúdo salvo e timestamps.
- [ ] Adicionar índices por professor, status, módulo e atualização.
- [ ] Adicionar constraints para ownership, status e conteúdo salvo. Não copiar gabarito para campos públicos.
- [ ] Implementar criação, leitura, rejeição, salvamento e listagem paginada com filtros de professor no SQL.
- [ ] Testar retry idempotente, conflito de payload, rollback de salvamento e isolamento entre professores.
- [ ] Executar a suíte de persistência e validar registro da migração.
- [ ] Commitar `feat(ai): persist professor copilot proposals`.

### Task 5: API comum e testes de segurança

**Files:**
- Create: `lib/ai/copilot/content-http.ts`
- Create: `app/api/copilot/content/route.ts`
- Create: `app/api/copilot/content/[proposalId]/route.ts`
- Create: `app/api/copilot/content/[proposalId]/save/route.ts`
- Create: `app/api/copilot/content/history/route.ts`
- Create: `tests/copilot-content-api.test.ts`
- Create: `tests/copilot-content-security.test.ts`

- [ ] Escrever testes para 401, 403, 404, 422, 429, 201, 200 e 204. O body não pode definir professor, autor, status ou permissões.
- [ ] Implementar POST de geração/revisão, GET/DELETE de proposta, POST de save e GET de histórico paginado.
- [ ] Retornar DTOs públicos sem gabarito e sem payload bruto de métricas sensíveis.
- [ ] Garantir que cada handler resolva sessão no servidor e delegue ownership ao service/repository.
- [ ] Executar `node --experimental-strip-types --test tests/copilot-content-api.test.ts tests/copilot-content-security.test.ts`.
- [ ] Commitar `feat(ai): expose professor copilot content api`.

### Task 6: Integração nos editores

**Files:**
- Modify: `app/dashboard/professor/criar/criar-conteudo-client.tsx`
- Create: `tests/copilot-content-ui.test.ts`

- [ ] Adicionar controles de gerar e revisar para artigo, exercício, avaliação, simulado e dica.
- [ ] Enviar parâmetros específicos de cada editor e manter seleção de fontes autorizadas.
- [ ] Mostrar loading, erro, preview, versão revisada, resumo das alterações, warnings, citações, editar, rejeitar e salvar como rascunho.
- [ ] Nunca publicar automaticamente nem substituir o conteúdo original antes da confirmação.
- [ ] Para exercícios, avaliações e simulados, manter gabarito apenas em estado/rota de professor.
- [ ] Cobrir estados principais com testes de fonte/aceitação e rodar ESLint e typecheck.
- [ ] Commitar `feat(ai): integrate copilot into professor editors`.

### Task 7: Histórico e reutilização

**Files:**
- Modify: `app/dashboard/professor/copilot/copilot-client.tsx`
- Modify: `app/dashboard/professor/copilot/page.tsx`
- Create: `tests/copilot-history-ui.test.ts`

- [ ] Listar propostas paginadas por módulo, modo e status.
- [ ] Permitir abrir, reutilizar parâmetros, rejeitar e salvar como rascunho.
- [ ] Mostrar data, módulo, status, modelo e resumo de alterações sem expor dados indevidos.
- [ ] Cobrir loading, vazio, erro, paginação e proposta de outro professor.
- [ ] Commitar `feat(ai): add professor copilot proposal history`.

### Task 8: Análise e sugestões nas salas

**Files:**
- Modify: `app/dashboard/professor/analise/page.tsx`
- Modify: `app/dashboard/professor/salas/[id]/professor-sala-detail.tsx`
- Create: `tests/copilot-performance.test.ts`
- Create: `tests/copilot-classroom-suggestions.test.ts`

- [ ] Adicionar ação explícita para gerar análise agregada por período e turma.
- [ ] Mostrar métricas de origem, hipóteses, alertas e recomendações sem diagnóstico individual.
- [ ] Adicionar sugestões de atividade/conteúdo na sala sem criar ou publicar automaticamente.
- [ ] Validar posse da sala, período, filtros e ausência de dados identificáveis no provider/telemetria.
- [ ] Commitar `feat(ai): add professor analytics and classroom suggestions`.

### Task 9: Documentação e validação final

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Create: `docs/RUNBOOK_COPILOT_PROFESSOR.md`

- [ ] Documentar cada superfície, variáveis, migração, aprovação beta, limites e comportamento de bloqueio.
- [ ] Documentar como trocar o provider por implementação local sem alterar contratos.
- [ ] Executar testes AI completos em Node 24+, typecheck, lint, build, migration check, compose config e smoke autenticado de professor.
- [ ] Executar `git diff --check` e verificar que somente as mudanças da feature estão no diff. Preservar `.claude/` e `CLAUDE.md` não rastreados.
- [ ] Commitar `docs(ai): document complete professor copilot`.

## Verificação final

Com Node 24 ou superior:

```bash
npm run test:ai
npm test
npx tsc --noEmit
npm run lint
npm run build
docker compose --env-file .env -f docker-compose.yml -f docker-compose.ai.yml config --quiet
git diff --check
```

Resultado esperado: todas as suítes passam, build concluído, compose válido e smoke manual confirma geração, revisão, rejeição e salvamento como rascunho para cada módulo do professor.
