# Auditoria de producao, seguranca e escalabilidade da EduConnect

**Data da analise:** 14/07/2026<br>
**Branch analisada:** `fix/security-hardening`<br>
**Commit-base:** `f139882`<br>
**Decisao atual:** **NO-GO para producao publica com usuarios reais**<br>
**Objetivo deste documento:** transformar os riscos encontrados em demandas de engenharia, produto, seguranca, operacoes e juridico.

> Este documento substitui, para fins de decisao de go-live, os diagnosticos anteriores em `docs/`. Os documentos antigos continuam uteis como historico, mas parte deles descreve Vercel Blob, schema e estados de funcionalidades que ja nao correspondem ao codigo atual.

## 1. Resumo executivo

A EduConnect ja tem uma base funcional relevante: autenticacao por senha e Google, perfis de professor e aluno, salas, materiais, atividades, entregas, conteudos, feed, interacoes sociais, notificacoes, planejamento e verificacao de professor. O projeto tambem possui alguns controles positivos, como SQL parametrizado, bcrypt com custo 12, sanitizacao de HTML, cabecalhos de seguranca e checagens de autoria/matricula em varios fluxos.

Entretanto, a aplicacao ainda nao deve receber usuarios reais. Os principais bloqueadores sao:

| Area | Situacao | Consequencia |
|---|---|---|
| Avaliacoes | Gabaritos completos chegam ao navegador do aluno | Fraude e perda de integridade de provas, simulados e exercicios |
| Autorizacao | Operacoes de avaliacao ignoram a audiencia do conteudo | Usuario com UUID pode acessar e enviar resposta para conteudo privado/restrito |
| Redirecionamento | Existe open redirect usando barra invertida | Phishing apos login e desvio para dominio externo |
| Banco | O bootstrap documentado nao cria o schema exigido pelo runtime | Uma instalacao nova quebra em producao |
| Dependencias | `npm audit --omit=dev` encontrou 2 vulnerabilidades altas e 2 moderadas | Exposicao conhecida, inclusive no Next usado como camada de protecao de rotas |
| Sessoes | JWT de 7 dias nao e revogado ao trocar senha ou excluir a conta | Sessao roubada ou antiga continua operando |
| Uploads | Multipart e arquivos grandes sao materializados em memoria; faltam varredura e quotas | DoS, malware e esgotamento de memoria/storage |
| Infraestrutura | Compose usa servicos unicos, portas expostas e credenciais administrativas | Comprometimento total e ausencia de alta disponibilidade |
| Processamento assincrono | `after()` e usado como fila para processos criticos | Jobs podem sumir e estados podem ficar presos indefinidamente |
| Produto/IA | Existem notas de IA fabricadas, tutor simulado e promessas que nao correspondem ao runtime | Engano ao usuario, risco reputacional e juridico |
| Cadastro | Convite e campos sao perdidos; a tela afirma enviar e-mail inexistente | Fluxo principal quebrado e ausencia de verificacao de e-mail |
| LGPD/cookies | Documentos legais tem placeholders; recusar cookies nao impede Analytics | Nao conformidade antes mesmo do primeiro cadastro publico |
| Qualidade/release | Lint nao executa, build ignora erros TS, nao ha CI/CD e so ha 12 testes | Regressao sem deteccao e deploy nao auditavel |

**Regra de liberacao:** qualquer item P0 aberto mantem a decisao em `NO-GO`. Os P1 devem estar concluidos ou ter risco formalmente aceito para um piloto fechado, nunca para lancamento publico amplo.

## 2. Escopo e metodo

Foram analisados os arquivos versionados do repositorio, incluindo aplicacao Next.js, Server Actions, Route Handlers, autenticacao, acesso ao Postgres, migrations SQL, storage S3/MinIO, Docker, e-mail, IA, componentes de produto, paginas legais, scripts e documentacao.

Dimensoes aproximadas da base analisada:

- 325 arquivos versionados.
- Cerca de 46,5 mil linhas em TypeScript, TSX, SQL e scripts MJS.
- 240 arquivos TypeScript/TSX e 44 arquivos SQL.
- 126 Server Actions, 13 Route Handlers e 42 paginas identificadas pela auditoria estatica.
- Apenas 2 arquivos de teste, totalizando 12 casos.

Validacoes executadas:

| Comando | Resultado | Observacao |
|---|---|---|
| `npx tsc --noEmit` | Passou | Typecheck isolado esta verde |
| `npm run build` | Passou | O build informa que a validacao de tipos foi ignorada por `next.config.mjs:5-7` |
| `npm run test:oauth` | 5/5 passaram | Cobre somente helpers do fluxo OAuth/redirect existente |
| `npm run test:password-reset` | 7/7 passaram | Cobre somente helpers de reset |
| `npm run lint` | Falhou | `eslint: command not found`; nao ha dependencia/configuracao funcional |
| `npm audit --omit=dev --json` | Falhou o gate | 4 vulnerabilidades de producao: 2 altas e 2 moderadas |

Limitacoes desta rodada:

- Foi uma auditoria de codigo e configuracao, nao um pentest externo.
- Nao houve ambiente de staging representativo com dados e trafego.
- Nao foram executados testes integrados com Postgres e MinIO, teste de carga, chaos test, restore de backup ou verificacao de disaster recovery.
- A conformidade LGPD precisa de validacao de profissional juridico/DPO; este documento identifica lacunas tecnicas e documentais, mas nao substitui parecer juridico.
- Custos e prazos dependem da equipe, provedor cloud, volume esperado e decisoes de produto ainda abertas.

## 3. Classificacao de prioridade

| Prioridade | Definicao | Regra |
|---|---|---|
| P0 | Vulnerabilidade exploravel, perda de dados/integridade, fluxo principal falso/quebrado ou impossibilidade de operar a plataforma com seguranca | Bloqueia qualquer producao publica |
| P1 | Requisito essencial de confiabilidade, privacidade, operacao, suporte ou qualidade | Obrigatorio antes de piloto com usuarios reais, salvo aceite formal e temporario de risco |
| P2 | Necessario para crescimento previsivel, qualidade e reducao de custo operacional | Planejar para o primeiro ciclo de escala |
| P3 | Evolucao, otimizacao ou melhoria de maturidade | Executar apos estabilizacao e conforme metricas |

Tamanhos usados no backlog:

- `P`: pequena, normalmente localizada.
- `M`: media, atravessa um fluxo ou mais de uma camada.
- `G`: grande, exige arquitetura, migracao ou varias equipes.

Os tamanhos nao sao estimativas de calendario.

## 4. Arquitetura atual

### 4.1 Componentes principais

- Web full-stack: Next.js 16.2 com React 19, App Router, Server Actions e Route Handlers.
- Autenticacao: NextAuth v5 beta com sessao JWT e providers Credentials/Google.
- Banco: PostgreSQL acessado diretamente por `pg`.
- Arquivos: camada propria compativel com S3, usando MinIO no Compose.
- E-mail: Resend para recuperacao de senha.
- IA: xAI para revisao de artigo; OpenAI/xAI opcionais para triagem de documento de professor.
- Deploy local/documentado: Docker Compose com uma aplicacao, um Postgres e um MinIO.

### 4.2 Problemas estruturais da arquitetura atual

- Web, processos de background e agendamentos nao estao separados.
- O Postgres e o MinIO do Compose sao instancias unicas com volumes locais.
- Nao existe broker/fila, worker, transactional outbox ou registro duravel de jobs.
- Nao existe camada operacional de health/readiness, logs estruturados, metricas, tracing e alertas.
- Nao existe pipeline CI/CD, promocao de ambiente ou rollback automatizado.
- O runtime conecta ao banco e ao storage com credenciais excessivamente privilegiadas.
- Arquivos grandes passam pelo web tier e sao mantidos inteiros em memoria.

