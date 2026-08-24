# PRD: Plataforma de IA e Copilot do Professor do EduConnect

**Status:** aprovado para planejamento técnico

**Data:** 24/08/2026

**Produto inicial:** Copilot do Professor

**Fases posteriores:** Tutor do Aluno, plano adaptativo, revisão assistida, correção assistida, triagem de professores e personalização explicável

**Público inicial:** professores aprovados e convidados para um beta fechado

## 1. Resumo executivo

O EduConnect implementará uma plataforma interna de IA cujo primeiro produto será o Copilot do Professor. O Copilot ajudará professores a pesquisar, planejar aulas, criar e revisar materiais, gerar atividades e interpretar dados agregados de desempenho.

O sistema começará dentro do monólito Next.js atual, mas terá contratos e fronteiras que permitam extrair a camada de IA para um serviço independente. A primeira integração usará OpenAI. A arquitetura aceitará providers alternativos e modelos locais no futuro.

O conhecimento interno será indexado em Qdrant self-hosted. Observabilidade, prompts e avaliações serão gerenciados com Langfuse self-hosted. Postgres continuará sendo a fonte oficial de usuários, permissões, conteúdos, conversas, cotas e ações. Redis e BullMQ executarão trabalhos assíncronos.

Toda saída será tratada como sugestão. O Copilot poderá preparar rascunhos, mas nunca publicar, excluir, atribuir notas ou alterar permissões. Qualquer gravação exigirá prévia, confirmação explícita e nova autorização no backend.

## 2. Contexto e decisão de produto

O projeto possui integrações antigas e atualmente inativas para revisão de artigos e análise de documentos. Também possui uma decisão de lançamento sem IA visível. Este PRD define uma nova etapa controlada, com beta fechado, guardrails, avaliação, observabilidade e revisão humana.

O desenvolvimento seguirá esta ordem:

1. Fundação compartilhada de IA.
2. Copilot do Professor.
3. Tutor do Aluno.
4. Demais experiências de IA.

O primeiro release entregará somente o Copilot do Professor. As demais experiências permanecem documentadas, mas desabilitadas por feature flags.

## 3. Problema

Professores precisam alternar entre pesquisa, edição, planejamento, elaboração de questões, revisão pedagógica e análise de desempenho. Esse processo consome tempo, dificulta o reaproveitamento do acervo existente e exige ferramentas externas que não conhecem turmas, materiais ou formatos do EduConnect.

Uma integração direta e isolada com um único modelo criaria riscos de dependência, vazamento de dados, custo imprevisível, baixa rastreabilidade e dificuldade de migração para modelos locais.

## 4. Visão do produto

O Copilot será um assistente de preparação de aulas integrado aos fluxos do EduConnect. Ele combinará contexto informado pelo professor, materiais internos autorizados, métricas agregadas da turma e pesquisa externa com fontes.

O professor continuará sendo o responsável por todas as decisões pedagógicas. O Copilot reduzirá trabalho operacional, mas não substituirá revisão, julgamento ou autoria humana.

## 5. Objetivos

### 5.1 Objetivo principal

Reduzir o tempo de preparação de aulas e aumentar a proporção de materiais aproveitáveis produzidos pelo professor, sem comprometer privacidade, segurança, qualidade pedagógica ou controle humano.

### 5.2 Objetivos secundários

- Reaproveitar conteúdos e materiais existentes.
- Ajudar o professor a pesquisar com fontes verificáveis.
- Padronizar a criação de artigos, atividades, avaliações e simulados.
- Tornar recomendações de reforço explicáveis.
- Construir uma fundação reutilizável pelo Tutor do Aluno.
- Permitir troca de provider sem reescrever telas e regras do produto.
- Preparar a extração futura da IA para um serviço separado.
- Medir qualidade, custo, latência e adoção desde o beta.

## 6. Não objetivos do MVP

O MVP não incluirá:

- Tutor do Aluno ativo.
- Publicação automática.
- Correção definitiva ou atribuição automática de nota.
- Uso de dados individuais de alunos pela IA.
- Aprovação automática de professores.
- Geração automática de plano individual do aluno.
- Personalização do feed por modelo de IA.
- Voz, geração de imagens ou geração de vídeos.
- Treinamento de modelos com dados do EduConnect.
- Hospedagem de modelos locais.
- Serviço de IA separado em produção.
- Afirmação de detecção de plágio sem mecanismo específico.
- Garantia factual baseada apenas no conhecimento interno do modelo.

## 7. Público e acesso

O acesso inicial será restrito a professores que atendam a todos os critérios:

- Conta ativa.
- Perfil do tipo professor.
- Verificação de professor aprovada.
- Participação explícita no beta.
- Feature flag global habilitada.
- Cota disponível.

