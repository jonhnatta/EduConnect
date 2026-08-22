# DEC-02 - IA no lancamento

**Data:** 14/07/2026
**Projeto:** EduConnect
**Demanda origem:** `DEC-02 - Definir IA no lancamento`
**Plano origem:** `docs/PLANO_DEMANDAS_PRODUCAO_REDIS_2026-07-14.md`
**Prioridade:** P0
**Bloqueia producao:** sim
**Status:** concluida para o lancamento sem IA visivel

## 1. Decisao aprovada para o lancamento

A EduConnect nao lancara funcionalidades de IA visiveis ou acessiveis ao usuario final no primeiro go-live. Qualquer integracao existente deve permanecer desligada, fora da navegacao, sem claims de marketing e sem tomada automatica de decisao.

Decisao de lancamento:

- Revisao de artigo por IA fica desabilitada; publicacao depende somente do fluxo nao automatizado permitido pelo produto.
- Verificacao de professor usa somente revisao humana; IA nao aprova, reprova nem prioriza casos no lancamento.
- Tutor IA do aluno fica indisponivel e fora da navegacao.
- Plano de estudos e feed usam somente regras deterministicas e linguagem sem IA.
- Claims de plagio, erro factual, tutor socratico, plano adaptativo e IA integrada em toda jornada devem ser removidos.

## 2. Inventario atual de IA e simulacoes

| Funcionalidade | Evidencia local | Estado atual | Decisao para go-live |
|---|---|---|---|
| Revisao de artigo por IA | `lib/content/review-agent.ts`; `app/actions/content-items.ts`; `components/dashboard/content-review-dialog.tsx` | Chama xAI e grava score/finding; pode publicar automaticamente com score acima de 80 | Beta controlado, sem auto-publicacao ate controles P0/P1 estarem prontos |
| Preview de revisao no editor | `app/dashboard/professor/criar/criar-conteudo-client.tsx` | Simula notas 95/88/92 com `setTimeout` | Remover ou substituir por status real do job de revisao |
| Verificacao de professor por IA | `lib/professor-verification/analyze.ts`; `app/api/professor-verification/upload/route.ts` | Pode aprovar automaticamente com confianca >= 0.75 quando provider esta ativo | Usar apenas como triagem; aprovacao final humana/qualificada |
| Tutor IA do aluno | `app/dashboard/aluno/tutor/page.tsx` | Respostas fixas por palavra-chave com `setTimeout` | Remover da navegacao ou feature-flag fechada |
| Plano de estudos por IA | `app/cadastro/onboarding/page.tsx` | Texto diz que IA analisa, mas fluxo salva respostas | Trocar copy para plano baseado em respostas ou esconder promessa de IA |
| Feed curado por IA | `components/landing/features-section.tsx`; landing/hero | Claim de IA sem runtime correspondente | Remover claim ou renomear para feed por interesses |
| Claims de plagio/fatos | README, landing e prompts | Promete verificacao de plagio e fatos sem fonte autoritativa | Remover garantia; usar linguagem de apoio/revisao automatizada beta |

## 3. Matriz de classificacao para o lancamento

| Funcionalidade | Classe | Provider | Dados enviados | Fallback | Bloqueia go-live? |
|---|---|---|---|---|---|
| Revisao de artigo | Beta explicito | xAI `grok-3-mini` ou modelo aprovado | Titulo e ate 8000 caracteres do artigo | Falha tecnica volta para rascunho/pendente; professor recebe erro claro | Sim, se permanecer visivel sem controles |
| Verificacao de professor | Triagem auxiliar | OpenAI/xAI quando aprovado; `none` por padrao | Imagem do documento, nome e interesses declarados | Sempre encaminha para analise manual | Sim, se aprovar automaticamente |
| Tutor aluno | Removido ou flag fechada | Nenhum no go-live | Nenhum | Rota indisponivel ou texto "em desenvolvimento" fora da navegacao publica | Sim, se continuar apresentado como IA real |
| Plano personalizado | Nao IA no go-live | Nenhum | Respostas de onboarding | Plano baseado em respostas, sem claim de IA | Sim, se continuar dizendo que IA analisa |
| Feed personalizado | Nao IA no go-live | Nenhum | Interesses, seguindo e conteudo publicado | Feed por regras deterministicas | Sim, se marketing prometer IA |
| Revisao de plagio/fatos | Nao garantido | Nenhum provider autoritativo no go-live | Nao aplicavel | Linguagem de "sugestoes" e "sinais de risco" | Sim, se promessa factual/plagio continuar |