## 5. Controles positivos que devem ser preservados

- Queries revisadas usam parametros, sem injecao SQL evidente.
- Bcrypt usa custo 12 e o login executa comparacao com hash dummy contra enumeracao por timing (`auth.ts:15-64`).
- Reset de senha usa codigo aleatorio, hash, expiracao, limite de tentativas e lock transacional.
- Guards de paginas consultam o perfil no banco, em vez de confiar apenas no tipo gravado no JWT (`lib/auth/guards.ts:19-61`).
- Varios fluxos validam autoria, matricula na sala e professor aprovado.
- HTML rico e sanitizado no salvamento/renderizacao com DOMPurify.
- Downloads aplicam `nosniff` e politica de serving segura; bucket e tratado como privado.
- Avatar possui verificacao de assinatura real do arquivo.
- Ha CSP, HSTS, `frame-ancestors 'none'`, `X-Content-Type-Options` e Permissions Policy (`next.config.mjs:17-49`).
- A imagem final Docker executa como usuario nao-root.

Esses controles nao anulam os bloqueadores abaixo. Em particular, a autorizacao e inconsistente: algumas actions usam guards corretos e outras consultam apenas um UUID.

## 6. Demandas P0 - bloqueadores de producao

### P0-01 - Remover gabaritos de todos os payloads de aluno

**Evidencia:** `correctIndex` e armazenado dentro de `settings` (`lib/activities/exam.ts:9-16`). `listActivitiesForClassroomAsStudent` e `getActivityForStudent` retornam `select *` (`app/actions/classroom-activities.ts:198-244`). O feed retorna `ci.*` e reanexa `settings` sem projecao (`app/actions/content-items.ts:1501-1539`; `scripts/027_feed_follow_ranking.sql:3-10`).

**Risco:** o aluno pode inspecionar o payload RSC/Server Action e obter a resposta correta antes da entrega, inclusive em prova com horario futuro.

**Demanda:** separar o gabarito do documento publico. A opcao mais segura e uma tabela de respostas acessivel somente ao servidor/autor. No minimo, criar DTOs/projecoes publicas centralizadas que removam `correctIndex`, nunca usar `select *` em endpoints de aluno e impedir que `settings` bruto atravesse a fronteira servidor-cliente.

**Criterios de aceite:**

- Nenhum payload RSC, Server Action, feed, planner ou pagina de aluno contem `correctIndex` ou gabarito equivalente.
- O calculo de nota continua exclusivamente no servidor.
- Testes automatizados inspecionam o JSON/RSC de exercicio, prova e simulado antes e depois da entrega.
- Teste negativo cobre membro, nao membro, autor e aluno de outra sala.

**Tamanho:** G.

### P0-02 - Corrigir IDOR nas avaliacoes publicadas como conteudo

**Evidencia:** leitura, salvamento e envio em `app/actions/content-exercise-submissions.ts:100-158,182-275,278-425` consultam apenas ID, status e autor. Nenhum desses fluxos chama `user_can_view_content_item`, embora a funcao de autorizacao exista e seja usada em outras operacoes (`app/actions/content-items.ts:1660-1668`).

**Risco:** qualquer usuario autenticado que obtenha ou adivinhe um UUID pode ler/enviar respostas para conteudo publicado mas privado, limitado a seguidores, professores ou turmas especificas.

**Demanda:** criar uma unica politica de autorizacao para leitura e escrita de conteudo e aplica-la a todas as actions. Escrita deve validar tipo de usuario, audiencia, matricula, janela temporal, status e tentativa existente na mesma transacao.

**Criterios de aceite:**

- Matriz de autorizacao automatizada cobre autor, aluno autorizado, aluno de outra turma, professor, seguidor e usuario anonimo.
- Ler, salvar rascunho, enviar, consultar entrega e corrigir usam a mesma politica canonica.
- Respostas nao revelam se um UUID restrito existe.

**Tamanho:** M.

### P0-03 - Eliminar open redirect depois do login

**Evidencia:** `safeInternalPath` aceita `/\\evil.example` porque valida apenas `/` e `//` (`lib/auth/redirect.ts:38-43`). `new URL(next, base)` interpreta o valor como `https://evil.example/` (`app/auth/redirect/route.ts:45-51`).

**Risco:** um link de login da EduConnect pode redirecionar a vitima para phishing em dominio externo.

**Demanda:** normalizar e validar o destino contra uma origem fixa. Rejeitar barras invertidas, caracteres de controle, URLs codificadas ambiguas, esquema, hostname e caminhos que mudem de origem. `NEXT_PUBLIC_APP_URL` deve ser obrigatorio em producao; nao confiar em `Host` como fallback.

**Criterios de aceite:**

- Casos `//host`, `/\\host`, `%2f%2f`, `%5c`, controles, URL absoluta e encoding duplo sao rejeitados.
- O redirect final sempre possui exatamente a origem configurada.
- Testes unitarios e de rota cobrem todos os vetores.

**Tamanho:** P.

### P0-04 - Criar uma linha canonica e testavel de migrations

**Evidencia:** Compose e README aplicam somente `100_bootstrap_postgres.sql` e `200_app_schema_postgres.sql` (`docker-compose.yml:12-17`; `README.md:139-195`). O snapshot `200` nao contem migrations exigidas pelo runtime, incluindo OAuth, onboarding, views, reset, salvos, seguidores, notificacoes, `deleted_at`, salas publicas, limites de senha, anexos, audiencia, rate limits e runtime role. Ha dois scripts `016_*`. Rodar todos os scripts em ordem tambem falha porque migrations antigas concedem acesso a roles Supabase inexistentes, como `anon` e `authenticated` (`scripts/002_classrooms.sql:66-67,140,191`).

**Risco:** banco novo criado pela documentacao quebra em runtime. Deploy concorrente ou parcialmente aplicado pode corromper a compatibilidade entre codigo e schema.

**Demanda:** adotar um migrator unico com `schema_migrations`, versao monotona, checksum, advisory lock, transacao quando possivel e estrategia expand/contract. Gerar um baseline canonico; nao manter dois caminhos concorrentes de bootstrap.

**Criterios de aceite:**

- CI cria um Postgres vazio, aplica todas as migrations e executa smoke tests de todos os dominios.
- CI tambem testa upgrade do schema anterior suportado.
- Startup/readiness falha claramente quando a versao do schema e incompativel.
- Duas instancias tentando migrar simultaneamente nao executam a mesma migration duas vezes.
- Toda migration aplicada possui versao e checksum auditaveis.

**Tamanho:** G.

### P0-05 - Atualizar dependencias vulneraveis e fixar versoes de release

**Evidencia:** em 14/07/2026, `npm audit --omit=dev --json` reportou 4 vulnerabilidades no grafo de producao: 2 altas e 2 moderadas. O projeto usa `next@16.2.0`, com correcao indicada para `16.2.10`; os avisos incluem DoS em RSC e bypass em Proxy/Middleware. Tambem aparecem `dompurify@3.3.3`, `postcss` e `undici@7.24.7`. `next-auth` esta em range beta (`package.json:57-60`) e resolve uma versao diferente da declarada minima.

**Risco:** exploracao de falhas publicas conhecidas. O bypass de Proxy/Middleware e especialmente sensivel porque essa camada participa do gate de rotas, ainda que layouts tambem tenham guards.

**Demanda:** atualizar para versoes corrigidas compativeis, fixar o lockfile, revisar breaking changes, gerar SBOM e tornar auditoria/SCA um gate de CI. Fixar exatamente componentes beta criticos ou migrar para release estavel suportado.

**Criterios de aceite:**