O acesso poderá ser concedido, suspenso, revogado ou configurado por funcionalidade e período.

## 8. Princípios obrigatórios

1. O modelo nunca acessa banco, Qdrant, storage ou internet diretamente.
2. Toda capacidade externa é exposta por uma ferramenta controlada.
3. Permissões são determinadas pelo backend, nunca pelo modelo.
4. Dados individuais de alunos não são enviados no MVP.
5. Toda gravação exige confirmação explícita.
6. O Copilot salva somente rascunhos.
7. Toda pesquisa externa relevante apresenta fontes.
8. Falta de evidência produz abstinência, não invenção.
9. Langfuse não pertence ao caminho crítico.
10. Qdrant é um índice derivado e reconstruível.
11. OpenAI é um adaptador inicial, não uma dependência de domínio.
12. Guardrails determinísticos prevalecem sobre classificadores de IA.

## 9. Escopo funcional do Copilot

### 9.1 Preparação de aula

O professor poderá informar turma, disciplina, tema, duração, objetivos, nível, materiais e tipo de aula.

O Copilot produzirá:

- Objetivos de aprendizagem.
- Pré-requisitos.
- Estrutura temporal.
- Introdução.
- Desenvolvimento.
- Atividade prática.
- Encerramento.
- Recursos necessários.
- Forma de avaliação.
- Adaptações por nível.
- Fontes utilizadas.

### 9.2 Criação de conteúdo

O Copilot poderá preparar rascunhos de:

- Artigo.
- Exercício.
- Avaliação.
- Simulado.
- Dica rápida.
- Material complementar.
- Resumo.
- Roteiro de revisão.

A saída deverá respeitar schemas compatíveis com os formulários existentes.

### 9.3 Criação de questões

O professor poderá definir tema, quantidade, dificuldade, nível, tipo, pontuação e materiais de referência.

O Copilot poderá gerar:

- Questões objetivas.
- Questões abertas.
- Alternativas plausíveis.
- Resposta esperada.
- Explicação pedagógica.
- Rubrica de correção.
- Objetivo ou habilidade avaliada.

### 9.4 Revisão pedagógica

O Copilot poderá analisar:

- Clareza.
- Gramática.
- Estrutura.
- Adequação ao nível.
- Coerência pedagógica.
- Ambiguidades.
- Dificuldade das questões.
- Qualidade das alternativas.
- Acessibilidade da linguagem.
- Afirmações que exigem fonte.

### 9.5 Adaptação

O professor poderá solicitar:

- Simplificação.
- Aumento de dificuldade.
- Mudança de nível escolar.
- Versão resumida.
- Versão para revisão.
- Transformação de artigo em atividade.
- Transformação de material em questões.
- Inclusão de exemplos.
- Inclusão de atividade prática.

A versão original será preservada.

### 9.6 Pesquisa externa

A pesquisa deverá:

- Priorizar fontes oficiais, acadêmicas e institucionais.
- Exibir título, domínio, URL e data da consulta.
- Associar afirmações relevantes às fontes utilizadas.
- Diferenciar fonte interna de fonte externa.
- Informar quando a evidência for insuficiente.
- Impedir citações ou URLs inventadas.
- Permitir remoção de uma fonte antes de salvar.

O provider inicial de pesquisa será a capacidade de busca web disponibilizada pelo adaptador OpenAI. A interface de domínio não dependerá do formato desse provider.

### 9.7 Conhecimento interno

O professor poderá selecionar:

- Todos os seus conteúdos autorizados.
- Uma turma.
- Conteúdos específicos.
- Materiais específicos.
- Arquivos enviados na conversa.

### 9.8 Análise agregada de desempenho

O Copilot poderá receber:

- Média da turma.
- Distribuição de notas.
- Percentual de acerto por questão.
- Percentual de conclusão.
- Evolução agregada.
- Temas com maior dificuldade.

O Copilot poderá sugerir reforço, revisão, mudança de dificuldade, atividade adicional e plano de recuperação para a turma.

### 9.9 Chat central

O painel central terá:

- Conversas persistentes.
- Seleção de turma.
- Seleção de fontes.
- Controle de pesquisa externa.
- Streaming.
- Citações clicáveis.
- Lista de ferramentas utilizadas.
- Prévia de rascunhos.
- Confirmação para salvar.
- Feedback.
- Cota restante.

### 9.10 Ações contextuais

Os fluxos existentes poderão oferecer:

- Criar com Copilot.
- Revisar com Copilot.
- Gerar questões.
- Criar rubrica.
- Adaptar para outro nível.
- Criar reforço para a turma.
- Explicar resultados agregados.

A ação abrirá o Copilot com contexto pré-selecionado. O contexto ainda será validado no backend.

## 10. Experiência principal