## 4. Politica de linguagem do produto

Textos permitidos:

- "Revisao automatizada beta para apoiar a avaliacao do professor."
- "Sugestoes geradas automaticamente podem conter erros e exigem revisao humana."
- "Plano baseado nas suas respostas."
- "Feed organizado por interesses, turmas e professores que voce acompanha."
- "Verificacao de professor em analise."

Textos proibidos ate nova aprovacao:

- "IA verifica plagio."
- "IA verifica fatos."
- "IA garante qualidade."
- "A IA cria um plano personalizado" quando nao houver IA real.
- "Tutor IA online" quando a resposta for simulada.
- "IA integrada em toda jornada."
- Qualquer score, estatistica ou selo apresentado como resultado de IA quando for simulado.

## 5. Requisitos minimos para manter revisao de artigo em beta

Antes de ficar disponivel em producao, a revisao de artigo precisa:

- Rodar via fila duravel `content.review`, nao via `after()` acoplado ao request.
- Ter timeout, retry, quota, circuit breaker e custo medido.
- Registrar provider, modelo, versao do prompt, policy version, input hash e output estruturado.
- Nao armazenar ou logar corpo integral de artigo em logs de aplicacao.
- Nao publicar automaticamente sem decisao aprovada por Produto, Seguranca e Juridico.
- Exibir disclaimer de beta e exigir decisao humana quando score estiver em faixa sensivel.
- Ter avaliacao offline com dataset aprovado, falsos positivos/negativos e criterios de rollback.
- Ter fallback explicito quando IA falhar, ficar indisponivel ou estourar quota.

## 6. Requisitos minimos para verificacao de professor

Antes de qualquer uso em producao, verificacao de professor com IA precisa:

- Ser apenas triagem, nao decisao final automatica de selo.
- Enviar documentos apenas a providers aprovados por DPA, regiao, retencao e seguranca.
- Ter backoffice humano com decisao, motivo, auditoria, apelo e revogacao.
- Ter retencao definida para documentos e outputs de IA.
- Ter protecao contra fraude, reenvio abusivo e custos.
- Tratar PDF e imagem com comportamento consistente e documentado.
- Garantir que falha de IA nunca aprove professor.

## 7. Dados, privacidade e retencao

Dados que podem ir para IA apenas com aprovacao de DPO/Juridico:

- Texto de artigo submetido para revisao.
- Metadados minimos do artigo: titulo, tipo e idioma.
- Imagem de documento de professor, somente para triagem aprovada.
- Nome do professor quando necessario para triagem documental.

Dados que nao devem ir para IA no go-live:

- Respostas de alunos a provas ou atividades.
- Gabaritos.
- Dados de menores.
- Documentos de menores.
- Tokens, cookies, secrets ou dados de autenticacao.
- Conteudo privado de turma sem base legal e consentimento claros.

Retencao minima esperada:

- Registrar hashes, versoes, status e metadados operacionais suficientes para auditoria.
- Evitar persistir prompts completos com PII sem politica aprovada.
- Permitir exclusao/purge quando titular exercer direito aplicavel.

## 8. Avaliacao e monitoramento

IA so deve ser considerada pronta para producao quando houver:

- Dataset de avaliacao aprovado por Produto e Seguranca.
- Medicao de falso positivo, falso negativo, abstencao, custo, latencia e disponibilidade.
- Dashboard de chamadas por provider/modelo/status/custo.
- Alertas para erro, timeout, 429, custo diario, backlog e decisao anomala.
- Amostragem de revisao humana para outputs de IA.
- Runbook de desligamento por feature flag.

## 9. Feature flags obrigatorias

| Flag | Default producao | Uso |
|---|---|---|
| `FEATURE_AI_ARTICLE_REVIEW` | `false` | Mantem revisao automatizada desligada |
| `FEATURE_AI_ARTICLE_AUTO_PUBLISH` | `false` | Deve permanecer desligada |
| `FEATURE_AI_PROFESSOR_TRIAGE` | `false` | Mantem triagem automatizada desligada |
| `FEATURE_AI_PROFESSOR_AUTO_APPROVE` | `false` | Deve permanecer desligada |
| `FEATURE_AI_STUDENT_TUTOR` | `false` | Mantem tutor indisponivel |
| `FEATURE_AI_STUDY_PLAN` | `false` | Mantem plano por IA indisponivel |
| `FEATURE_AI_FEED_PERSONALIZATION` | `false` | Mantem personalizacao por IA indisponivel |

## 10. Demandas derivadas

| Demanda | Impacto |
|---|---|
| `PROD-01` | Remover ou implementar IA simulada no editor, tutor e onboarding. |
| `PROD-03` | Remover claims de IA, plagio, fatos, numeros e depoimentos sem prova. |
| `QUEUE-05` | Migrar revisao de conteudo para fila duravel. |
| `QUEUE-07` | Migrar verificacao de professor para fila duravel. |
| `TRUST-01` | Criar backoffice humano para verificacao de professor. |
| `LGPD-04` | Formalizar DPIA/ROPA e fornecedores de IA. |
| `OBS-02` | Medir IA por latencia, erro, custo, quota e trace. |
| `SEC-04` | Rate limit para endpoints caros de IA e upload. |

## 11. Criterios de aceite da DEC-02

| Criterio | Status | Evidencia |
|---|---|---|
| Cada uso de IA classificado | Concluido | Secoes 2 e 3 |
| Finalidade definida | Concluido | Secoes 3, 5 e 6 |
| Dados enviados definidos | Concluido | Secoes 3 e 7 |
| Provider definido ou removido | Concluido | Secoes 3 e 9 |
| Fallback definido | Concluido | Secoes 3, 5 e 6 |
| Avaliacao definida | Concluido | Secao 8 |
| Aprovacao Produto | Concluido | Decisao do responsavel pelo projeto em 14/07/2026 |
| Aprovacao DPO/Juridico | Nao aplicavel ao go-live | Nenhum dado sera enviado a provider de IA no lancamento |
| Aprovacao Seguranca | Nao aplicavel ao go-live | Nenhuma decisao automatizada por IA fica habilitada |
| Aprovacao Engenharia | Em execucao | `PROD-01` e `PROD-03` removem as superficies visiveis |

## 12. Registro de aprovacao

| Area | Responsavel | Status | Data | Observacao |
|---|---|---|---|---|
| Produto | Responsavel pelo projeto | Concluido | 14/07/2026 | Lancamento sem funcionalidades de IA visiveis. |
| DPO/Juridico | A definir | Nao aplicavel ao go-live | - | Nenhum dado sera enviado a provider de IA no lancamento. |
| Seguranca | A definir | Nao aplicavel ao go-live | - | Nenhuma decisao automatizada por IA fica habilitada. |
| Engenharia | A definir | Em execucao | - | Remover navegacao, claims e rotas da superficie ativa. |

## 13. Decisao de go-live

A decisao de lancamento esta fechada: IA nao fica visivel nem habilitada. A remocao tecnica da superficie publica continua nas demandas `PROD-01` e `PROD-03`; qualquer reativacao futura exige nova decisao de Produto, Seguranca e Juridico.