- `npm audit --omit=dev` nao possui vulnerabilidade alta/critica sem excecao formal, com prazo e responsavel.
- Fluxos de auth, RSC, uploads, editor rico e build passam apos o update.
- Renovacao automatizada de dependencias abre PRs e executa o pipeline completo.

**Tamanho:** M.

### P0-06 - Revogar sessoes em eventos sensiveis e bloquear conta excluida em toda action

**Evidencia:** JWT dura sete dias (`auth.ts:78-80`). Troca de senha e exclusao atualizam somente o banco e encerram apenas a sessao atual (`app/actions/account.ts:59-64,94-100`). `getAuthedUser` confia no JWT sem consultar status (`lib/auth/user.ts:5-15`). `getProfessorActionAccess` nao verifica `deleted_at` (`lib/auth/guards.ts:64-72`).

**Risco:** token roubado ou sessao em outro dispositivo continua valido apos troca/reset de senha ou pedido de exclusao. Uma conta soft-deleted pode chamar Server Actions diretamente.

**Demanda:** usar sessoes persistidas ou `token_version/session_version` no usuario. Incrementar a versao em reset, troca de senha, exclusao, suspensao e incidente. Toda fronteira autenticada deve validar sessao e status ativo de forma centralizada.

**Criterios de aceite:**

- Reset, troca de senha, exclusao e suspensao invalidam todas as sessoes imediatamente.
- Conta excluida nao consegue executar nenhuma action, handler ou download autenticado.
- Teste com dois dispositivos comprova a revogacao.
- Existe fluxo administrativo para revogar sessoes e trilha de auditoria.

**Tamanho:** M.

### P0-07 - Proteger uploads contra DoS, malware e abuso

**Evidencia:** `/api/article-upload` chama `request.formData()` antes de autenticar (`app/api/article-upload/route.ts:13-47`). `put()` converte todo o arquivo para `Buffer` (`lib/blob.ts:101-159`). Conteudo aceita video de ate 80 MB (`app/actions/content-items.ts:43-46,1463-1485`), enquanto Server Actions tem limite de 5 MB (`next.config.mjs:11-15`). A maioria dos uploads confia em MIME/extensao e nao possui antivirus, quarentena ou quota.

**Risco:** consumo de memoria antes do auth, queda de replicas, armazenamento de malware, custo sem controle e inconsistencias funcionais de limite.

**Demanda:** autenticar antes de ler o corpo; impor limite no ingress/proxy e no handler; preferir upload direto para object storage com URL assinada, tamanho/checksum e finalizacao server-side. Enviar novos objetos a quarentena e liberar somente apos magic bytes, decodificacao segura e malware scan. Definir quotas por usuario/turma e rate limit.

**Criterios de aceite:**

- Requisicao anonima e rejeitada antes do parse multipart.
- Arquivo acima do limite e interrompido sem ser materializado inteiro em memoria.
- Arquivos executaveis, MIME divergente e malware de teste EICAR ficam indisponiveis.
- Limites de UI, ingress, API e storage sao consistentes.
- Metricas registram bytes, falhas, latencia, scan e quota sem expor PII.

**Tamanho:** G.

### P0-08 - Definir infraestrutura de producao com minimo privilegio

**Evidencia:** `docker-compose.yml:2-87` possui um Postgres e um MinIO com volumes locais, portas do host, credenciais default e um unico app com `container_name`. A aplicacao reutiliza o superuser de bootstrap do Postgres e o root do MinIO (`docker-compose.yml:64,71-79`). `scripts/040_runtime_role.sql` nao e aplicado e ainda cria role com `BYPASSRLS` e senha placeholder. Imagens Postgres/Node nao estao fixadas por digest e MinIO usa `latest`.

**Risco:** comprometimento total por vazamento de uma credencial, indisponibilidade por falha unica, perda de dados e impossibilidade de escalar replicas com seguranca.

**Demanda:** para producao, usar Postgres gerenciado com HA/PITR e pooler; object storage gerenciado com versionamento/lifecycle; rede privada; ingress TLS/CDN/WAF; secrets manager; web e worker sem estado em ao menos duas replicas quando o SLO exigir. Separar role de migration/owner da role runtime `NOSUPERUSER/NOBYPASSRLS` e criar service account S3 limitada ao bucket/prefixos necessarios.

**Criterios de aceite:**

- Banco e storage nao possuem portas administrativas publicas.
- Runtime nao cria bucket, nao altera schema e nao possui privilegios administrativos.
- Secrets nao estao em imagem, Compose, log, repositorio ou variavel publica.
- Imagens de release sao imutaveis e identificadas por digest/SHA.
- Backup, PITR e restore completo sao demonstrados em staging.

**Tamanho:** G.

### P0-09 - Substituir `after()` por processamento duravel

**Evidencia:** revisao de artigo (`app/actions/content-items.ts:935-955`), verificacao documental (`app/api/professor-verification/upload/route.ts:78-122`) e parte das notificacoes usam `after()`. Nao ha tabela de jobs, broker, worker, retry, lease, timeout global, DLQ ou replay. A chamada xAI da revisao de artigo nao tem timeout (`lib/content/review-agent.ts:102-138`).

**Risco:** restart, timeout ou scale-down perde o trabalho e deixa conteudo em `verificando` ou professor em `pending`. Jobs concorrentes podem sobrescrever revisoes mais novas.

**Demanda:** implementar transactional outbox e worker separado, conforme a secao 9. Jobs devem ser duraveis, idempotentes, versionados e observaveis.

**Criterios de aceite:**

- Confirmacao do estado de dominio e enfileiramento ocorrem na mesma transacao.
- Reiniciar web/worker nao perde jobs.
- Retry usa backoff exponencial com jitter, limite de tentativas e DLQ.
- Resultado so atualiza a versao de conteudo/documento para a qual foi criado.
- Operacao possui metricas, alerta, busca, replay e cancelamento seguros.

**Tamanho:** G.

### P0-10 - Remover IA simulada e garantias fabricadas

**Evidencia:** o preview "Revisao da IA" no editor sempre retorna notas 95/88/92 e as mesmas sugestoes depois de tres segundos (`app/dashboard/professor/criar/criar-conteudo-client.tsx:517,2761`). O tutor usa quatro respostas por palavra-chave com `setTimeout` (`app/dashboard/aluno/tutor/page.tsx:55-96`) e aparece como "Online". O onboarding afirma que IA analisa e cria plano, mas apenas salva respostas (`app/cadastro/onboarding/page.tsx:102-130`; `app/actions/student-planner.ts:531-556`). A landing promete plagio, fato, feed IA, plano adaptativo e tutor (`components/landing/features-section.tsx:39-53`).

**Risco:** falsa garantia pedagogica, de fatos e de plagio; decisao automatizada opaca; perda de confianca; possivel risco consumerista. O revisor real de artigo usa apenas conhecimento interno do LLM e publica automaticamente com score acima de 80 (`lib/content/review-agent.ts:20-47,141-175`), sem fonte ou comprovacao de plagio.

**Demanda:** escolher, por funcionalidade, entre implementar de verdade com controles e evidencias, marcar explicitamente como demonstracao, ou remover/feature-flagar. IA nao deve conceder selo factual/plagio nem publicar automaticamente sem politica de risco e avaliacao humana apropriada.

**Criterios de aceite:**

- Nenhuma nota, depoimento, estatistica ou resposta e fabricada e apresentada como real.
- Falha/indisponibilidade de IA e explicita e nao produz aprovacao.
- Existe avaliacao offline, versao de prompt/modelo, custo, rate limit, auditoria e politica de retencao.
- Claims publicos correspondem a testes de aceite e capacidade efetivamente ativa.

**Tamanho:** G, ou P para remover/feature-flagar antes do lancamento.

### P0-11 - Corrigir cadastro, verificacao de e-mail e convite