### 10.1 Fluxo de preparação

1. Professor abre o Copilot.
2. Seleciona turma, materiais e uso opcional de pesquisa externa.
3. Descreve o resultado desejado.
4. Sistema valida acesso, cota e escopo.
5. Orquestrador seleciona ferramentas.
6. Sistema recupera fontes internas e externas.
7. Modelo gera saída estruturada.
8. Guardrails validam resposta e citações.
9. Professor revisa a prévia.
10. Professor confirma ou rejeita.
11. Backend revalida acesso.
12. Rascunho é salvo.

### 10.2 Fluxo contextual

1. Professor abre conteúdo, atividade ou análise de turma.
2. Seleciona uma ação do Copilot.
3. EduConnect cria uma conversa com referência ao contexto.
4. O mesmo fluxo de validação, geração e confirmação é executado.

## 11. Arquitetura

### 11.1 Visão inicial

```text
Interfaces do EduConnect
        |
API interna do Copilot
        |
Autorização, cotas e guardrails
        |
Orquestrador e ferramentas
        |
LLMProvider | EmbeddingProvider | VectorStore | WebSearch | Telemetry
        |
OpenAI | Qdrant | Langfuse | Redis | Postgres | Storage
```

### 11.2 Visão futura

```text
EduConnect
        |
API privada autenticada
        |
Serviço de IA
        |
OpenAI | Modelos locais | Qdrant | Langfuse
```

### 11.3 Fronteiras

O EduConnect continuará responsável por:

- Identidade.
- Autorização.
- Dados transacionais.
- Conversas exibidas no produto.
- Cotas.
- Confirmação de ações.
- Salvamento de rascunhos.

A camada de IA será responsável por:

- Orquestração.
- Providers.
- Prompts.
- Recuperação.
- Pesquisa.
- Guardrails de conteúdo.
- Avaliação.
- Telemetria de IA.

### 11.4 Contratos obrigatórios

- `LLMProvider`
- `EmbeddingProvider`
- `VectorStore`
- `WebSearchProvider`
- `TelemetryProvider`
- `CopilotRequest`
- `CopilotResponse`
- `ToolCall`
- `ToolResult`
- `Citation`
- `Usage`
- `SafetyResult`
- `DraftAction`

Nenhum componente de interface poderá importar um SDK de provider.

## 12. Ferramentas controladas

O modelo utilizará uma allowlist de ferramentas:

- `list_teacher_classrooms`
- `search_internal_knowledge`
- `get_authorized_content`
- `get_aggregate_classroom_performance`
- `search_web_sources`
- `prepare_lesson_plan`
- `prepare_content_draft`
- `prepare_activity_draft`
- `prepare_assessment_draft`
- `prepare_revision`
- `prepare_adaptation`
- `propose_draft_action`

Cada ferramenta terá schema, finalidade, autorização, timeout, limite, auditoria e classificação de dados.

## 13. Qdrant e RAG

### 13.1 Decisão

Qdrant será self-hosted desde o MVP. Postgres será a fonte oficial. Qdrant será um índice derivado e reconstruível.

### 13.2 Coleção

Será criada inicialmente uma coleção compartilhada chamada `educonnect_knowledge`.

Campos de payload mínimos:

- `tenant_id`
- `teacher_id`
- `classroom_id`
- `source_type`
- `source_id`
- `chunk_index`
- `content`
- `content_hash`
- `visibility`
- `language`
- `version`
- `indexed_at`

Campos usados em autorização e filtro terão payload indexes. `tenant_id` será preparado para multitenancy.

### 13.3 Busca

A recuperação combinará:

- Vetor denso.
- Vetor esparso ou busca lexical.
- Filtros obrigatórios.
- Recência.
- Tipo de conteúdo.
- Diversidade de fontes.

O backend construirá todos os filtros de autorização. O modelo não fornecerá IDs de professor ou turma.

### 13.4 Pipeline de ingestão

```text
Criação ou alteração no Postgres
        |
Evento transacional na outbox
        |
Job de extração
        |
Higienização e divisão em trechos
        |
Embeddings
        |
Upsert versionado no Qdrant
        |
Atualização do status de indexação
```

### 13.5 Consistência

- Jobs serão idempotentes.
- Conteúdo alterado criará nova versão.
- Versões antigas não participarão das buscas.
- Exclusão criará job de remoção.
- Falhas usarão retry e dead letter queue.
- Um reconciliador verificará divergências diariamente.
- O índice completo poderá ser reconstruído.

### 13.6 Embeddings

OpenAI será o provider inicial. O modelo de embedding será configurado por ambiente e registrado por documento.

Trocar a dimensão ou família de embedding exigirá um índice versionado. A migração usará nova coleção e alias, sem sobrescrever o índice ativo.

