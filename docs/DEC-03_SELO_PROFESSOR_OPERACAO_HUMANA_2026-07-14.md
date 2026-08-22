# DEC-03 - Selo de professor e operacao humana

**Data:** 14/07/2026
**Projeto:** EduConnect
**Demanda origem:** `DEC-03 - Definir selo de professor e operacao humana`
**Plano origem:** `docs/PLANO_DEMANDAS_PRODUCAO_REDIS_2026-07-14.md`
**Prioridade:** P0
**Bloqueia producao:** sim
**Status:** politica de Produto definida; implementacao pendente

## 1. Decisao proposta para o lancamento

O selo `Professor verificado` significa que a EduConnect revisou evidencias razoaveis de que a conta pertence a uma pessoa com qualificacao ou experiencia relevante para ensinar as disciplinas declaradas. Ele nao certifica competencia pedagogica absoluta, vinculo atual com instituicao, antecedentes, qualidade permanente de conteudo ou ausencia de fraude futura.

No go-live, o selo so pode ser concedido, revogado ou restaurado por um revisor humano autorizado. IA, quando liberada pela `DEC-02`, pode priorizar ou resumir a fila, mas nunca decide o estado final. Nenhum documento de identidade deve ser exposto em perfil, feed, API publica ou logs.

## 2. Evidencias aceitas e criterio de competencia

O solicitante deve enviar curriculo ou diploma, acompanhado de evidencia complementar quando necessario. O revisor verifica legibilidade, coerencia entre nome, documento e disciplinas declaradas, e se a evidencia demonstra formacao ou experiencia minimamente relevante para a area ensinada.

Evidencias aceitas:

- Curriculo profissional, incluindo curriculo Lattes quando aplicavel, com formacao e experiencia relacionadas as disciplinas declaradas.
- Diploma, certificado de licenciatura, graduacao, pos-graduacao ou formacao reconhecivel.
- Carteira funcional, declaracao ou comprovante emitido por instituicao de ensino.
- Comprovante de experiencia profissional relevante para a disciplina, quando a materia permitir esse tipo de qualificacao.

Checklist humano minimo:

- O nome informado corresponde ou possui justificativa verificavel para divergencia.
- A evidencia e legivel, integra e nao apresenta sinal material de adulteracao.
- Formacao ou experiencia tem relacao razoavel com pelo menos uma disciplina declarada.
- O professor nao recebe selo para disciplina que nao possui evidencia minima; o backoffice deve permitir limitar as areas aprovadas.
- Casos ambiguos, documentos estrangeiros ou disciplinas de alto impacto devem ser escalados a revisor senior.

Recusar ou encaminhar para esclarecimento quando houver imagem ilegivel, arquivo corrompido, documento sem vinculo com atividade educacional, nome incompativel sem explicacao, sinais materiais de adulteracao ou tentativa repetida de burlar o fluxo.

Documentos de identidade civil, dados financeiros, CPF completo e informacoes excessivas nao devem ser solicitados por padrao. Se um caso excepcional exigir dado adicional, ele precisa de justificativa registrada e politica aprovada por DPO/Juridico.

## 3. Estados e transicoes

| Estado | Significado | Quem pode mover | Proxima acao |
|---|---|---|---|
| `none` | Nenhum documento submetido | Professor | Enviar evidencia |
| `pending` | Documento recebido, aguardando triagem ou revisao humana | Sistema/revisor | Classificar ou decidir |
| `approved` | Selo ativo, concedido por decisao humana auditada | Revisor autorizado | Publicar, criar sala e manter monitoramento |
| `rejected` | Evidencia insuficiente, invalida ou inconclusiva | Revisor autorizado | Informar motivo seguro e permitir reenvio/apelo |
| `revoked` | Selo removido apos fraude, erro, denuncia confirmada ou perda de requisito | Revisor senior ou dupla aprovacao | Suspender privilegios e abrir apelo |