**Evidencia:** o cadastro le `codigoConvite`, mas nao o usa (`app/cadastro/page.tsx:52-67`); `PendingInviteHandler` e um placeholder (`components/dashboard/pending-invite-handler.tsx:5-14`). Data de nascimento, escolaridade, niveis e bio sao coletados, mas o payload envia somente nome, e-mail, senha, tipo e interesses (`app/cadastro/page.tsx:72-80,147-157`). O cliente aceita senha de 6 e o servidor exige 8 (`app/cadastro/page.tsx:122-127`; `app/api/auth/signup/route.ts:9-17`). A tela afirma que enviou e-mail de ativacao, mas nenhum e-mail/token e criado e o usuario ja e autenticado (`app/cadastro/page.tsx:167-204,620-653`). Conta, auto-login e documento do professor sao etapas separadas sem compensacao.

**Risco:** aluno convidado nao entra na sala, dados obrigatorios somem, mensagens sao falsas, contas sem e-mail verificado podem abusar do sistema e falha no upload deixa conta parcial/confusa.

**Demanda:** redesenhar signup como state machine idempotente. Persistir somente campos realmente necessarios, com consentimento/base legal; unificar validacao; verificar e-mail antes de privilegios de risco; preservar o convite por cadastro, verificacao, login e onboarding; permitir retomada segura da verificacao de professor.

**Criterios de aceite:**

- E2E comprova que um novo aluno entra exatamente uma vez na sala do convite.
- Todos os campos exibidos sao persistidos ou removidos do formulario.
- Mensagens descrevem apenas eventos realmente executados.
- E-mail e validado com token expiravel, single-use, rate limit e reenvio.
- Falha em login/upload permite retomar sem conta duplicada.

**Tamanho:** G.

### P0-12 - Regularizar LGPD, menores, cookies e documentos legais

**Evidencia:** politica e termos ainda se declaram modelo/rascunho e contem placeholders de razao social, CNPJ, endereco, DPO, cidade e contato (`app/(legal)/privacidade/page.tsx:17,31-34,89,121`; `app/(legal)/termos/page.tsx:16,90,95`). A politica descreve Vercel Blob, enquanto o runtime usa S3/MinIO. O consentimento grava apenas `localStorage`, mas `<Analytics />` sempre e montado, mesmo apos "Recusar" (`components/legal/cookie-consent.tsx:12-29`; `app/layout.tsx:61-65`). A plataforma coleta/visa estudantes e menciona menores, mas nao possui age gate, consentimento de responsavel ou fluxo parental. So existe `terms_accepted_at`, sem versao/hash dos documentos. Nao ha exportacao/portabilidade.

**Risco:** tratamento sem transparencia/consentimento demonstravel, analytics sem escolha efetiva, incapacidade de atender titulares e risco elevado com criancas/adolescentes e documentos de identidade de professores.

**Demanda:** concluir revisao juridica e tecnica antes de abrir cadastro. Definir controlador/DPO/canais, bases legais, operadores reais, retencao, direitos, menores e transferencia internacional. Implementar consentimento versionado e revogavel, CMP que realmente controle analytics, exportacao, exclusao completa e registro auditavel. Produzir ROPA e DPIA para menores, IA e verificacao documental.

**Criterios de aceite:**

- Nenhum texto legal possui placeholder ou fornecedor incorreto.
- Rejeitar/revogar analytics impede carregamento e envio, comprovado em teste de rede.
- Aceite registra versao/hash/data/fonte e suporta reconsentimento.
- Fluxos de acesso, correcao, portabilidade e exclusao possuem prazo, dono e evidencias.
- Estrategia para menores e aprovada por juridico/DPO e implementada antes de aceita-los.

**Tamanho:** G e multidisciplinar.

## 7. Demandas P1 - essenciais antes de piloto real

### 7.1 Seguranca, identidade e abuso

| ID | Demanda | Evidencia/risco | Criterio de aceite | Tam. |
|---|---|---|---|---|
| SEC-13 | Tornar verificacao de professor uma decisao confiavel | LLM aprova automaticamente com confianca `>= 0,75` (`lib/professor-verification/analyze.ts:181-205`), sem fonte autoritativa, antifraude ou backoffice | IA apenas tria; aprovacao humana ou fonte qualificada; RBAC, auditoria, dupla checagem para excecao, cooldown, quota e recurso | G |
| SEC-14 | Fortalecer rate limiting e anti-enumeracao | Signup confia no primeiro `X-Forwarded-For` e revela e-mail duplicado (`app/api/auth/signup/route.ts:19-28,81-83`); login usa bucket de e-mail, permitindo lockout direcionado; reset tem resposta generica, mas trabalho muito diferente para conta existente (`app/api/auth/password-reset/request/route.ts:93-151`); limiter e fail-open (`lib/security/rate-limit.ts:16-40`) | IP vem do proxy confiavel; limites por IP+conta+acao+global; mensagens e tempos nao revelam conta; fallback seguro em auth; teste distribuido, de timing e metrica de bloqueio | M |
| SEC-15 | Cobrir endpoints caros e sociais | Upload, share anonimo, convite, IA e verificacao nao possuem quota suficiente; `recordContentShare` cria evento sem rate limit (`app/actions/content-items.ts:2120-2146`) | Quotas/rate limits documentados, resposta 429 padrao, protecao de custo e retencao dos buckets | M |
| SEC-16 | Criar moderacao e administracao | Nao existe denuncia, bloqueio, fila de conteudo, suspensao, admin RBAC ou apelo, embora os termos prometam remocao/suspensao | Backoffice minimo, papeis separados, audit log imutavel, denuncia/bloqueio, SLA e recurso | G |
| SEC-17 | Restringir perfil privado e reviews | Qualquer autenticado acessa imagem de perfil privado (`app/api/profile-image/route.ts:33-48`); reviews podem expor nome/avatar sem relacao | Politica de relacionamento explicita, autorizacao por recurso, teste de scraping/IDOR e minimizacao de dados | M |
| SEC-18 | Validar URLs publicas | `websiteUrl` pode aceitar esquemas nao HTTP(S) (`app/actions/profile.ts:57`) | Normalizar com `URL`, allowlist `https/http`, adicionar `rel` seguro e testes para `javascript:`, `data:` e controles | P |
| SEC-19 | Endurecer navegador e erros | CSP usa `unsafe-inline` (`next.config.mjs:19-25`); global error pode exibir mensagem/stack | CSP com nonce/hash quando viavel; erros publicos opacos com correlation ID; detalhes apenas no observability backend | M |
| SEC-20 | Gerir e rotacionar secrets | Historico de auditoria registra que credenciais ja apareceram em arquivos locais; nao ha secrets manager nem rotina | Revogar/reemitir todas as credenciais suspeitas sem publicar valores; inventario, rotacao, owner, scanner de secret no CI e no historico | M |

### 7.2 Banco, consistencia e ciclo de vida de dados