## 14. Pesquisa e citações

### 14.1 Fontes internas

Cada citação interna incluirá título, tipo, professor proprietário, turma quando aplicável, identificador, trecho e link interno autorizado.

### 14.2 Fontes externas

Cada fonte externa incluirá título, domínio, URL canônica e data da consulta.

### 14.3 Validação

Antes de exibir uma resposta:

1. A citação deve corresponder a uma fonte recuperada.
2. O trecho deve sustentar a afirmação.
3. A URL deve ter sido retornada pela ferramenta.
4. Título, autor e data não podem ser inventados.
5. Afirmações sem suporte serão removidas ou marcadas.
6. Contexto insuficiente produzirá abstinência.

## 15. Langfuse

### 15.1 Decisão

Langfuse será self-hosted desde o MVP. Uma versão estável da linha v4 será fixada por digest ou versão exata. Não será usada a tag `latest`.

### 15.2 Uso

Langfuse será usado para:

- Traces e sessões.
- Spans de ferramentas e recuperação.
- Generations de modelos.
- Tokens e custos.
- Latência.
- Versões de prompt.
- Feedback.
- Datasets.
- Experimentos.
- Avaliadores.

### 15.3 Estrutura de trace

```text
copilot.request
  auth.check
  quota.check
  input.guardrails
  intent.classification
  internal.retrieve
  qdrant.search
  web.search
  context.build
  llm.generation
  output.guardrails
  draft.preview
```

### 15.4 Disponibilidade

Langfuse não poderá bloquear uma resposta. Eventos serão enviados de forma assíncrona. Em caso de indisponibilidade, o sistema registrará metadados operacionais locais e tentará reenviar depois.

### 15.5 Prompts

- Prompts terão versões imutáveis.
- Ambientes usarão labels separados.
- Prompts serão vinculados às traces.
- Haverá cache local.
- Haverá fallback seguro versionado no código.
- Alteração de prompt não poderá conceder nova ferramenta.
- Rollback deverá ser imediato.

### 15.6 Privacidade

- Dados pessoais serão mascarados.
- Dados individuais de alunos serão proibidos.
- Conteúdo completo será registrado somente em amostragem controlada.
- Traces normais priorizarão hashes, tamanhos, IDs técnicos e categorias.
- Chaves, cookies, tokens e gabaritos nunca serão registrados.

## 16. Persistência no Postgres

### 16.1 Conversas

`ai_conversations`:

- `id`
- `teacher_id`
- `title`
- `classroom_id`
- `status`
- `created_at`
- `updated_at`
- `archived_at`
- `deleted_at`

### 16.2 Mensagens

`ai_messages`:

- `id`
- `conversation_id`
- `role`
- `content`
- `status`
- `model`
- `provider`
- `prompt_version`
- `created_at`
- `completed_at`
- `error_code`

Estados: `pending`, `streaming`, `completed`, `failed`, `cancelled` e `blocked`.

### 16.3 Execuções

`ai_runs`:

- `id`
- `conversation_id`
- `message_id`
- `teacher_id`
- `feature`
- `provider`
- `model`
- `prompt_version`
- `status`
- `input_tokens`
- `output_tokens`
- `estimated_cost`
- `latency_ms`
- `langfuse_trace_id`
- `correlation_id`
- `started_at`
- `completed_at`
- `error_code`

### 16.4 Ferramentas

`ai_tool_executions`:

- `id`
- `run_id`
- `tool_name`
- `status`
- `arguments_hash`
- `result_count`
- `duration_ms`
- `error_code`
- `created_at`

### 16.5 Citações

`ai_citations`:

- `id`
- `message_id`
- `source_kind`
- `source_id`
- `title`
- `url`
- `retrieved_at`
- `chunk_reference`
- `content_hash`
- `display_order`

### 16.6 Rascunhos e confirmações

`ai_draft_actions`:

- `id`
- `teacher_id`
- `conversation_id`
- `action_type`
- `target_type`
- `target_id`
- `payload`
- `payload_hash`
- `status`
- `expires_at`
- `confirmed_at`
- `created_at`

Estados: `proposed`, `confirmed`, `applied`, `expired`, `rejected` e `failed`.

O token de confirmação terá validade de 15 minutos e será vinculado ao usuário, ação e hash do payload.

### 16.7 Documentos e indexação

`ai_documents` armazenará referência, versão, hash e status do índice. O conteúdo vetorial ficará no Qdrant.

Estados: `pending`, `extracting`, `embedding`, `indexed`, `failed`, `deleting` e `deleted`.

## 17. Cotas e custos

### 17.1 Limites padrão do beta

- 20 execuções iniciadas por professor por dia.
- 1.000.000 de tokens totais por professor por mês.
- Limites específicos por ferramenta.
- Limite global configurável de custo diário.

