# Runbook do Copilot do professor

## Ativacao controlada

O recurso exige `FEATURE_AI_COPILOT=true`, professor com conta ativa e aprovado, e uma linha
ativa em `public.ai_beta_access`. O limite diario e mensal deve ser definido por professor.
Nao habilite o recurso apenas pela variavel de ambiente em producao.

Antes do primeiro uso, valide:

```bash
curl --fail http://localhost:3000/api/health/live
curl --fail http://localhost:3000/api/health/ready
docker compose --env-file .env -f docker-compose.yml -f docker-compose.ai.yml ps
```

Qdrant fornece retrieval autorizado. Langfuse registra traces, modelo, latencia, quota e
decisoes de guardrail sem receber identificadores de alunos. OpenAI e acessado somente pelo
provider injetado. A troca futura por modelo local deve preservar as interfaces e os contratos
estruturados.

## Fluxos do professor

1. Em `/dashboard/professor/copilot`, o professor conversa, consulta fontes, envia feedback e
   consulta o historico de propostas.
2. Em `/dashboard/professor/criar`, cada editor oferece gerar ou revisar com Copilot. A proposta
   e somente um preview. Editar aplica ao formulario e salvar como rascunho persiste sem publicar.
3. Em Análise de Desempenho, a acao gera somente uma analise agregada por turma e periodo.
   Nao use o fluxo para perguntar sobre um aluno especifico.
4. Na aba Atividades de uma sala, a acao gera uma sugestao. Ela nao cria, altera ou publica uma
   atividade sem uma acao posterior explicita do professor.

## Segurança e bloqueios

- Sessao e papel sao resolvidos no servidor. Professor nao aprovado, aluno e anonimo recebem
  `401` ou `403`.
- Posse de conteudo, sala e proposta e verificada no servidor. Propostas de outro professor
  respondem `404`.
- Inputs com prompt injection, tentativa de diagnostico individual ou falta de evidencia sao
  bloqueados ou abstidos.
- DTOs normais nao contem `teacherAnswer`, `teacherId`, `authorId` ou dados brutos de metricas.
  A rota `/api/copilot/content/:proposalId/edit` e privada para preservar o gabarito durante a
  edicao do professor dono.
- Analise e sugestao sao propostas. Nao ha publicacao ou mutacao automatica.

## Diagnostico

Consulte os logs sem imprimir prompts, respostas completas ou chaves:

```bash
docker compose --env-file .env -f docker-compose.yml -f docker-compose.ai.yml logs --since=10m app ai-worker qdrant langfuse
```

`429` indica quota. `403` indica acesso, beta ou guardrail. `404` indica recurso inexistente ou
que pertence a outro professor. `409` indica conflito de idempotencia ou tentativa de salvar
uma proposta de analise ou sugestao como conteudo.

## Validacao antes de liberar

Com Node 24 ou superior:

```bash
npm run test:ai
npx tsc --noEmit
npm run lint
npm run build
docker compose --env-file .env -f docker-compose.yml -f docker-compose.ai.yml config --quiet
git diff --check
```

Faça um smoke test autenticado de professor para cada editor, rejeite uma proposta, salve uma
como rascunho, abra o historico, gere uma analise e gere uma sugestao de sala. Confirme que
nenhum item foi publicado sem a acao explicita.