| ID | Demanda | Evidencia/risco | Criterio de aceite | Tam. |
|---|---|---|---|---|
| DATA-01 | Migrator seguro de deploy | `scripts/apply-sql.mjs:89-133` desabilita verificacao TLS e executa statement a statement sem ledger/lock/transacao | TLS verificado, checksum, lock, transacao, dry-run, logs e rollback/roll-forward documentado | G |
| DATA-02 | Tornar publicacao atomica | Conteudo e audiencia de salas usam update/delete/insert fora de transacao (`app/actions/content-items.ts:72-79,935-943`) | Uma transacao confirma estado+audiencia+outbox; falha deixa estado anterior intacto | M |
| DATA-03 | Corrigir corridas e idempotencia | Capacidade da sala faz count+insert sem lock (`scripts/200_app_schema_postgres.sql:109-129`); views e fan-out fazem select+insert; notificacao de entrega pode ocorrer mesmo quando update concorrente afetou zero linhas (`lib/notifications/event.ts:40-58`; `app/actions/content-exercise-submissions.ts:338-423`) | Constraints unicas, checagem de row count, lock/CAS ou transacao serializavel onde necessario; testes concorrentes provam ausencia de matricula, evento e notificacao duplicados | M |
| DATA-04 | Configurar pool e timeouts | Pool define basicamente `max` (`lib/db/pool.ts:23-38`); conexoes crescem por replica | Pooler, budget global, connect/idle/query/statement/lock timeouts, max lifetime, error listener e metricas | M |
| DATA-05 | Definir indices por workload | Bootstrap nao inclui todos os indices de `009`; feed/ranking/busca possuem queries pesadas | `EXPLAIN (ANALYZE, BUFFERS)` e load test justificam cada indice; regressao de query no CI/staging | M |
| DATA-06 | Implementar retencao e particionamento | Views, shares, notificacoes, rate limits e reset codes crescem sem politica operacional | Matriz de retencao aprovada, jobs em lotes, indices por data, particionamento quando medido e evidencias de purge | M |
| DATA-07 | Excluir objetos junto com entidades | Exclusao de conteudo/conta apaga DB, mas nao inventaria todos os blobs; `del()` engole falhas (`lib/blob.ts:227-241`) | Ledger/outbox de objetos, worker idempotente, reconciliador DB x bucket, lifecycle e relatorio de conclusao | G |
| DATA-08 | Corrigir metricas e contadores | Views usam select+insert sem unique; share anonimo pode inflar contagem; perfil calcula total sobre lista limitada | Definicao de metrica, dedup atomica, agregacao real e testes de concorrencia/abuso | M |

### 7.3 Confiabilidade e operacoes

| ID | Demanda | Evidencia/risco | Criterio de aceite | Tam. |
|---|---|---|---|---|
| OPS-01 | Validar ambiente no startup | `.env.production.example` omite URL publica, cron, remetente, pool, regiao/path style e providers; `NEXT_PUBLIC_APP_URL` pode ser compilada com fallback localhost (`Dockerfile:16-18`); falhas aparecem tardiamente | Schema tipado separado para build/runtime, variaveis obrigatorias por feature, build falha sem URL publica valida e startup falha sem imprimir secrets | M |
| OPS-02 | Adicionar health e readiness | Nao ha rota de health, app healthcheck ou verificacao de schema/dependencias | Liveness nao depende de terceiros; readiness valida DB/schema e capacidade; deploy e LB usam os probes | P/M |
| OPS-03 | Implantar observabilidade | Nao ha logs JSON, error tracking, metricas, tracing, request ID, dashboards, alertas ou SLO | Correlation ID web-job, logs sem PII/secrets, tracing, metricas RED/USE, alertas acionaveis e dashboard de negocio | G |
| OPS-04 | Criar CI obrigatoria | Nao ha `.github/workflows`; lint falha; build ignora tipos | Install limpa, lint, format check, typecheck, unit, integration, migration fresh/upgrade, E2E, build, SCA, secret scan e imagem | G |
| OPS-05 | Criar CD seguro | Nao ha promocao, migration one-off, rollout, smoke ou rollback | Artefato imutavel promovido; migration com lock; canary/rolling; smoke; rollback de app e estrategia expand/contract | G |
| OPS-06 | Operacionalizar backups e DR | Compose usa volume local; nao ha PITR, copia externa, restore drill, RPO/RTO | RPO/RTO aprovados, backups criptografados, restore periodico medido, runbook e owner de incidente | G |
| OPS-07 | Operacionalizar scheduler | Rota de purge existe, mas nao ha scheduler/config de `CRON_SECRET`; query e ilimitada | Scheduler autenticado, lotes, locks, idempotencia, historico, metrica, alerta e retry | M |
| OPS-08 | Tornar e-mail duravel | Resend e chamado sincronicamente sem timeout/retry/idempotency; reset confirma o codigo no DB antes do envio e, em falha, apenas o invalida (`lib/email/resend.ts:8-35`; `app/api/auth/password-reset/request/route.ts:109-151`) | Outbox/fila de e-mail, timeout, retry/DLQ, idempotency key, status de entrega/webhook e reenvio seguro sem emitir codigos concorrentes | M |
| OPS-09 | Preparar resposta a incidentes | Nao ha runbooks, on-call, classificacao ou processo de vazamento | Runbooks para auth, DB, storage, fila, IA e LGPD; contatos, exercicio tabletop e postmortem | M |

### 7.4 Produto e experiencia

| ID | Demanda | Evidencia/risco | Criterio de aceite | Tam. |
|---|---|---|---|---|
| PROD-01 | Fazer preferencias controlarem eventos reais | UI salva chaves como `emailAlerts` e `weeklyDigest`; backend le apenas `new_content` (`components/dashboard/*-settings-client.tsx`; `lib/notifications/event.ts:49-56`) | Catalogo de eventos/canais, preferencias por evento, defaults versionados e teste que cada toggle muda o comportamento | G |
| PROD-02 | Completar notificacoes e links | Nao ha evento operacional para atividade/material/prazo; links so resolvem parte dos tipos | Atividade, material, prazo, entrega, correcao e follow possuem dedup, destino correto e estado de leitura | M |
| PROD-03 | Criar backoffice de verificacao | Hoje analise manual depende de SQL/documentacao; rejeitado pode cair em troca de tipo | Fila com preview seguro, decisao, motivo, auditoria, reenvio, apelo e SLA | G |
| PROD-04 | Validar conteudo por tipo | Artigo pode seguir sem corpo (`app/actions/content-items.ts:914`); regras estao espalhadas | Schemas server-side por tipo, invariantes de publicacao e mensagens consistentes | M |
| PROD-05 | Remover numeros, depoimentos e links falsos | Landing mostra 10k professores, 150k alunos, 500k aulas, "milhares", depoimentos estaticos e footer para rotas inexistentes (`components/landing/hero-section.tsx:58-71`; `components/landing/footer.tsx:4-34`) | Dados vem de fonte comprovavel ou sao removidos; placeholders identificados; nenhum link publico retorna 404/# sem funcao | P/M |
| PROD-06 | Definir suporte e operacao do usuario | Footer promete contato/ajuda/FAQ inexistentes | Canal real, politica de atendimento, triagem, SLA, base minima e escalacao de seguranca/LGPD | M |
| PROD-07 | Resolver funcionalidades visivelmente mockadas | Progresso exibe "Mockup"; busca global e decorativa; professor mostra aviso obsoleto | Remover/ocultar ou entregar com aceite funcional; estados vazios/erro nao simulam sucesso | M |
| PROD-08 | Decidir modelo comercial | Ha link de precos, mas nao existe billing, entitlement ou webhook | Se pago: provider, checkout, webhook idempotente, entitlement, nota/reembolso e conciliacao; se gratuito: remover promessa/precos | G ou P |
| PROD-09 | Implementar agendamento de publicacao | Nao existe `publish_at`/estado agendado; actions atuais publicam imediatamente e `after()` nao e scheduler | UI com timezone explicito, estado `scheduled`, job duravel deduplicado, cancelamento/reagendamento, publicacao atomica e teste de horario de verao/retry | M |

## 8. Demandas P2/P3 - escala e maturidade