Administradores poderão conceder limites diferentes para testes controlados.

### 17.2 Reserva

O sistema reservará uma estimativa antes da chamada. O consumo real substituirá a reserva após a conclusão. Execuções concorrentes deverão usar controle transacional.

### 17.3 Exibição

O professor verá execuções restantes e situação mensal. Valores financeiros internos não serão expostos ao professor no MVP.

## 18. Feature flags

Flags do MVP:

- `FEATURE_AI_COPILOT`
- `FEATURE_AI_WEB_SEARCH`
- `FEATURE_AI_INTERNAL_RAG`
- `FEATURE_AI_PERFORMANCE_ANALYSIS`
- `FEATURE_AI_DRAFT_ACTIONS`
- `FEATURE_AI_EXTERNAL_FILES`

Flags futuras:

- `FEATURE_AI_STUDENT_TUTOR`
- `FEATURE_AI_STUDY_PLAN`
- `FEATURE_AI_ARTICLE_REVIEW`
- `FEATURE_AI_PROFESSOR_TRIAGE`
- `FEATURE_AI_LOCAL_MODELS`

Todas serão verificadas no backend.

## 19. Guardrails

### 19.1 Motor de decisão

Guardrails produzirão um dos resultados:

- `approved`
- `approved_with_warning`
- `regenerate`
- `abstain`
- `blocked`
- `human_review_required`

### 19.2 Guardrails de acesso

- Sessão ativa.
- Professor aprovado.
- Beta habilitado.
- Feature flag.
- Cota.
- Posse da turma.
- Permissão da fonte.
- Permissão da ferramenta.
- Rate limit por usuário, IP e funcionalidade.

### 19.3 Guardrails de entrada

- Limite de tamanho.
- Validação de arquivo.
- Antimalware.
- Detecção de dados pessoais.
- Bloqueio de dados individuais de alunos.
- Detecção de solicitação de gabarito.
- Detecção de acesso cruzado.
- Detecção de prompt injection.
- Bloqueio de ações proibidas.
- Moderação de conteúdo.

Classificadores de IA poderão auxiliar, mas não substituirão verificações de autorização.

### 19.4 Guardrails de recuperação

- Filtros montados pelo backend.
- `teacher_id` derivado da sessão.
- `classroom_id` validado.
- Conteúdos excluídos e versões antigas ignorados.
- Gabaritos fora da coleção geral.
- Conteúdo individual de aluno não indexado.
- Limite de trechos e contexto.
- Validação posterior de cada resultado.

### 19.5 Guardrails de ferramentas

- Allowlist.
- Schema de entrada e saída.
- Permissão explícita.
- Timeout.
- Limite de chamadas.
- Limite de resposta.
- Auditoria.
- Nenhum SQL gerado pelo modelo.
- Nenhuma URL livre.
- Nenhuma ferramenta criada dinamicamente.

### 19.6 Guardrails de pesquisa

- Preferência por fontes oficiais e acadêmicas.
- Blocklist de domínios perigosos.
- Proteção contra SSRF.
- Bloqueio de redes internas.
- Limite de redirecionamentos.
- Limite de tamanho.
- Timeout.
- Sanitização.
- Scripts removidos.
- Conteúdo tratado como dado não confiável.

### 19.7 Guardrails do modelo

- Finalidade única por chamada.
- Prompt versionado.
- Ferramentas limitadas.
- Saída estruturada.
- Limite de tokens.
- Temperatura apropriada.
- Política de fontes.
- Política de abstinência.
- Contexto mínimo necessário.

### 19.8 Guardrails de saída

- Schema válido.
- Limite de tamanho.
- Ausência de dados pessoais.
- Ausência de dados individuais de alunos.
- Moderação.
- Detecção de segredos e prompts internos.
- Validação de citações e URLs.
- Verificação de suporte das afirmações.
- Linguagem apropriada ao nível.
- Bloqueio de garantias factuais ou de plágio sem evidência.

### 19.9 Guardrails pedagógicos

- Revisão humana obrigatória.
- Adequação ao nível.
- Separação entre fato, interpretação e sugestão.
- Limitações das fontes explícitas.
- Nenhum diagnóstico de aluno.
- Nenhuma inferência médica, psicológica ou socioeconômica.
- Nenhuma recomendação disciplinar.
- Nenhuma nota definitiva.

### 19.10 Guardrails de desempenho agregado

- Nenhum identificador.
- Nenhuma resposta individual.
- Grupo mínimo de 5 alunos ou 5 respostas válidas.
- Nenhum recorte que permita reidentificação.
- Nenhuma classificação permanente de capacidade.
- Recomendações direcionadas à turma.

### 19.11 Guardrails de ação

