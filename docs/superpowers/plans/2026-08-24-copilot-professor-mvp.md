# Copilot do Professor MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o MVP do Copilot do Professor com conversas persistentes, contexto autorizado, citações, feedback e cotas.

**Architecture:** O dashboard chama rotas internas autenticadas. As rotas delegam para um serviço de domínio que valida professor, conversa, contexto e cotas antes de chamar o provider OpenAI através do contrato existente. Postgres persiste conversas, mensagens, citações, feedback e consumo; Qdrant recupera contexto quando houver documentos indexados.

**Tech Stack:** Next.js App Router, TypeScript, PostgreSQL, `pg`, Zod, helpers de sessão existentes, OpenAI adapter, Qdrant, Langfuse e testes do projeto.

---

## Mapa de arquivos

- Criar `lib/ai/copilot/types.ts`, `validation.ts` e `service.ts`.
- Criar as quatro rotas em `app/api/copilot/conversations/`.
- Criar `app/dashboard/professor/copilot/page.tsx` e `copilot-client.tsx`.
- Modificar `app/dashboard/professor/_layout-client.tsx` para o link do Copilot.
- Criar testes `tests/copilot-validation.test.ts`, `copilot-access.test.ts`, `copilot-service.test.ts`, `copilot-api-contract.test.ts` e `copilot-navigation.test.ts`.
- Criar `scripts/054_ai_copilot_mvp.sql` somente se a inspeção confirmar coluna ou índice ausente em `scripts/052_ai_foundation.sql`.

### Task 1: Validação de entradas

**Files:** Create `lib/ai/copilot/validation.ts`; create `tests/copilot-validation.test.ts`.

- [ ] Escrever primeiro os testes: mensagem com conteúdo entre 1 e 8.000 caracteres é aceita; vazia ou maior é rejeitada; título opcional aceita até 160; feedback aceita somente `positive` ou `negative`.
- [ ] Rodar `npm test -- tests/copilot-validation.test.ts` e confirmar falha porque o módulo não existe.
- [ ] Implementar os schemas:

```ts
export const copilotMessageInputSchema = z.object({ content: z.string().trim().min(1).max(8_000) })
export const conversationCreateSchema = z.object({ title: z.string().trim().min(1).max(160).optional() })
export const feedbackSchema = z.object({ rating: z.enum(["positive", "negative"]), comment: z.string().trim().max(1_000).optional() })
```

- [ ] Rodar o teste novamente e confirmar PASS.
- [ ] Commitar `git add lib/ai/copilot/validation.ts tests/copilot-validation.test.ts && git commit -m "test(ai): define copilot input boundaries"`.

### Task 2: Serviço de domínio, autorização e cotas

**Files:** Create `lib/ai/copilot/types.ts`, `lib/ai/copilot/service.ts`, `tests/copilot-access.test.ts`, `tests/copilot-service.test.ts`.

- [ ] Escrever testes que rejeitam aluno, sessão sem professor, conversa de outro professor e cota diária zerada. O provider de teste deve contar chamadas e o teste de cota deve provar zero chamadas.
- [ ] Rodar `npm test -- tests/copilot-access.test.ts tests/copilot-service.test.ts` e confirmar falha por módulos ausentes.
- [ ] Definir tipos estáveis:

```ts
export type CopilotActor = { userId: string; userType: "professor" | "aluno" }
export type CopilotCitation = { sourceId: string; title: string; excerpt: string }
export type CopilotProvider = { generate(input: { system: string; user: string; context: string }): Promise<{ text: string; citations: CopilotCitation[]; inputTokens?: number; outputTokens?: number }> }
```

- [ ] Implementar `createConversation`, `listConversations`, `getConversation`, `sendMessage` e `saveFeedback`. Cada função deve usar o usuário da sessão, filtrar por `teacher_id`, limitar histórico e transacionar o consumo da cota antes de chamar o provider.
- [ ] Recuperar somente conteúdos autorizados do professor. Se não houver evidência, persistir resposta `blocked` e não inventar citação. Validar a saída com o contrato existente antes de persistir.
- [ ] Rodar os testes e confirmar PASS.
- [ ] Commitar `git add lib/ai/copilot tests/copilot-access.test.ts tests/copilot-service.test.ts && git commit -m "feat(ai): add professor copilot service"`.