| ID | Pri. | Demanda | Evidencia/resultado esperado |
|---|---|---|---|
| SCALE-01 | P2 | Paginar feeds, comentarios, salvos e notificacoes por cursor | Feed limita 20/30, salvos 50 e comentarios carregam tudo; evitar `OFFSET` profundo e telas falsamente vazias |
| SCALE-02 | P2 | Mover filtros/paginacao para SQL | Lista de alunos carrega todos e pagina em memoria (`app/actions/classrooms.ts:376-486`) |
| SCALE-03 | P2 | Otimizar ranking e busca de professores | Agregacoes/top sao recalculados por request (`app/actions/professors.ts:34-50,96-146`) |
| SCALE-04 | P2 | Servir arquivos por CDN/URL assinada | Downloads passam pelo Next, sem Range/ETag; web tier vira gargalo de banda e video |
| SCALE-05 | P2 | Upload multipart/streaming direto | Evitar buffers de 80 MB por request e suportar retomada/checksum |
| SCALE-06 | P2 | Cachear apenas apos medir | Paginas dinamicas repetem queries; definir ownership, TTL, invalidacao e protecao contra stampede |
| SCALE-07 | P2 | Corrigir tratamento de erro | Varias queries retornam `[]` em indisponibilidade; diferenciar vazio, erro e retry; S3 outage nao deve virar 404 silencioso |
| SCALE-08 | P2 | Acessibilidade WCAG 2.1 AA | Contraste baixo, drawers sem focus trap/Escape, botoes sem nome, ausencia de skip link e reduced motion |
| SCALE-09 | P2 | SEO tecnico | Remover `generator: v0.app`; metadata dinamica, canonical, OG, sitemap, robots e manifest |
| SCALE-10 | P2 | Otimizar imagens | `images.unoptimized: true` transfere custo ao cliente (`next.config.mjs:8-10`) |
| SCALE-11 | P2 | Refatorar modulos gigantes | Editor tem ~2.927 linhas, actions de conteudo ~2.199; separar dominio, repositorio, servico, DTO e UI |
| SCALE-12 | P2 | Reduzir `any` e codigo morto | Auditoria encontrou ~182 `any` e dezenas de componentes UI sem uso; reforcar lint e boundaries |
| SCALE-13 | P2 | Corrigir UX de erro/loading/not-found | Nao ha cobertura consistente de `error.tsx`, `loading.tsx`, retry e paginas 404 por segmento |
| SCALE-14 | P3 | Materializar agregados seletivos | Usar somente apos perfil de carga; manter estrategia de refresh e consistencia |
| SCALE-15 | P3 | Particionar tabelas de evento | Adotar quando volume/retencao comprovarem necessidade, nao preventivamente |
| SCALE-16 | P3 | Avaliar broker dedicado | Migrar de fila no Postgres quando throughput, isolamento ou operacao justificarem |

## 9. Arquitetura de filas recomendada

### 9.1 Por que `after()` nao e uma fila

`after()` adia trabalho para depois da resposta, mas continua ligado ao ciclo de vida da mesma instancia. Ele nao oferece persistencia, reserva/lease, retry, backoff, dead-letter, limite de concorrencia, deduplicacao, replay ou garantia de que o processo sobrevivera a restart e scale-down. Portanto, pode ser usado somente para trabalho descartavel. Revisao, verificacao, e-mail, notificacao e purge nao sao descartaveis.

### 9.2 Estrategia indicada para o primeiro lancamento

Como a EduConnect ja depende fortemente de Postgres, a menor mudanca operacional e iniciar com uma fila duravel baseada no Postgres ou um servico gerenciado equivalente, sempre com **transactional outbox**. Um broker dedicado pode ser introduzido depois sem mudar os contratos dos produtores.

Fluxo recomendado:

1. A transacao de negocio altera o dominio e grava um evento em `outbox_events`.
2. Um dispatcher com `FOR UPDATE SKIP LOCKED` publica/converte o evento em job e marca a outbox de modo idempotente.
3. Worker separado reserva o job com lease e heartbeat.
4. Handler verifica `dedup_key`, versao do agregado e estado atual antes de produzir efeitos.
5. Sucesso registra resultado e metricas; falha temporaria agenda retry com backoff+jitter.
6. Falha permanente ou tentativas esgotadas move para DLQ e abre alerta.
7. Operador autorizado inspeciona e reprocessa sem editar SQL manualmente.

Semantica correta: **at-least-once + handlers idempotentes**. Nao prometer "exactly once".

### 9.3 Contrato minimo de job

Cada job deve possuir:

- `id`, `queue`, `event_type` e `schema_version`.
- `aggregate_id` e `aggregate_version`.
- `dedup_key` com constraint unica quando aplicavel.
- Payload minimo, sem segredo e com referencia a PII em vez de copia desnecessaria.
- `status`, `priority`, `available_at`, `attempts` e `max_attempts`.
- `lease_owner`, `lease_expires_at`, heartbeat e timeout.
- `created_at`, `started_at`, `finished_at`, `last_error_code` e correlation/trace ID.
- Politica explicita de retencao e redacao de erro.

### 9.4 Filas necessarias

| Fila | Produtor | Efeito | Deduplicacao/versionamento |
|---|---|---|---|
| `content.review` | Pedido de publicacao de artigo | Chamar provedor, persistir revisao e decidir proximo estado | `content_id:content_version:policy_version` |
| `content.publish` | Aprovacao/agendamento | Publicar e emitir evento de novidade | `content_id:content_version:publish` |
| `professor.verify` | Upload finalizado e limpo | Triar documento; nunca conceder privilegio sem politica aprovada | `profile_id:document_version` |
| `email.send` | Reset, verificacao, convite e alertas | Enviar e acompanhar delivery | `template:recipient:business_event_id` |
| `notification.fanout` | Evento de dominio | Fan-out paginado para seguidores/turma | `event_id:recipient_id` |
| `media.scan` | Upload em quarentena | Magic bytes, decode, AV, metadata e liberacao | `object_key:checksum:scanner_version` |
| `account.purge` | Fim do periodo de recuperacao | Apagar DB, objetos, cache e registrar evidencia | `user_id:deletion_request_version` |
| `maintenance.cleanup` | Scheduler | Limpar rate limits, tokens, eventos e jobs por retencao | `job_type:period_bucket` |

### 9.5 Requisitos operacionais das filas

- Worker e processo/imagem separados do web, com escalabilidade e limites proprios.
- Concorrencia por fila e por provedor para impedir estouro de DB/API/custo.
- Timeout e circuit breaker em toda chamada externa.
- Retry apenas para erros classificados como temporarios.
- DLQ com alerta por idade, quantidade e taxa.
- Metricas: backlog, job mais antigo, throughput, latencia, tentativas, falhas, DLQ e custo por tipo.
- Painel de operacao com RBAC e audit log para replay/cancelamento.
- Testes de kill/restart provam recuperacao de lease e ausencia de efeito duplicado.

## 10. Arquitetura alvo escalavel

```text
Internet
  -> DNS + CDN/WAF + TLS + rate limiting de borda
  -> Load balancer
      -> Web Next.js stateless (N replicas, sem arquivos locais)
          -> Pooler de conexoes
              -> PostgreSQL gerenciado HA + PITR
          -> Object storage privado via URLs assinadas/CDN
          -> Transactional outbox no PostgreSQL
      -> Worker stateless (replicas e concorrencia por fila)
          -> Fila duravel/outbox
          -> E-mail / IA / scanner / storage
      -> Scheduler gerenciado

Web + Worker
  -> Logs estruturados + error tracking + metricas + tracing
  -> Secrets manager + KMS

Operacao
  -> Backoffice com RBAC + audit log
  -> CI/CD com artefato imutavel, migrations e rollback
```

Principios:

- Web sem estado; nunca depender de `/tmp` em producao.
- Banco como fonte de verdade, com constraints e transacoes, nao apenas validacao de UI.
- Credencial de migration separada do runtime.
- Objetos privados, criptografados, versionados e com lifecycle; aplicacao nao usa root.
- Upload e download grandes fora do web tier sempre que a autorizacao permitir.
- Toda integracao externa tem timeout, budget, retry controlado e circuit breaker.
- Escala horizontal somente depois de definir budget de conexoes e idempotencia.
- Cache, replica de leitura e particionamento entram por evidencia de carga.