- Rascunho estruturado.
- Prévia completa.
- Diff em alterações.
- Hash do payload.
- Token curto de confirmação.
- Nova autorização.
- Confirmação explícita.
- Auditoria.
- Idempotência.
- Salvamento somente como rascunho.

### 19.12 Guardrails operacionais

- Timeout.
- Limite de tokens.
- Limite de ferramentas.
- Limite de pesquisa.
- Limite de custo.
- Circuit breaker.
- Cotas.
- Feature flags.
- Kill switch.
- Cancelamento seguro.
- Dead letter queue.
- Alertas.

### 19.13 Observabilidade dos guardrails

Langfuse receberá nome, versão da política, resultado, categoria, motivo sanitizado, classificador, latência e ação tomada.

## 20. Proteção de avaliações e gabaritos

- Gabaritos não serão indexados no MVP.
- Questões e gabaritos terão fronteiras de dados separadas.
- Avaliações abertas nunca fornecerão respostas corretas a fluxos de aluno.
- O Copilot do Professor poderá gerar resposta esperada apenas durante a criação autorizada de um rascunho.
- A resposta esperada não será incluída em fontes gerais do RAG.
- O modelo não receberá respostas individuais de alunos.
- O Copilot não atribuirá nota definitiva.

## 21. Privacidade e retenção

### 21.1 Dados proibidos

- Dados identificáveis de alunos.
- Respostas individuais.
- Dados de autenticação.
- Documentos de verificação.
- Tokens e segredos.
- Gabaritos fora do fluxo autorizado.

### 21.2 Retenção inicial

- Conversas ativas: enquanto mantidas pelo professor.
- Conversas excluídas: purga em até 30 dias.
- Arquivos temporários: 24 horas após processamento.
- Resultados externos em cache: 7 dias.
- Traces detalhadas amostradas: 30 dias.
- Metadados operacionais sanitizados: 180 dias.
- Dead letter queue: 30 dias.
- Pontos do Qdrant: enquanto a fonte autorizada existir.

As políticas poderão ser reduzidas após revisão jurídica. Nunca serão ampliadas silenciosamente.

### 21.3 Exclusão

Exclusões deverão propagar para Postgres, Qdrant, caches, arquivos temporários e traces vinculadas quando aplicável. A exclusão de conta reutilizará o fluxo de purga existente e adicionará os recursos de IA.

## 22. Filas e execução

### 22.1 Filas

- `ai.generate`
- `ai.ingest`
- `ai.embed`
- `ai.web-research`
- `ai.evaluate`
- `ai.delete`
- `ai.reconcile`

### 22.2 Jobs

Cada job terá ID, chave de idempotência, correlation ID, tentativas, backoff, timeout, status, dead letter queue e replay administrativo.

### 22.3 Operações síncronas

- Conversa simples.
- Revisão curta.
- Pequena geração de questões.
- Explicação de dados já agregados.

### 22.4 Operações assíncronas

- Extração e indexação.
- Reindexação.
- Pesquisa extensa.
- Pacote completo de aula.
- Avaliação grande.
- Reconciliação.
- Exclusão de derivados.
- Avaliação automática.

## 23. Erros e fallbacks

- Langfuse indisponível: continuar e reenviar telemetria depois.
- Qdrant indisponível: impedir respostas dependentes de materiais internos.
- Pesquisa indisponível: usar somente fontes internas ou informar limitação.
- OpenAI indisponível: aplicar retry e depois falhar explicitamente.
- Streaming interrompido: marcar falha e permitir nova tentativa.
- Prompt remoto indisponível: usar cache ou fallback seguro.
- Permissão perdida durante execução: cancelar e não exibir resultado sensível.
- Cota atingida: não iniciar provider e explicar o limite.
- Resposta inválida: regenerar uma vez dentro do orçamento e depois falhar.

Falha técnica nunca será convertida em aprovação ou gravação.

## 24. Observabilidade e alertas

### 24.1 Métricas

- Solicitações por minuto.
- Latência total.
- Tempo até primeiro token.
- Taxa de erro.
- Timeouts.
- Chamadas por ferramenta.
- Tokens por modelo.
- Custo por professor e funcionalidade.
- Tamanho do contexto.
- Resultados do Qdrant.
- Jobs pendentes e falhos.
- Disponibilidade dos serviços.
- Taxa de aceitação de rascunhos.
- Taxa de abstinência.
- Guardrails acionados.

### 24.2 Alertas

- Crescimento anormal de custo.
- Cota global próxima do limite.
- Erros do provider.
- Falha recorrente de ferramenta.
- Backlog de indexação.
- Divergência entre Postgres e Qdrant.
- Langfuse sem traces.
- Latência acima do objetivo.
- Repetição de conteúdo bloqueado.
- Tentativa de acesso não autorizado.