### Task 3: Rotas autenticadas

**Files:** Create `app/api/copilot/conversations/route.ts`, `app/api/copilot/conversations/[conversationId]/route.ts`, `messages/route.ts`, `feedback/route.ts`; create `tests/copilot-api-contract.test.ts`.

- [ ] Escrever testes HTTP para `401` sem sessão, `403` para aluno, `201` na criação, `200` na listagem e leitura, `404` para conversa alheia, `422` para payload inválido e `429` para cota excedida.
- [ ] Rodar `npm test -- tests/copilot-api-contract.test.ts` e confirmar falha porque as rotas não existem.
- [ ] Implementar as rotas usando o helper de sessão existente, Zod e o serviço. Nunca aceitar `teacher_id` enviado pelo browser. Usar resposta externa indistinguível para conversa inexistente ou alheia.
- [ ] Implementar feedback idempotente, validando mensagem e conversa do professor autenticado e retornando `204`.
- [ ] Rodar os testes e confirmar PASS.
- [ ] Commitar `git add app/api/copilot tests/copilot-api-contract.test.ts && git commit -m "feat(ai): expose professor copilot api"`.

### Task 4: Interface do dashboard

**Files:** Create `app/dashboard/professor/copilot/page.tsx`, `copilot-client.tsx`, `tests/copilot-navigation.test.ts`; modify `app/dashboard/professor/_layout-client.tsx`.

- [ ] Escrever teste que exige link `/dashboard/professor/copilot`, estado vazio, nova conversa, lista, formulário, loading, erro, citações, feedback e contador de uso.
- [ ] Rodar `npm test -- tests/copilot-navigation.test.ts` e confirmar falha.
- [ ] Criar página protegida seguindo o layout atual do professor. O componente client deve carregar conversas, criar conversa, enviar mensagem, renderizar resposta estruturada e enviar feedback, sem expor `teacher_id`.
- [ ] Adicionar item “Copilot” ao menu existente sem remover itens atuais.
- [ ] Rodar `npm test -- tests/copilot-navigation.test.ts && npm run lint` e confirmar PASS sem erros novos.
- [ ] Commitar `git add app/dashboard/professor/copilot app/dashboard/professor/_layout-client.tsx tests/copilot-navigation.test.ts && git commit -m "feat(ai): add professor copilot dashboard"`.

### Task 5: Integração local e documentação

**Files:** Modify `README.md`; modify `.env.example` e `tests/environment-template.test.ts` somente se faltar variável já exigida pela configuração.

- [ ] Adicionar teste que mantém `FEATURE_AI_COPILOT=false` como padrão e valida o caminho `true` com Qdrant configurado.
- [ ] Rodar `npm test && npm run lint && npx tsc --noEmit` e corrigir apenas falhas introduzidas pelo MVP.
- [ ] Habilitar a flag somente no `.env` ignorado, então rodar `docker compose --env-file .env -f docker-compose.yml -f docker-compose.ai.yml up -d --build` e `curl -fsS http://localhost:3000/api/health/ready`.
- [ ] Validar no navegador o login do `prof.teste@edu.local`, abertura do Copilot, pergunta sobre conteúdo e histórico. Esperar `{"status":"ready"}` no healthcheck.
- [ ] Documentar que a chave OpenAI fica somente no `.env`, que a feature exige `FEATURE_AI_COPILOT=true` e que nenhum segredo deve ser commitado.
- [ ] Rodar `git diff --check`, revisar `git status --short` e commitar somente os arquivos da tarefa.

## Self-review

- Conversa, histórico, contexto autorizado, citações, feedback e cotas têm tarefas explícitas.
- Streaming, rascunhos, ações contextuais, pesquisa externa e Tutor do Aluno estão fora do MVP.
- Todas as rotas obtêm o professor da sessão e filtram `teacher_id` no servidor.
- O provider é injetável para futura migração a serviço separado ou modelo local.
- Cada tarefa começa com teste falhando e termina com verificação e commit.