## 11. Banco e migrations - desenho recomendado

Sequencia para sair do estado atual:

1. Inventariar tabelas, funcoes, triggers, indices e grants realmente usados pelo commit de release.
2. Criar um baseline canonico para banco vazio.
3. Converter alteracoes posteriores em migrations monotonicamente versionadas; resolver o prefixo duplicado `016`.
4. Remover grants Supabase obsoletos ou criar migrations condicionais explicitas por plataforma.
5. Criar `schema_migrations(version, checksum, applied_at, execution_ms, app_version)`.
6. Executar migration em job one-off privilegiado com advisory lock.
7. Runtime usa role sem owner, superuser, create schema, create bucket ou bypass de politica.
8. Adotar expand/contract: primeiro adicionar/dual-read-write quando necessario, depois remover em release posterior.
9. Testar banco vazio e upgrade em CI a cada PR.
10. Guardar dump logico e restaurar em ambiente isolado como parte do drill, sem usar dump como migrator.

Nao se deve simplesmente adicionar todos os arquivos `001` a `040` ao entrypoint atual. Isso preservaria grants legados, ordem ambigua e ausencia de ledger.

## 12. Storage e privacidade de arquivos

Lacunas atuais adicionais:

- `get()` transforma qualquer erro S3 em `null`, fazendo outage parecer 404 (`lib/blob.ts:205-220`).
- `del()` ignora toda falha (`lib/blob.ts:227-241`).
- A aplicacao tenta criar bucket em runtime e engole erro de permissao (`lib/blob.ts:83-99`).
- Downloads passam pelo Next com `cache-control: private`, sem `Range` e ETag consistente.
- Exclusao de `content_items` nao apaga todos os objetos relacionados.
- Purge de conta nao enumera avatares, documentos, artigos, materiais e entregas.
- Documento de professor pode ficar retido indefinidamente e e enviado em base64 a provedor de IA.

Politica alvo:

- Provisionar bucket fora da aplicacao.
- Prefixos e service accounts por finalidade/ambiente.
- Upload direto para quarentena, checksum obrigatorio e finalize endpoint autenticado.
- Scanner/decoder assincro; somente objeto `clean` pode ser servido.
- Criptografia, versionamento e lifecycle por classe de dado.
- Retencao curta e explicita para documento de verificacao; apagar apos decisao/prazo legal.
- Inventario e reconciliacao periodica de objetos orfaos.
- Exclusao duravel via outbox, com prova de conclusao.
- CDN/URL assinada curta e vinculada ao recurso, sem tornar bucket publico.

## 13. Observabilidade, SLO e capacidade

Antes do piloto, definir pelo menos:

- SLI/SLO de disponibilidade e latencia por fluxo: login, feed, abrir sala, enviar atividade, publicar e baixar material.
- SLO separado de processamento assincrono: idade maxima de revisao, verificacao, e-mail e notificacao.
- Error budget e regra de congelamento de release.
- RPO/RTO de banco e objetos.
- Budget de conexoes: `replicas web x pool web + replicas worker x pool worker + operacao`, abaixo do limite do pooler/banco.
- Limite de payload, arquivo, armazenamento, turmas, membros, fan-out e chamadas de IA por plano/usuario.
- Testes de carga com distribuicao realista e `EXPLAIN ANALYZE`, nao apenas requests de homepage.

Alertas minimos:

- Taxa de 5xx, latencia p95/p99 e saturacao.
- Erros/espera do pool, locks longos, slow queries, conexoes e espaco.
- Backlog e idade do job mais antigo; DLQ e retries.
- Erros/latencia/custo de S3, Resend e IA.
- Falha de backup/restore, scheduler e purge.
- Picos de signup/login/reset/upload/share e bloqueios de rate limit.
- Vulnerabilidade alta/critica ou secret detectado.

## 14. Estrategia de testes necessaria

### 14.1 Piramide minima

- Unitarios: parsers, schemas, politicas, state machines, calculos, DTOs e idempotencia.
- Integracao com Postgres real: migrations, constraints, transacoes, concorrencia, autorizacao e queries.
- Integracao com S3/MinIO: upload, scan, serving, Range, exclusao, outage e reconciliacao.
- Contrato: Resend e provedores de IA com timeouts, erros e payloads versionados.
- E2E/Playwright: jornadas por papel e testes de payload/autorizacao.
- Acessibilidade automatizada com axe mais revisao manual de teclado/leitor.
- Performance/carga: feed, fan-out, sala grande, upload/download e submissao simultanea.
- Seguranca: SAST, SCA, secret scan, container scan, DAST em staging e pentest antes do lancamento amplo.

### 14.2 Casos obrigatorios de E2E/integracao

- Cadastro por senha, verificacao de e-mail, OAuth e conflito seguro de identidade.
- Convite sobrevive a cadastro/login/onboarding e matricula exatamente uma vez.
- Reset/troca/exclusao revogam sessoes em todos os dispositivos.
- Matriz de acesso a conteudo por visibilidade, audiencia, turma, follow e papel.
- Nenhum gabarito aparece no navegador; nota e calculada no servidor.
- Prazo, inicio, encerramento, dupla submissao e correcao concorrente.
- Professor pendente/rejeitado/aprovado, reenvio, revisao manual e suspensao.
- Publicacao atomica com audiencia e outbox; retry nao duplica notificacao.
- Upload anonimo, excesso, MIME falso, malware, timeout, cancelamento e quota.
- Exclusao LGPD remove banco, storage, cache e jobs/PII conforme politica.
- Banco vazio e upgrade de schema suportado.
- Restart de worker durante job; lease expira e o efeito acontece uma vez do ponto de vista do negocio.
- Analytics ausente quando recusado e apos revogacao.

### 14.3 Gates de pull request/release

O pipeline deve falhar com:

- Lint, format ou typecheck invalido.
- Teste unitario/integrado/E2E critico invalido.
- Migration que nao aplica em banco vazio ou no upgrade suportado.
- Build que precise de `ignoreBuildErrors`.
- Vulnerabilidade alta/critica sem waiver aprovado e expiravel.
- Secret, imagem critica vulneravel ou licenca proibida.
- Queda de cobertura nas politicas de autorizacao e state machines criticas.

## 15. Roteiro recomendado

### Fase 0 - interromper riscos e criar verdade de release

Objetivo: sair do estado `NO-GO` tecnico mais grave.

- P0-01 gabaritos.
- P0-02 IDOR.
- P0-03 open redirect.
- P0-04 migrations canonicas.
- P0-05 dependencias.
- P0-06 sessoes/conta ativa.
- P0-07 auth e limites de upload imediatos; quarentena pode continuar na fase seguinte se cadastro publico permanecer fechado.
- Remover/feature-flagar IA e marketing falsos.
- Instalar lint, remover `ignoreBuildErrors` e criar CI inicial.

### Fase 1 - piloto interno/fechado

Objetivo: operar com poucos usuarios autorizados e capacidade de detectar/recuperar falhas.

- Infra gerenciada, roles minimas, secrets manager e ambientes isolados.
- Outbox, worker e filas de review, verificacao e e-mail.
- Health/readiness, logs, error tracking, metricas e alertas.
- Signup/verificacao de e-mail/convite idempotentes.
- Backoffice de professor, moderacao e suporte minimo.
- Upload quarantine/scan/quota e purge de objetos.
- Textos legais finais, consentimento real e estrategia de menores.
- Backup/PITR e primeiro restore drill.
- E2E de jornadas criticas e teste de autorizacao.

### Fase 2 - lancamento controlado