## 25. Avaliação de qualidade

### 25.1 Dataset

O dataset versionado incluirá:

- Planos de aula.
- Artigos.
- Questões objetivas e abertas.
- Rubricas.
- Adaptações.
- Resumos.
- RAG interno.
- Pesquisa externa.
- Análise agregada.
- Recusas esperadas.
- Acesso cruzado.
- Gabaritos.
- Prompt injection.

Cada caso terá entrada, contexto, resultado esperado, critérios, fontes, ferramentas permitidas, ações proibidas e referência humana.

### 25.2 Dimensões

- Correção pedagógica.
- Clareza.
- Adequação ao nível.
- Utilidade.
- Fidelidade às fontes.
- Precisão das citações.
- Respeito às permissões.
- Proteção de gabaritos.
- Schema.
- Segurança.
- Latência.
- Custo.

### 25.3 Métodos

- Validação determinística.
- Testes de autorização.
- Verificação de URLs.
- Verificação de suporte das afirmações.
- Avaliadores de modelo.
- Revisão humana.
- Experimentos registrados no Langfuse.

### 25.4 Feedback do professor

- Positivo.
- Negativo.
- Motivo categorizado.
- Comentário opcional.
- Fonte incorreta.
- Conteúdo inadequado.
- Problema de privacidade.

## 26. Testes

- Unitários dos contratos.
- Schemas estruturados.
- Ferramentas.
- Autorização.
- Cotas concorrentes.
- Confirmação.
- Idempotência.
- Filtros do Qdrant.
- Exclusão e reindexação.
- Fallbacks.
- Streaming.
- Integração com OpenAI.
- Integração com Qdrant.
- Integração com Langfuse.
- E2E dos fluxos principais.
- Carga.
- Testes adversariais dos guardrails.

## 27. Requisitos não funcionais

- Primeiro token em até 5 segundos no percentil 95, excluindo indisponibilidade externa.
- Operações simples em até 30 segundos no percentil 95.
- Tarefas longas assíncronas.
- Disponibilidade de 99% no beta.
- Langfuse fora do caminho crítico.
- Jobs idempotentes.
- Backups testados.
- Serviços em rede privada.
- Logs com correlation ID.
- Troca de provider sem mudança de telas.
- Interface responsiva e acessível.
- Recuperação após reinício de workers.

## 28. Métricas de sucesso

- Redução mínima de 30% no tempo médio das tarefas avaliadas.
- Pelo menos 70% dos rascunhos classificados como utilizáveis.
- Zero vazamento conhecido entre professores ou turmas.
- Zero publicação automática.
- 100% das afirmações externas relevantes com fonte.
- Menos de 2% de citações inválidas durante o beta e meta de zero antes da abertura.
- Disponibilidade mínima de 99%.
- Custo por tarefa medido e dentro das cotas.
- Taxa de aceitação e intensidade de edição acompanhadas por funcionalidade.

## 29. Gate do beta

O beta somente será liberado quando:

- Nenhum teste crítico de autorização falhar.
- Nenhum caso conhecido expuser gabarito.
- Nenhuma citação inexistente passar pela validação.
- Todas as gravações exigirem confirmação.
- Fallbacks forem testados.
- Cotas concorrentes funcionarem.
- Exclusões propagarem.
- Dataset atingir a utilidade mínima.
- Produto, Segurança e Privacidade aprovarem.
- Runbooks e kill switch estiverem disponíveis.

## 30. Critérios de interrupção

- Vazamento entre usuários ou turmas.
- Exposição de gabarito.
- Citações fabricadas recorrentes.
- Custo acima do limite.
- Erro persistente.
- Conteúdo inadequado grave.
- Exclusão incompleta.
- Falha de autorização.
- Falha sem fallback seguro.
- Reprovação de Segurança ou Privacidade.

## 31. Fases de implementação

### Fase 0: preparação

- Atualizar decisão de produto.
- Aprovar beta.
- Aprovar OpenAI.
- Definir responsáveis.
- Validar privacidade.
- Definir orçamento.
- Atualizar documentação.

### Fase 1: fundação

- Contratos.
- OpenAI adapter.
- Qdrant self-hosted.
- Langfuse self-hosted.
- Filas.
- Persistência.
- Cotas.
- Feature flags.
- Guardrails.
- Dataset inicial.

### Fase 2: RAG e pesquisa

- Ingestão.
- Embeddings.
- Busca híbrida.
- Permissões.
- Pesquisa externa.
- Citações.
- Reconciliação.

### Fase 3: Copilot central

- Chat.
- Histórico.
- Streaming.
- Seleção de contexto.
- Citações.
- Feedback.
- Cotas.

### Fase 4: preparação de aula

- Plano de aula.
- Objetivos.
- Estrutura.
- Atividade.
- Avaliação.
- Adaptação.