O schema atual suporta apenas `none`, `pending`, `approved` e `rejected`. `revoked`, motivo estruturado, decisor, versao da politica, prazo de revisao e trilha de auditoria devem ser introduzidos pela `TRUST-01` com migration canonica da `DB-01`.

## 4. Regras operacionais

- A submissao entra em fila privada; o acesso ao documento e limitado a revisores com papel especifico, MFA e sessao curta.
- Um revisor analisa a evidencia pelo checklist e escolhe `aprovar`, `rejeitar`, `pedir reenvio` ou `escalar`.
- Aprovacao e revogacao exigem motivo estruturado, identificador do revisor, data/hora e versao da politica. O professor ve uma explicacao curta, sem revelar sinais antifraude.
- Casos de fraude, conflito, alta visibilidade ou revogacao exigem revisao por segundo revisor ou responsavel de Trust & Safety.
- Revisor nao pode decidir seu proprio caso, nem alterar trilhas de auditoria.
- Uma decisao manual prevalece sobre qualquer resultado de IA. Falha de IA, timeout ou indisponibilidade mantem o caso em `pending`.
- A UI publica so exibe o selo ativo. Nao deve afirmar "identidade confirmada" nem detalhar o documento analisado.

## 5. Qualidade apos o selo

O selo nao encerra o controle de qualidade. Conteudos e interacoes de professores verificados continuam sujeitos a denuncia, moderacao, revisao administrativa e revogacao. Denuncias consistentes sobre conteudo enganoso, fraude documental, assedio ou violacao grave da politica podem suspender preventivamente o selo e os privilegios de publicacao ate decisao humana.

## 6. SLA e fila de atendimento

| Situacao | Meta | Escalacao |
|---|---|---|
| Nova submissao | primeira analise em ate 2 dias uteis | alerta para fila acima de 24 h |
| Reenvio ou apelo simples | resposta em ate 3 dias uteis | dono de Trust & Safety acima de 48 h |
| Suspeita de fraude ou denuncia relevante | triagem em ate 1 dia util | revisor senior e Seguranca |
| Revogacao emergencial | suspensao preventiva imediata, decisao documentada em ate 1 dia util | responsavel de Trust & Safety e on-call de Seguranca |

Os SLAs devem ser publicados apenas depois que `DEC-05` confirmar capacidade e RACI. Ate la, o produto informa que a verificacao esta em analise, sem prometer prazo ao usuario.

## 7. Fraude, apelo e revogacao

Sinais de abuso incluem reenvios em alta frequencia, documentos repetidos em contas distintas, inconsistencias materiais, manipulacao de imagem, denuncias corroboradas e uso indevido do selo. O sistema deve rate-limit uploads, manter evidencias minimas e permitir bloqueio temporario de novas submissoes.

O professor pode recorrer de rejeicao ou revogacao pelo fluxo autenticado. O apelo cria novo caso, preserva a decisao anterior e encaminha a um revisor diferente. O prazo, resultado e motivo devem ficar auditados. A revogacao remove imediatamente privilegios que dependem de verificacao, preservando conteudos para revisao administrativa e notificando o titular sem expor detalhes de deteccao.

## 8. Retencao, privacidade e acesso

- Documento original, preview e metadados ficam em storage privado, criptografado e com URL de curta duracao.
- Acesso deve ser registrado e limitado ao caso atribuido; downloads e compartilhamentos fora do backoffice sao proibidos.
- Arquivos rejeitados, substituidos ou revogados seguem prazo de retencao aprovado em `LGPD-03`; ao expirar, DB, storage, cache e jobs relacionados devem ser purgados com evidencia.
- Logs de aplicacao registram IDs e eventos, nunca a imagem, base64, URL assinada, CPF, numero de documento ou razao detalhada de fraude.
- Uso de provider de IA para triagem depende de DPIA/ROPA, DPA, regiao, retencao e flags da `DEC-02`.

## 9. Lacunas do fluxo atual