Objetivo: abrir para publico dentro de limites conhecidos.

- Filas de notificacao, media e manutencao completas.
- SLO, on-call, runbooks, incident response e status operacional.
- CI/CD com rollout, smoke, rollback e artefato imutavel.
- Paginacao por cursor, indices medidos e pooler configurado.
- URLs assinadas/CDN e arquivos grandes fora do web tier.
- Claims/funcionalidades/planos comerciais alinhados ao que esta ativo.
- Teste de carga, DAST e pentest independente com achados altos fechados.

### Fase 3 - escala orientada por metricas

Objetivo: crescer sem antecipar complexidade desnecessaria.

- Cache seletivo, agregados materializados e eventual replica de leitura.
- Particionamento/arquivamento por volume e retencao.
- Autoscaling de web/worker por latencia e backlog.
- Avaliar broker dedicado se Postgres deixar de atender throughput/isolamento.
- Chaos/DR drills recorrentes e revisao de arquitetura/custo.

## 16. Checklist de go-live

### Seguranca e privacidade

- [ ] Todos os P0 estao fechados e retestados.
- [ ] Nao ha gabarito em payload de aluno.
- [ ] Matriz de autorizacao passou para todos os papeis/audiencias.
- [ ] Sessoes sao revogaveis; conta excluida/suspensa perde acesso imediato.
- [ ] Dependencias, imagem e secrets scans atendem a politica.
- [ ] Uploads usam auth pre-parse, limites, quarentena, scan e quotas.
- [ ] Pentest nao possui achado alto/critico aberto.
- [ ] Textos LGPD/cookies/termos foram aprovados e nao contem placeholder.
- [ ] Analytics respeita recusa e revogacao.
- [ ] Fluxo de menores esta decidido e implementado.

### Dados e confiabilidade

- [ ] Banco vazio e upgrade passam no CI.
- [ ] Runtime DB/S3 usa minimo privilegio.
- [ ] Publicacao, audiencia e outbox sao atomicas.
- [ ] Jobs possuem retry, DLQ, idempotencia, versionamento e painel.
- [ ] Backup e restore foram testados; RPO/RTO sao conhecidos.
- [ ] Purge remove DB e objetos e gera evidencia.
- [ ] Pool/timeouts/indices foram validados em carga.

### Operacao

- [ ] Staging e representativo e isolado de producao.
- [ ] CI/CD, rollout, smoke e rollback foram ensaiados.
- [ ] Health/readiness alimentam LB e deploy.
- [ ] Dashboards, alertas, on-call e runbooks estao ativos.
- [ ] Scheduler e jobs de manutencao possuem historico/alerta.
- [ ] Logs nao contem senha, token, documento, corpo de IA ou PII desnecessaria.

### Produto

- [ ] Cadastro, e-mail, OAuth, convite e retomada de professor passam E2E.
- [ ] Funcionalidades simuladas estao removidas, rotuladas ou reais.
- [ ] Nenhuma estatistica, review, nota de IA ou depoimento e fabricado.
- [ ] Preferencias de notificacao alteram o comportamento real.
- [ ] Backoffice, denuncia, bloqueio, moderacao e suporte estao operacionais.
- [ ] Links publicos, acessibilidade critica, SEO e mensagens de erro foram revisados.
- [ ] Modelo gratuito/pago e capacidades por plano estao definidos.

## 17. Backlog consolidado sugerido

Ordem recomendada de epicos:

| Ordem | Epico | Itens principais | Dependencias |
|---|---|---|---|
| 1 | E01 Integridade de avaliacoes | P0-01, P0-02, DTO publico, tabela de gabarito, matriz de auth | Nenhuma |
| 2 | E02 Auth e seguranca imediata | P0-03, P0-05, P0-06, SEC-14, SEC-18 | Migrations para session version |
| 3 | E03 Schema e acesso minimo | P0-04, DATA-01, role runtime, CI de banco | Escolha do migrator/provedor DB |
| 4 | E04 Pipeline de release | OPS-04, OPS-05, lint, type gate, SCA/secret/container scan | E03 para migrations no CD |
| 5 | E05 Upload e storage seguro | P0-07, DATA-07, quarentena, AV, signed URLs | Object storage de producao |
| 6 | E06 Jobs duraveis | P0-09, outbox, worker, review/e-mail/verify | E03 e observabilidade basica |
| 7 | E07 Cadastro e identidade | P0-11, verificacao de e-mail, convite, retomada | E02 e fila de e-mail |
| 8 | E08 LGPD e menores | P0-12, consentimento, exportacao, purge, DPIA | Juridico/DPO, E05/E06 |
| 9 | E09 Operacao de producao | P0-08, OPS-01/02/03/06/07/09 | Provedor cloud e SLO |
| 10 | E10 Trust & Safety | SEC-13/16/17, backoffice, denuncia, bloqueio | E02, E06, juridico |
| 11 | E11 Verdade de produto | P0-10, PROD-04/05/07/08/09 | Decisoes de produto |
| 12 | E12 Notificacoes confiaveis | PROD-01/02, fan-out, e-mail | E06 |
| 13 | E13 Escala e UX | SCALE-01 a SCALE-13 | Metricas/carga reais |

## 18. Modelo para criar cada demanda

Use este formato no issue tracker:

```markdown
# [ID] Titulo orientado a resultado

## Problema
Comportamento atual, usuario afetado e impacto.

## Evidencia
Arquivos/linhas, logs, query plan, screenshot ou teste que reproduz.

## Escopo
O que sera alterado e o que fica explicitamente fora.

## Riscos
Seguranca, dados, compatibilidade, custo e rollback.

## Criterios de aceite
- Cenario observavel e testavel.
- Casos de erro e concorrencia.
- Autorizacao por papel/audiencia.
- Telemetria e runbook quando operacional.

## Plano de teste
Unitario, integracao, E2E, carga ou seguranca aplicavel.

## Migracao e rollout
Expand/contract, feature flag, backfill, smoke e rollback.

## Dependencias
Outras demandas, fornecedor, juridico ou decisao de produto.

## Definition of Done
Codigo, testes, docs, observabilidade, seguranca e operacao concluidos.
```

## 19. Decisoes que os responsaveis precisam tomar

- A plataforma aceitara menores agora? Se sim, qual faixa etaria e qual mecanismo de responsavel?
- Professor "verificado" significa identidade, formacao, vinculo atual ou apenas documento plausivel?
- Qual equipe/fornecedor fara verificacao e moderacao humana, com qual SLA?
- Tutor, plano IA, revisao factual e plagio entram no lancamento, ficam em beta explicito ou serao removidos?
- A plataforma sera gratuita no primeiro lancamento? Se paga, quais entitlements e obrigacoes fiscais/reembolso?
- Qual cloud/regiao, requisitos de residencia de dados e fornecedores sao aprovados?
- Quais SLO, RPO e RTO o negocio aceita?
- Qual volume esperado em 3, 12 e 24 meses: usuarios ativos, turmas, uploads, fan-out e chamadas de IA?
- Quais dados podem ser enviados a provedores de IA e por quanto tempo?
- Qual canal de suporte, on-call e resposta a incidente estara disponivel no lancamento?

## 20. Conclusao

O projeto nao precisa ser reescrito para chegar a producao. A base pode evoluir para uma arquitetura escalavel se primeiro forem corrigidas as fronteiras de seguranca e integridade, criado um caminho canonico de banco/release e separado o processamento duravel do web tier.

A ordem importa: adicionar replicas ou cache agora nao resolve gabarito exposto, IDOR, migrations quebradas, sessoes nao revogaveis ou jobs perdidos. O caminho recomendado e fechar P0, habilitar um piloto fechado observavel e reversivel, e somente depois otimizar escala com dados reais.