### Fase 5: criação e revisão

- Conteúdos.
- Questões.
- Rubricas.
- Revisão.
- Ações contextuais.
- Confirmação e rascunho.

### Fase 6: desempenho agregado

- Agregações.
- Anonimização.
- Tamanho mínimo de grupo.
- Sugestões de reforço.

### Fase 7: beta fechado

- Professores convidados.
- Monitoramento.
- Avaliação.
- Feedback.
- Controle de custos.
- Decisão de expansão.

## 32. Roadmap posterior

### 32.1 Tutor do Aluno

- Chat por turma e disciplina.
- RAG autorizado.
- Citações.
- Abordagem socrática.
- Pistas progressivas.
- Proteção de avaliações.
- Histórico.
- Cotas.
- Linguagem adequada.
- Escalonamento ao professor.
- Guardrails adicionais para menores.

### 32.2 Plano adaptativo

- Onboarding.
- Disponibilidade semanal.
- Prazos.
- Dificuldades.
- Revisão espaçada.
- Recomendações explicáveis.
- Confirmação do aluno.

### 32.3 Revisão de artigos

- Substituir integração antiga.
- Usar fontes.
- Remover garantia de plágio.
- Remover garantia factual sem evidência.
- Proibir publicação automática.
- Registrar prompts e evidências.

### 32.4 Correção assistida

- Sugestão por rubrica.
- Evidências.
- Explicação.
- Confirmação humana.
- Decisão específica de privacidade antes de usar respostas individuais.

### 32.5 Triagem de professores

- Apenas triagem.
- Nenhuma aprovação automática.
- Revisão humana.
- Auditoria e recurso.

### 32.6 Feed

- Regras determinísticas primeiro.
- Recomendação explicável.
- Controle do usuário.
- Nova aprovação antes de usar IA.

### 32.7 Modelos locais

- Embeddings locais.
- Classificadores locais.
- Modelos locais para tarefas simples.
- OpenAI para tarefas complexas.
- Roteamento por capacidade, risco e custo.
- Fallback controlado.

## 33. Cobertura das onze fundações

| Item | Requisito | Cobertura no PRD |
|---|---|---|
| 1 | Camada independente de provider | Contratos e adaptadores nas seções 11 e 12 |
| 2 | Feature flags | Seção 18 |
| 3 | Workers e tratamento de falhas | Seções 22 e 23 |
| 4 | Conversas e histórico | Seções 9, 10 e 16 |
| 5 | RAG e fontes | Seções 13 e 14 |
| 6 | Proteção de avaliações e gabaritos | Seções 19 e 20 |
| 7 | Modelo, prompt, tokens e custos | Seções 15, 16, 17 e 24 |
| 8 | Avaliação de qualidade | Seções 25, 26 e 29 |
| 9 | Cotas e abuso | Seções 17 e 19 |
| 10 | Privacidade e menores | Seções 19 e 21 |
| 11 | Governança da documentação | Seções 31, 34 e 35 |

## 34. Documentação e governança

Antes do beta, deverão ser atualizados:

- README.
- Decisão de IA no lançamento.
- Mapa de funcionalidades.
- Variáveis de ambiente.
- Runbook de produção.
- Política de retenção.
- Inventário de providers.
- Modelo de ameaças.
- Procedimento de desligamento.
- Guia do professor.

Toda mudança de provider, classe de dados, autonomia, retenção ou público exigirá atualização do PRD ou nova decisão registrada.

## 35. Entregáveis

- PRD aprovado.
- Arquitetura técnica.
- Plano de implementação.
- Modelo de dados final.
- Contratos internos.
- Plano de testes.
- Dataset de avaliação.
- Guardrails versionados.
- Runbooks.
- Política de retenção.
- Instalação Qdrant.
- Instalação Langfuse.
- Dashboards.
- Backoffice do beta.
- Documentação do Copilot.
- Roadmap do Tutor do Aluno.

## 36. Aprovação registrada

As decisões abaixo foram validadas durante a elaboração deste PRD:

- Primeiro release apenas com Copilot do Professor.
- Copilot completo de preparação de aula.
- Dados internos, arquivos e pesquisa externa.
- Fontes confiáveis com citações obrigatórias.
- Rascunhos com confirmação antes de salvar.
- Dados de desempenho somente agregados e anonimizados.
- Painel central e ações contextuais.
- OpenAI como primeiro provider.
- Arquitetura preparada para serviço separado e modelos locais.
- Beta fechado com cotas por professor.
- Sucesso medido por tempo economizado e utilidade dos rascunhos.
- Qdrant self-hosted desde o MVP.
- Langfuse self-hosted desde o MVP.
- Guardrails como camada obrigatória e explícita.