| Evidencia | Risco | Demanda corretiva |
|---|---|---|
| `app/api/professor-verification/upload/route.ts` pode atualizar `pending` para `approved` apos analise automatica | Selo concedido sem decisao humana | `QUEUE-07`, `TRUST-01`, `PROD-01` |
| O mesmo endpoint usa `after()` para processamento | Trabalho pode ser perdido no deploy/falha e nao tem operacao de fila | `QUEUE-07`, `QUEUE-12` |
| `scripts/report-professores-manuais.mjs` depende de relatorio e SQL manual | Sem backoffice, RBAC, auditoria, SLA ou apelo operacional | `TRUST-01`, `TRUST-03` |
| Schema nao possui `revoked`, decisor nem motivo estruturado | Nao suporta revogacao, investigacao e rastreabilidade | `DB-01`, `TRUST-01` |
| Documento e lido integralmente em memoria no request | Exposicao e risco de disponibilidade antes da quarentena | `STO-01`, `STO-02` |

## 10. Demandas derivadas

| Demanda | Resultado esperado |
|---|---|
| `DB-01` | Migration canonica para estados, auditoria e retencao do caso. |
| `QUEUE-07` | Triagem opcional em `professor.verify`, duravel e sem auto-aprovacao. |
| `TRUST-01` | Backoffice privado com fila, decisao, apelo, revogacao e SLA. |
| `TRUST-03` | RBAC administrativo, MFA, sessao curta e audit log imutavel. |
| `STO-01` e `STO-02` | Upload autenticado, quarentena, scan e acesso privado. |
| `SEC-04` | Limites contra abuso de upload, apelo e triagem. |
| `LGPD-03` e `LGPD-04` | Retencao, purge, DPIA e contratos de fornecedores. |
| `OBS-02` e `OBS-03` | Metricas de fila, SLA, fraude, erro e runbook de escalacao. |

## 11. Criterios de aceite da DEC-03

| Criterio | Status | Evidencia |
|---|---|---|
| Significado do selo definido | Concluido | Secao 1 |
| Evidencias, competencia e recusas definidas | Concluido | Secao 2 |
| Decisor humano definido | Concluido | Secoes 3 e 4 |
| SLA e escalacao definidos | Proposto | Secao 5; depende de `DEC-05` |
| Fraude, apelo e revogacao definidos | Concluido | Secao 6 |
| Privacidade, retencao e acesso definidos | Proposto | Secao 7; depende de DPO/Juridico |
| Aprovacao Produto | Concluido | Decisao do responsavel pelo projeto em 14/07/2026 |
| Aprovacao DPO/Juridico | Pendente | Assinatura/issue externa requerida |
| Aprovacao Seguranca | Pendente | Assinatura/issue externa requerida |
| Aprovacao Trust & Safety | Pendente | Responsavel e escala de revisores requeridos |
| Aprovacao Engenharia | Pendente | Validar estados, fila, backoffice e controles |

## 12. Registro de aprovacao

| Area | Responsavel | Status | Data | Observacao |
|---|---|---|---|---|
| Produto | Responsavel pelo projeto | Concluido | 14/07/2026 | Curriculo ou diploma; evidencia deve cobrir as disciplinas declaradas; qualidade continua por moderacao. |
| DPO/Juridico | A definir | Pendente | - | Validar evidencias, retencao, direitos e comunicacao ao titular. |
| Seguranca | A definir | Pendente | - | Validar antifraude, acesso administrativo e resposta a incidente. |
| Trust & Safety | A definir | Pendente | - | Definir revisores, cobertura, escalacao e dupla aprovacao. |
| Engenharia | A definir | Pendente | - | Validar schema, fila, storage, backoffice e observabilidade. |

## 13. Decisao de go-live

A EduConnect nao deve exibir ou conceder o selo de professor em producao publica enquanto a aprovacao automatica puder ocorrer, enquanto nao houver um revisor humano responsavel e enquanto os controles de acesso, auditoria, apelo, revogacao e retencao nao estiverem operacionais. Esta decisao define a politica; a implementacao fica bloqueada pelas demandas derivadas, principalmente `QUEUE-07`, `TRUST-01`, `TRUST-03`, `STO-01`, `STO-02` e `LGPD-03`.
