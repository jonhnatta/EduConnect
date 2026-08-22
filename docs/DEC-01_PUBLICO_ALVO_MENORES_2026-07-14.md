# DEC-01 - Publico-alvo e politica de menores

**Data:** 14/07/2026
**Projeto:** EduConnect
**Demanda origem:** `DEC-01 - Definir publico-alvo e menores`
**Plano origem:** `docs/PLANO_DEMANDAS_PRODUCAO_REDIS_2026-07-14.md`
**Prioridade:** P0
**Bloqueia producao:** sim
**Status:** concluida com aceite de risco do responsavel pelo projeto

## 1. Decisao de produto definida

A EduConnect e aberta a todos os publicos, tanto para navegacao publica quanto para uso das funcionalidades disponiveis em conta. O produto nao implementara coleta de data de nascimento, declaracao de idade, age gate, dados de responsavel ou fluxo de consentimento parental no lancamento.

A conta trata todos os usuarios pelo mesmo fluxo de cadastro e pelas mesmas regras de privacidade e seguranca. O produto nao deve inferir idade a partir de comportamento, documento, dados de terceiros ou fontes externas.

Regras obrigatorias, independentemente de idade:

- Coletar somente os dados necessarios ao cadastro e ao servico.
- Manter perfis privados por padrao quando nao houver necessidade publica clara.
- Oferecer denuncia, bloqueio, exclusao e canal de privacidade para qualquer usuario.
- Proibir publicidade comportamental, venda de dados e uso de documentos pessoais sem nova aprovacao.
- Manter verificacao de professor exclusivamente para privilegios de professor; ela nao e verificacao etaria.

## 2. Limite juridico da decisao

Esta e uma decisao de Produto, nao uma conclusao juridica. A EduConnect trata nome, e-mail, credenciais, conteudos, atividades, progresso e logs de seguranca de contas. Caso uma crianca use a plataforma, esses dados sao dados pessoais de crianca mesmo que a aplicacao nao tenha coletado sua idade.

O art. 14 da LGPD exige que o tratamento de dados de criancas observe o melhor interesse e, como regra, tenha consentimento especifico de pelo menos um responsavel. Portanto, a ausencia de coleta de idade nao elimina o risco ou substitui a analise juridica. A politica so pode ser usada em producao apos aceite escrito do responsavel juridico/DPO sobre esse modelo de acesso amplo sem verificacao etaria.

Referencia oficial: [Lei 13.709/2018, art. 14](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm).

## 3. Escopo explicitamente fora do lancamento

O lancamento nao inclui verificacao de idade, consentimento parental verificavel, coleta de documento de responsavel, publicidade direcionada, compra por menor ou mensagens privadas sem controles aprovados. Qualquer funcionalidade futura que exija identificar idade ou permitir tratamento especifico de dados de criancas abre uma nova demanda de Produto, Juridico, Seguranca e Engenharia.

## 4. Dados permitidos e minimizacao

Dados permitidos no lancamento para alunos:

- Nome de exibicao.
- E-mail.
- Senha com hash ou identidade social autorizada.
- Tipo de conta.
- Turmas, atividades, respostas, progresso e preferencias necessarias ao servico.
- Logs tecnicos de seguranca e auditoria com retencao definida.

Dados permitidos para professor:

- Nome, e-mail, senha ou identidade social.
- Perfil profissional.
- Documento/evidencia de verificacao enquanto necessario para avaliacao, auditoria e prevencao a fraude.
- Conteudos, turmas, atividades e interacoes.

Dados proibidos no lancamento sem nova aprovacao:

- Dados sensiveis nao necessarios ao servico.
- Geolocalizacao precisa.
- Documento de menor.
- Dados de pagamento de menor.
- Mensagens privadas entre adulto e menor sem moderacao, controles e politica propria.
- Perfil publico pesquisavel de menor por padrao.
- Publicidade comportamental para menores.

## 5. Privacidade e exposicao publica

Requisitos para qualquer conta:

- Perfil deve ter configuracao de privacidade clara e segura por padrao.
- Imagem de perfil/capa privada deve exigir serving autenticado.
- Conteudos e comentarios devem seguir politica de moderacao e denuncia.
- URLs, metadados, Open Graph, sitemap e indexacao nao podem vazar perfis privados.

## 6. Suporte, incidentes e direitos LGPD

Antes de go-live publico, o projeto precisa ter:

- Canal de contato real para privacidade, suporte e responsaveis.
- SLA interno para pedidos de responsavel.
- Processo de acesso, correcao, portabilidade, exclusao e revogacao de consentimento.
- Runbook para incidente de privacidade, abuso ou exposicao indevida.
- Registro de decisoes e evidencias para auditoria.

## 7. Impacto no produto e demandas derivadas

Esta decisao cria ou reforca as seguintes demandas:

| Demanda | Impacto |
|---|---|
| `IDENT-01` | E-mail verificado deve ser requisito antes de privilegios relevantes. |
| `IDENT-02` | Signup deve ser idempotente e aplicar termos/privacidade sem fluxo etario. |
| `IDENT-03` | Convite deve preservar autorizacao e capacidade de turma, sem depender de gate etario. |
| `LGPD-01` | Termos, privacidade, menores e contatos precisam ser finalizados sem placeholders. |
| `LGPD-02` | Consentimento versionado deve cobrir cookies e aceite legal, sem inferir idade. |
| `LGPD-03` | Revogacao e exclusao precisam limpar DB, storage, cache e jobs. |
| `TRUST-02` | Denuncia/moderacao deve cobrir abuso e interacoes entre usuarios. |
| `SEC-03` | Suspensao/revogacao deve encerrar sessoes em todos os dispositivos. |
| `SEC-04` | Rate limit deve proteger signup, login e reenvios. |
| `SEC-05` | Perfil privado e serving de imagens devem impedir vazamento publico. |

## 8. Criterios de aceite da DEC-01

| Criterio | Status | Evidencia |
|---|---|---|
| Politica sem coleta etaria documentada | Concluido | Secoes 1, 2 e 3 deste documento |
| Dados permitidos e proibidos documentados | Concluido | Secao 5 deste documento |
| Suporte e operacao documentados | Concluido | Secao 7 deste documento |
| Aprovacao Produto | Concluido | Decisao do responsavel pelo projeto em 14/07/2026 |
| Aceite DPO/Juridico | Excecao aceita | Responsavel pelo projeto assumiu o risco em 14/07/2026 |
| Aceite Seguranca | Excecao aceita | Responsavel pelo projeto assumiu o risco em 14/07/2026 |

## 9. Registro de aprovacao

| Area | Responsavel | Status | Data | Observacao |
|---|---|---|---|---|
| Produto | Responsavel pelo projeto | Concluido | 14/07/2026 | Acesso amplo, sem coleta de idade, age gate ou consentimento parental. |
| DPO/Juridico | A definir | Excecao aceita | 14/07/2026 | Sem parecer formal; responsavel pelo projeto assumiu o risco de operar sem verificacao etaria. |
| Seguranca | A definir | Excecao aceita | 14/07/2026 | Sem parecer formal; responsavel pelo projeto assumiu o risco de abuso, privacidade e exposicao publica. |
| Engenharia | A definir | Pendente | - | Validar viabilidade tecnica e impacto nas proximas demandas. |

## 10. Decisao de go-live

O responsavel pelo projeto aprovou o escopo e aceitou os riscos residuais em 14/07/2026. A `DEC-01` esta concluida para fins do plano interno, sem parecer formal de DPO/Juridico ou Seguranca. A EduConnect nao deve declarar que possui certificacao juridica, parecer de conformidade ou aprovacao especializada para uso por criancas com base neste aceite.
