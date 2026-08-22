# Plano de demandas para producao: Redis, filas, cache e go-live

**Data:** 14/07/2026<br>
**Projeto:** EduConnect<br>
**Documento-base:** `docs/AUDITORIA_PRODUCAO_ESCALABILIDADE_2026-07-14.md`<br>
**Status inicial:** `NO-GO`<br>
**Natureza deste arquivo:** planejamento e especificacao de features; nenhuma feature esta implementada por este documento.

## 1. Objetivo e limite desta entrega

Este plano converte a auditoria de producao em demandas executaveis. Ele cobre seguranca, banco, Redis, filas, cache, storage, produto, LGPD, infraestrutura, observabilidade, testes e liberacao.

O trabalho desta entrega e somente:

- Definir arquitetura e decisoes obrigatorias.
- Dividir o trabalho em epicos e features.
- Registrar dependencias, prioridades, criterios de aceite e evidencias de conclusao.
- Definir gates objetivos ate producao.

O trabalho desta entrega nao inclui:

- Alterar `docker-compose.yml`.
- Instalar Redis, BullMQ ou qualquer dependencia.
- Criar migrations, workers, caches, filas ou telas.
- Corrigir vulnerabilidades ou fluxos de produto.
- Fazer deploy ou alterar infraestrutura externa.
- Criar issues automaticamente no GitHub.

Quando as demandas marcadas como `Bloqueia producao: sim` estiverem concluidas e o gate final `G5` possuir evidencias e aprovacoes, a EduConnect estara apta a um go-live controlado. Codigo merged, isoladamente, nao satisfaz esse criterio.

## 2. Regras de prioridade e release

| Classe | Significado | Regra de release |
|---|---|---|
| P0 | Integridade, seguranca, privacidade ou operacao basica comprometida | Todo P0 precisa estar fechado e retestado |
| P1 | Essencial para confiabilidade, operacao ou lancamento real | Todo P1 de lancamento precisa estar fechado |
| P2 | Escala/qualidade necessaria conforme volume e SLO | Bloqueia se o teste de capacidade ou risco do lancamento exigir |
| P3 | Otimizacao orientada por metricas | Pode permanecer no backlog pos-lancamento |

Regras adicionais:

- Piloto fechado nao pode aceitar waiver para P0.
- P1 de seguranca, privacidade, integridade, backup, rollback e observabilidade nao pode ser dispensado em lancamento publico.
- Waiver excepcional exige risco descrito, mitigacao, responsavel, data de expiracao e aprovacao de Engenharia, Seguranca e Produto; DPO/Juridico participa quando aplicavel.
- Um item so esta fechado com evidencia anexada. Declaracao verbal ou checkbox sem teste nao vale como conclusao.

## 3. Decisoes arquiteturais obrigatorias

### ADR-01 - Separar Redis de fila e Redis de cache

Serao usados endpoints/processos independentes:

| Workload | Endpoint | Durabilidade | Memoria/eviction | Fonte de verdade |
|---|---|---|---|---|
| Filas BullMQ | `REDIS_QUEUE_URL` | AOF e HA em producao | `noeviction`; crescimento monitorado | Nao. Postgres outbox/ledger permite re-drive |
| Cache | `REDIS_CACHE_URL` | Descartavel | `maxmemory` + `allkeys-lfu` inicialmente | Nao. Postgres continua autoritativo |
| Controles/rate limit | `REDIS_CONTROL_URL` quando adotado | Conforme risco | Nunca usar cache sujeito a eviction para controle critico | Politica autoritativa permanece no dominio/DB |

Nao usar bancos logicos diferentes de um unico Redis para fila e cache. Bancos logicos compartilham memoria, disponibilidade e `maxmemory-policy`. BullMQ requer que chaves de fila nao sejam expulsas, enquanto cache precisa poder expulsar chaves.

No Docker local, o plano exige pelo menos `redis-queue` e `redis-cache`. Producao exige endpoints gerenciados separados ou topologia equivalente aprovada; um unico container Redis nao atende ao go-live publico.

### ADR-02 - Usar BullMQ + ioredis com versoes estaveis fixadas

BullMQ sera o framework de jobs para Node.js e ioredis sera o cliente compartilhado com os runtimes que precisarem de Redis. A implementacao deve:

- Fixar uma versao exata testada no lockfile.
- Usar Job Schedulers suportados pela versao escolhida; nao introduzir o `QueueScheduler` legado/deprecado.
- Usar conexoes e prefixos por ambiente.
- Manter contratos de job versionados e compativeis com workers `N` e `N-1` durante rollout.
- Tratar `failed jobs` como DLQ operacional, com politica explicita de retencao e replay.
- Usar `prefix` do BullMQ para keys de fila; nao combinar com `keyPrefix` global do ioredis.

### ADR-03 - Manter transactional outbox no Postgres

Redis nao participa da transacao do Postgres. Portanto, nenhuma feature critica fara `UPDATE/INSERT no Postgres` seguido diretamente de `queue.add()` como unica garantia.

O padrao obrigatorio sera:

1. A transacao de negocio altera o agregado e grava `outbox_events`.
2. Um dispatcher reserva eventos da outbox e publica no BullMQ.
3. O `jobId/deduplicationId` deterministico impede duplicacao de transporte.
4. O handler valida versao/estado e grava seu efeito de modo idempotente.
5. A outbox/ledger permite reconstruir filas apos indisponibilidade ou perda do Redis.

Semantica: **at-least-once com efeito de negocio idempotente**. O projeto nao deve prometer exactly-once.

### ADR-04 - Adotar cache-aside com invalidacao por evento

O cache sera uma otimizacao e nunca requisito de corretude:

- Leitura tenta Redis com timeout curto.
- Em miss ou indisponibilidade, consulta Postgres.
- Resultado elegivel e salvo com TTL e jitter.
- Escritas confirmam primeiro no Postgres.
- Eventos da outbox invalidam chaves apos commit.
- Flush ou perda total do cache nao pode impedir o funcionamento correto.

Nao sera feito dual-write ingenuo de dado de negocio para Postgres e cache.

### ADR-05 - Proibir dados criticos no cache

Nao podem ser cacheados como payload comum:

- Gabaritos, `correctIndex` e respostas de alunos.
- Tokens, codigos de reset, secrets e cookies de sessao.
- Documentos de professor e dados de identidade.
- URL assinada de longa duracao.
- Conteudo privado/rascunho sem chave e autorizacao formalmente provadas.
- Resultado de autorizacao como unica fonte de verdade.
- Dados pessoais sem classificacao, TTL, owner e regra de purge.

### ADR-06 - Producao usa servicos gerenciados ou HA equivalente

O Docker Compose sera ambiente local e, quando necessario, base de testes integrados. Producao deve possuir:

- Redis queue com rede privada, TLS, ACL, HA/failover, persistencia e restore/re-drive testado.
- Redis cache com rede privada, TLS, ACL, limite de memoria e eviction monitorada.
- Postgres gerenciado com HA, PITR e pooler.
- Object storage gerenciado, privado, versionado e com lifecycle.
- Web e worker separados, sem estado e escalaveis horizontalmente.

## 4. Arquitetura alvo

```text
Internet
  -> DNS + CDN/WAF + TLS + rate limit de borda
  -> Load balancer
      -> Web Next.js stateless (N replicas)
          -> Pooler -> PostgreSQL HA/PITR
          -> REDIS_CACHE_URL (cache-aside descartavel)
          -> Postgres transactional outbox
          -> Object storage privado / URLs assinadas

Outbox dispatcher
  -> REDIS_QUEUE_URL / BullMQ
      -> Workers separados por concorrencia/workload
          -> IA
          -> E-mail
          -> Notificacoes
          -> Media scan
          -> Storage delete / account purge

Web + Dispatcher + Workers
  -> Logs + metricas + traces + error tracking
  -> Secrets manager

Operacao
  -> Backoffice RBAC/MFA + audit log
  -> CI/CD + migrations one-off + rollout/rollback
```

## 5. Fases e gates

| Fase | Objetivo | Gate de saida |
|---|---|---|
| F0 | Decidir escopo, risco, fornecedores, SLO e operacao | G0 - Escopo aprovado |
| F1 | Fechar integridade, auth, migrations, dependencias e qualidade basica | G1 - Base tecnica segura |
| F2 | Implantar Redis, outbox, BullMQ, workers e cache controlado | G2 - Assincrono resiliente |
| F3 | Completar plataforma, storage, compliance, backoffice e observabilidade | G3 - Staging pronto |
| F4 | Executar piloto fechado, soak, carga, DAST, pentest e DR | G4 - Release candidate |
| F5 | Fazer rollout progressivo e reversivel | G5 - Producao publica |
| F6 | Otimizar escala/custo por metricas | Revisoes pos-lancamento |

### G0 - Escopo aprovado

- Publico-alvo e politica de menores decididos.
- Escopo real de IA e significado de professor verificado decididos.
- Modelo gratuito/pago decidido.
- Cloud, regiao e fornecedores aprovados.
- SLO, RPO, RTO, error budget e volume esperado aprovados.
- RACI, suporte, on-call, DPO e operacao humana definidos.

### G1 - Base tecnica segura

- Todos os P0 tecnicos de integridade/auth fechados.
- Gabarito e IDOR retestados por matriz automatizada.
- Banco vazio e upgrade de schema passam no CI.
- Zero vulnerabilidade alta/critica sem waiver valido.
- Lint, typecheck real, testes e build sao gates.
- Artefato e imagens sao imutaveis e rastreaveis.

### G2 - Assincrono resiliente

- Redis queue e cache separados e observaveis.
- Outbox, dispatcher, BullMQ e worker estao operacionais.
- Todos os usos criticos de `after()` foram migrados e reconciliados.
- Kill/restart, duplicidade, retry, DLQ, replay e outage Redis foram testados.
- Cache passou por miss/hit/invalidation/flush/stampede/isolation tests.
- Nao ha perda ou efeito duplicado de negocio.

### G3 - Staging pronto

- Staging isolado e paritario em topologia/seguranca.
- Health/readiness, logs, metricas, traces e alertas ativos.
- Backup/PITR/restore e purge de objetos demonstrados.
- LGPD, cookies, menores e textos legais aprovados.
- Backoffice, moderacao, suporte, runbooks e on-call operacionais.

### G4 - Release candidate

- Piloto fechado concluiu a janela de soak definida pelo SLO.
- E2E, carga, resiliencia, DAST e pentest passaram.
- Nao ha P0/P1 de lancamento aberto nem Sev1/Sev2 conhecido.
- DR/tabletop e rollback foram executados por pessoas reais.
- Produto, Engenharia, Seguranca, Operacoes e DPO/Juridico aprovaram.

### G5 - Producao publica

- Freeze curto e restore point confirmados.
- Migration de release e apenas expand/non-destructive.
- Canary progride em percentuais aprovados, por exemplo 5/25/50/100.
- Smoke autenticado e sinteticos passam em cada etapa.
- SLO e criterios de abort permanecem verdes.
- Rollback de app, flags, workers e cache foi ensaiado.

## 6. Definition of Ready e Definition of Done

### 6.1 Definition of Ready obrigatoria

Uma demanda so entra em desenvolvimento se possuir:

- ID, prioridade, fase, owner e aprovadores.
- Problema, evidencia da auditoria e impacto no usuario/negocio.
- Escopo e fora de escopo.
- Dependencias e decisoes externas.
- Criterios Given/When/Then, incluindo erro e concorrencia.
- Contrato de API/dado/evento/job/cache e versao quando aplicavel.
- Classificacao de dados/PII/LGPD e threat model proporcional ao risco.
- Plano de migration, backfill, feature flag, rollout e rollback.
- Plano de teste e evidencia esperada.
- Logs, metricas, alertas e SLI quando operacional.
- Estimativa de capacidade/custo e limites.

Para job, adicionar: chave idempotente, tipos de erro, retry, timeout, max attempts, DLQ, retencao e SLO.

Para cache, adicionar: key, escopo, fonte de verdade, TTL+jitter, invalidacao, staleness maxima, fallback e dados proibidos.

### 6.2 Engineering Done

- Review aprovado.
- Lint, format, typecheck, testes e build verdes.
- Migration fresh/upgrade e compatibilidade `N/N-1` verdes.
- Scans de dependencia, secret e container verdes.
- Documentacao, env e contratos atualizados.
- Telemetria sem PII/secrets e feature flag segura.
- Nenhuma mudanca destrutiva sem expand/contract.

### 6.3 Release Done

Engineering Done nao significa liberado. Release Done exige:

- Staging paritario aprovado.
- E2E, carga, seguranca e resiliencia aplicaveis executados.
- Dashboard, alerta, runbook e on-call ativos.
- Rollback/restore ensaiados.
- Evidencias anexadas a demanda.
- Aprovacoes de Produto, Engenharia, Seguranca, Operacoes e DPO/Juridico aplicaveis.
- Risco residual registrado e aceito.

### 6.4 Done adicional para fila

- Kill/restart durante execucao recupera o job.
- Entrega duplicada nao duplica o efeito de negocio.
- Stalled, timeout, retry, DLQ e replay foram testados.
- Handler verifica versao/estado antes de gravar resultado.
- Deploy com worker `N/N-1` nao perde nem corrompe jobs.

### 6.5 Done adicional para cache

- Miss, hit, expiracao, invalidacao e flush foram testados.
- Outage do cache faz fallback sem alterar corretude.
- Stampede e hot key possuem protecao e metrica.
- Nao ha vazamento entre usuario, turma, audiencia ou ambiente.
- Auth, gabarito e estado sensivel nao dependem de dado stale.

## 7. Catalogo de epicos

| Ordem | Epico | Resultado | Gate |
|---|---|---|---|
| E00 | Decisoes e governanca | Escopo, risco, owners e operacao aprovados | G0 |
| E01 | Integridade de avaliacoes | Provas sem gabarito exposto e autorizacao canonica | G1 |
| E02 | Identidade e seguranca | Auth revogavel, dependencias e fronteiras endurecidas | G1 |
| E03 | Banco e consistencia | Schema canonico, roles minimas e transacoes seguras | G1 |
| E04 | Plataforma Redis | Redis queue/cache isolados em local e producao | G2 |
| E05 | Filas duraveis e workers | Outbox + BullMQ substituem background descartavel | G2 |
| E06 | Cache distribuido | Cache-aside seguro, medido e invalidado | G2 |
| E07 | Upload e storage seguro | Upload, scan, serving e delecao confiaveis | G3 |
| E08 | Infraestrutura de producao | Servicos privados, HA, secrets e artefatos imutaveis | G3 |
| E09 | CI/CD e qualidade | Todo release e testado, auditavel e reversivel | G3 |
| E10 | Observabilidade e incidentes | Falhas detectaveis e operacao preparada | G3 |
| E11 | Cadastro e identidade do usuario | Signup/e-mail/convite idempotentes e factuais | G3 |
| E12 | LGPD e ciclo de vida | Consentimento, direitos, menores e purge operacionais | G3 |
| E13 | Trust & Safety e backoffice | Verificacao/moderacao humanas com auditoria | G3 |
| E14 | Notificacoes e comunicacao | Preferencias e entregas reais e resilientes | G3 |
| E15 | Verdade e completude do produto | Nenhum mock/claim/link e apresentado como real | G3 |
| E16 | Performance e dados | Cursores, indices e capacidade comprovados | G4/P2 |
| E17 | UX, acessibilidade e manutenibilidade | Experiencia publica e base sustentaveis | G4/P2 |
| E18 | Certificacao e lancamento | Staging, pentest, DR, piloto e rollout aprovados | G4/G5 |

## 8. Demandas detalhadas

### E00 - Decisoes e governanca

| ID | Pri. | Feature/demanda | Criterios de aceite | Dep. |
|---|---|---|---|---|
| DEC-01 | P0 | Definir publico-alvo e menores | Faixas etarias, age gate, responsavel, dados permitidos, suporte e aprovacao DPO/Juridico documentados | Nenhuma |
| DEC-02 | P0 | Definir IA no lancamento | Cada IA fica como real, beta explicito, feature-flagged ou removida; finalidade, dados, provider, avaliacao e fallback aprovados | Nenhuma |
| DEC-03 | P0 | Definir selo de professor e operacao humana | Significado do selo, evidencias, quem decide, SLA, fraude, apelo e revogacao aprovados | Nenhuma |
| DEC-04 | P1 | Definir negocio e fornecedores | Gratuito/pago, limites, fiscal/reembolso; cloud/regiao, SLA, DPA, quotas e custo aprovados | Nenhuma |
| DEC-05 | P1 | Definir SLO, RPO, RTO, capacidade e RACI | Metas e forecast de usuarios, turmas, uploads, fan-out e IA; owners de Produto/Eng/Sec/Ops/DPO/Suporte | DEC-01..04 |

### E01 - Integridade de avaliacoes

| ID | Pri. | Feature/demanda | Criterios de aceite | Dep. |
|---|---|---|---|---|
| EVA-01 | P0 | Separar gabarito do payload publico | `correctIndex` nao existe em RSC/actions/feed/planner; gabarito fica server-only; testes inspecionam payload antes/depois da entrega | DB-03 |
| EVA-02 | P0 | Aplicar autorizacao canonica a avaliacao | Leitura, draft, submit, consulta e correcao validam papel, audiencia, turma, janela e status; matriz cross-user passa | DB-03 |
| EVA-03 | P0 | Tornar submissao/correcao transacional e idempotente | Duplo submit/correcao concorrente nao duplica nota/notificacao; row count e constraints sao verificados | DB-04, QUEUE-04 |

### E02 - Identidade e seguranca

| ID | Pri. | Feature/demanda | Criterios de aceite | Dep. |
|---|---|---|---|---|
| SEC-01 | P0 | Corrigir open redirect | Destino sempre mantem origem configurada; barras invertidas, encoding duplo, controles e URLs externas sao rejeitados por teste | Nenhuma |
| SEC-02 | P0 | Atualizar dependencias vulneraveis | Zero high/critical sem waiver; Next, editor, auth e build passam; versoes criticas ficam fixadas | CICD-01 |
| SEC-03 | P0 | Implementar revogacao de sessao | Reset, troca, exclusao e suspensao revogam todos os dispositivos; toda fronteira valida conta ativa/session version | DB-01 |
| SEC-04 | P1 | Definir anti-enumeracao e politica de rate limit | Proxy confiavel, politicas IP+conta+acao+global, chaves sem PII puro, 429/Retry-After, failure mode e timing aprovados | DEC-05 |
| SEC-05 | P1 | Endurecer URLs, perfil privado, CSP e erros | Somente HTTP(S), politica de imagem/review privada, CSP evoluida e erro publico opaco com correlation ID | OBS-02 |
| SEC-06 | P0 | Rotacionar e governar secrets | Secrets suspeitos revogados, scanner no CI, inventario/owner/rotacao e secrets manager; nenhum valor em log/imagem/repo | INFRA-02, CICD-01 |

### E03 - Banco e consistencia

| ID | Pri. | Feature/demanda | Criterios de aceite | Dep. |
|---|---|---|---|---|
| DB-01 | P0 | Criar migrations canonicas | Baseline e migrations monotonicamente versionadas; ledger/checksum/advisory lock; fresh e upgrade verdes | DEC-04 |
| DB-02 | P0 | Separar owner/migration/runtime | Runtime `NOSUPERUSER/NOBYPASSRLS`, grants minimos; migration one-off usa credencial separada | DB-01 |
| DB-03 | P0 | Criar API de transacao e unidade de trabalho | Dominio, audiencia e efeitos locais confirmam juntos; API suporta gravar outbox na mesma transacao; rollback preserva estado anterior | DB-01 |
| DB-04 | P1 | Corrigir constraints e concorrencia | Matricula, views, follows, notificacoes e submits usam unique/CAS/locks adequados; testes concorrentes passam | DB-01 |
| DB-05 | P1 | Configurar pool, timeouts e budget | Pooler, budget por replica, connect/idle/query/statement/lock timeout, max lifetime, error listener e metricas | INFRA-01 |
| DB-06 | P1 | Definir indices, paginacao e retencao | `EXPLAIN ANALYZE` e carga aprovam indices; cursor substitui offset critico; purge em lotes por politica | DB-01, DEC-05 |

### E04 - Plataforma Redis

#### REDIS-01 - Provisionar Redis de fila e cache no Docker local

**Prioridade:** P0<br>
**Fase:** F2<br>
**Bloqueia producao:** sim<br>
**Dependencias:** ADR-01, DB-01

**Resultado esperado:** o ambiente Docker possui dois servicos isolados e um processo de worker, sem tratar o Compose como topologia de producao.

**Escopo planejado:**

- `redis-queue`: imagem fixada por versao/digest, AOF `everysec`, volume, `noeviction`, healthcheck e limite de recursos.
- `redis-cache`: imagem fixada, sem dado autoritativo/volume necessario, `maxmemory`, `allkeys-lfu`, healthcheck e limite de recursos.
- `worker`: entrypoint separado do Next e dependencias condicionadas a healthcheck.
- Rede interna; nenhuma porta Redis exposta por padrao. Se ferramenta local exigir porta, bind exclusivo em `127.0.0.1` e profile de desenvolvimento.
- Credenciais obrigatorias sem default fraco e documentacao de uso local.

**Criterios de aceite:**

- Reiniciar `redis-queue` preserva jobs aceitos conforme a politica AOF.
- Limpar/reiniciar `redis-cache` nao altera jobs nem corretude funcional.
- Queue e cache comprovadamente usam processos, memoria e policies independentes.
- Redis nao fica acessivel externamente.
- Docker local e explicitamente documentado como desenvolvimento/testes.

#### REDIS-02 - Criar clientes, configuracao e ciclo de vida

**Prioridade:** P0<br>
**Fase:** F2<br>
**Bloqueia producao:** sim<br>
**Dependencias:** REDIS-01, INFRA-02

**Resultado esperado:** produtor, worker, eventos e cache possuem clientes separados, tipados e observaveis.

**Criterios de aceite:**

- `REDIS_QUEUE_URL` e `REDIS_CACHE_URL` sao obrigatorias por feature/ambiente e nunca aparecem em log.
- TLS/ACL sao obrigatorios fora de ambiente local.
- Producer HTTP usa timeout/fail-fast e nao depende de Redis para confirmar transacao critica.
- Worker mantem conexao/reconexao compativel com BullMQ e faz graceful shutdown.
- Erros de conexao possuem handler, metrica e correlation ID.
- Budget contabiliza conexoes por replica, `Worker`, `QueueEvents`, dispatcher e ferramentas operacionais.
- Prefixos incluem aplicacao e ambiente; nao misturam dev, staging e producao.

#### REDIS-03 - Provisionar Redis gerenciado de producao

**Prioridade:** P0<br>
**Fase:** F3<br>
**Bloqueia producao:** sim<br>
**Dependencias:** DEC-04, INFRA-01, REDIS-01, REDIS-02

**Resultado esperado:** queue e cache usam servicos separados e privados, com caracteristicas operacionais de producao.

**Criterios de aceite:**

- Endpoints estao na mesma regiao da aplicacao, em rede privada, com TLS, ACL e secrets manager.
- Queue possui HA/failover, persistencia/backup compativeis com RPO e `noeviction` comprovado.
- Cache possui memory cap, politica LFU/LRU aprovada e suporta perda total/rebuild.
- O servico escolhido suporta conexoes persistentes e comandos exigidos pela versao fixada do BullMQ.
- Failover foi testado com jobs ativos, delayed e scheduler.
- Redis nao possui endpoint publico e credenciais sao rotacionaveis.

#### REDIS-04 - Capacidade, observabilidade e recuperacao Redis

**Prioridade:** P0<br>
**Fase:** F2-F4<br>
**Bloqueia producao:** sim<br>
**Dependencias:** REDIS-03, OBS-02, DEC-05

**Resultado esperado:** memoria, latencia, persistencia, conexoes, failover e custo possuem limites, dashboards, alertas e runbook.

**Criterios de aceite:**

- Queue alerta imediatamente para `evicted_keys > 0`, erro AOF, memoria, latencia, conexoes e indisponibilidade.
- Cache mede hit/miss, evictions, memoria, latencia e fallback para DB.
- Testes cobrem restart, particao, timeout, memoria cheia e failover.
- Outbox/ledger reconstroi trabalhos ausentes; cache e reconstruido por leitura.
- Capacity test respeita pool Postgres, limites Redis e quotas externas.
- Runbook cobre pause, failover, replay, cold cache e rotacao de credencial.

### E05 - Filas duraveis e workers

#### QUEUE-01 - Criar transactional outbox e ledger idempotente

**Prioridade:** P0<br>
**Bloqueia producao:** sim<br>
**Dependencias:** DB-01, DB-03

**Escopo:** migrations para `outbox_events`, `job_executions` e `job_dead_letters`, helper transacional e politica de retencao.

**Criterios de aceite:**

- Mudanca de dominio e evento confirmam ou revertem juntos.
- `event_id`, `dedup_key` e execucao por consumidor possuem constraints adequadas.
- Payload tem `schema_version`, aggregate/version, correlation ID e nenhum segredo/PII desnecessario.
- Concorrencia e rollback usam Postgres real nos testes.
- Retencao, redacao e purge do ledger estao automatizados.

#### QUEUE-02 - Criar dispatcher e reconciliador Postgres -> BullMQ

**Prioridade:** P0<br>
**Bloqueia producao:** sim<br>
**Dependencias:** QUEUE-01, REDIS-02

**Criterios de aceite:**

- Claim usa lease e `FOR UPDATE SKIP LOCKED` ou mecanismo equivalente.
- Redis indisponivel mantem evento pendente sem reverter o negocio.
- Crash depois de `queue.add()` e antes de confirmar dispatch nao duplica efeito.
- `jobId` deterministico e ledger permitem re-drive.
- Reconciliador encontra eventos pendentes/ausentes e backlog/idade geram alertas.
- `dispatched` nunca e confundido com `processed`.

#### QUEUE-03 - Criar runtime de worker e contratos tipados

**Prioridade:** P0<br>
**Bloqueia producao:** sim<br>
**Dependencias:** QUEUE-02, CICD-01

**Criterios de aceite:**

- Worker e entrypoint/imagem separados do ciclo de vida do Next.
- Web e worker compartilham o mesmo SHA de release.
- Registry usa schemas validados e contratos versionados.
- Todo job inclui `eventId`, `schemaVersion`, aggregate/version e correlation ID.
- Worker `N` processa contrato `N-1` durante rollout.
- SIGTERM para captura, aguarda/libera job dentro do grace period e fecha conexoes.
- Pools de IA, e-mail, fan-out, media e manutencao escalam separadamente.

#### QUEUE-04 - Padronizar idempotencia, retry, timeout e DLQ

**Prioridade:** P0<br>
**Bloqueia producao:** sim<br>
**Dependencias:** QUEUE-03, OBS-02

**Criterios de aceite:**

- Retry exponencial com jitter e limite e definido por job.
- `429`, timeout e `5xx` temporario podem receber retry; validacao, versao obsoleta e erro permanente nao entram em loop.
- Toda chamada externa tem timeout/AbortSignal, circuit breaker, rate e concurrency limit.
- Falha terminal permanece pesquisavel na DLQ com erro redigido.
- Replay/cancelamento exige RBAC, motivo e audit log.
- `jobId` nao e a unica idempotencia; efeito final usa constraint/CAS/ledger no Postgres.

#### QUEUE-05 - Migrar revisao de conteudo para `content.review`

**Prioridade:** P0<br>
**Bloqueia producao:** sim<br>
**Dependencias:** QUEUE-04, PROD-01

**Contrato minimo:** `eventId`, `contentId`, `contentVersion`, `policyVersion`.

**Criterios de aceite:**

- `app/actions/content-items.ts` nao usa `after()` para revisao.
- Job nao leva HTML completo quando o worker pode buscar pelo ID/version.
- xAI possui timeout, quota, circuit breaker e custo medido.
- Resultado de versao antiga vira no-op/ignored e nao sobrescreve edicao nova.
- Falha deixa estado recuperavel, visivel ao professor e a operacao.
- Invalida cache e emite publicacao/notificacao somente apos transacao valida.

#### QUEUE-06 - Implementar publicacao imediata e agendada em `content.publish`

**Prioridade:** P1<br>
**Bloqueia producao:** sim para agendamento anunciado<br>
**Dependencias:** QUEUE-04, DB-03, PROD-02

**Contrato minimo:** `eventId`, `contentId`, `contentVersion`, `publishAt`, `timezoneVersion`.

**Criterios de aceite:**

- `publish_at` e estado agendado ficam no Postgres em UTC.
- Publicacao confirma conteudo, audiencia e outbox em uma transacao.
- Editar/cancelar incrementa versao; job anterior vira no-op.
- Delayed job nao e unica fonte: reconciliador encontra publicacoes vencidas/ausentes.
- Nao publica antes do horario; atraso e medido contra SLO.
- Testes cobrem timezone, horario de verao, retry, restart e duplicidade.

#### QUEUE-07 - Migrar verificacao para `professor.verify`

**Prioridade:** P0<br>
**Bloqueia producao:** sim<br>
**Dependencias:** QUEUE-04, STO-02, DEC-03

**Contrato minimo:** `eventId`, `profileId`, `documentVersion`, `objectId`, `policyVersion`.

**Criterios de aceite:**

- Upload route nao usa `after()`.
- Documento/base64/PII nao entra no Redis; job usa referencias.
- Resultado antigo nao sobrescreve documento reenviado.
- IA apenas executa o papel aprovado em DEC-03; privilegio humano/qualificado e respeitado.
- Falha e encaminhamento manual ficam recuperaveis e visiveis.
- Quota/cooldown, antifraude basico, timeout e audit trail estao ativos.

#### QUEUE-08 - Tornar e-mail duravel em `email.send`

**Prioridade:** P0<br>
**Bloqueia producao:** sim<br>
**Dependencias:** QUEUE-04

**Contrato minimo:** `eventId`, `emailDeliveryId`, `templateVersion`; nunca codigo/token/e-mail bruto desnecessario.

**Criterios de aceite:**

- Reset, verificacao, convite e alertas usam entrega registrada e fila.
- Provider recebe idempotency key derivada da entrega quando suportado.
- Timeout, retry, delivery webhook/status e reenvio seguro funcionam.
- Token/codigo possui ciclo consistente e nao existem codigos concorrentes validos.
- Falha terminal aparece no backoffice sem revelar segredo.
- Timing/resposta HTTP nao enumera conta.

#### QUEUE-09 - Implementar `notification.fanout` paginado

**Prioridade:** P1<br>
**Bloqueia producao:** sim<br>
**Dependencias:** QUEUE-04, NOTIF-01, DB-04

**Contrato minimo:** `eventId`, `domainEventId`, `cursor`.

**Criterios de aceite:**

- Destinatarios sao processados em lotes configuraveis.
- Constraint unica evita duplicacao por evento/destinatario.
- Retry continua do cursor confirmado.
- Preferencias e permissao sao verificadas no processamento.
- Turma/professor grande nao cria query, transacao ou job gigante.
- Metricas mostram destinatarios, lotes, atraso, deduplicacao e falha.

#### QUEUE-10 - Implementar media, delecao, purge e manutencao

**Prioridade:** P0/P1<br>
**Bloqueia producao:** sim<br>
**Dependencias:** QUEUE-04, STO-02, STO-04, LGPD-01

**Jobs:** `media.scan`, `blob.delete`, `account.purge`, `maintenance.cleanup` e `cache.invalidate`.

**Criterios de aceite:**

- Upload finalizado cria scan e fica em quarentena ate resultado `clean`.
- Delecao usa ledger/retry e nao perde referencia antes de inventariar objetos.
- Purge em lotes remove DB, storage, caches e PII de jobs conforme politica.
- Job Scheduler usa API suportada e IDs estaveis para tarefas recorrentes.
- Reconciliador detecta objeto orfao, conta vencida e limpeza perdida.
- Execucao gera evidencia auditavel e alertas por atraso/falha.

#### QUEUE-11 - Criar operacao de filas

**Prioridade:** P0<br>
**Bloqueia producao:** sim<br>
**Dependencias:** QUEUE-04, TRUST-03, OBS-02

**Criterios de aceite:**

- Painel privado permite busca, pause/resume, cancelamento e replay controlado.
- Acesso exige RBAC/MFA e gera audit log.
- Payload sensivel nao e exibido ou persistido no painel.
- Dashboards mostram waiting/active/delayed/failed/stalled/retry/duracao/oldest/DLQ.
- Alertas tem owner e runbook.
- Nao existe painel BullMQ exposto publicamente.

#### QUEUE-12 - Remover `after()` e reconciliar estados legados

**Prioridade:** P0<br>
**Bloqueia producao:** sim<br>
**Dependencias:** QUEUE-05..11

**Criterios de aceite:**

- Inventario prova que nenhum efeito critico ainda depende de `after()`.
- Feature flags impedem executar fluxo antigo e novo ao mesmo tempo.
- Conteudos `verificando`, professores `pending` e entregas antigas sao reconciliados.
- Cutover por dominio inicia com concorrencia baixa, observa e aumenta gradualmente.
- Rollback pausa worker/desliga produtor novo sem perder outbox.

### Catalogo de jobs e deduplicacao

| Job | Chave/dedup inicial | Fonte de verdade | Efeito principal |
|---|---|---|---|
| `content.review` | content + version + policy | Postgres content/version | Revisao e transicao de estado |
| `content.publish` | content + version + publish | Postgres state/publish_at | Publicacao e eventos |
| `professor.verify` | profile + document version | Postgres profile/document ref | Triagem/verificacao |
| `email.send` | delivery id | Postgres email_delivery | Envio e delivery state |
| `notification.fanout` | event + recipient/page | Postgres event/preferences | Notificacoes em lotes |
| `media.scan` | object + checksum + scanner version | Postgres object ledger | Liberar/rejeitar objeto |
| `blob.delete` | object + deletion version | Postgres object ledger | Excluir objeto |
| `account.purge` | user + deletion request version | Postgres deletion request | Purge integral |
| `cache.invalidate` | event + namespace/version | Postgres domain event | Invalidar chaves |
| `maintenance.cleanup` | task + period bucket | Scheduler/ledger | Retencao e limpeza |

### E06 - Cache distribuido

#### CACHE-01 - Criar politica, classificacao e key registry

**Prioridade:** P1<br>
**Bloqueia producao:** sim para qualquer cache habilitado<br>
**Dependencias:** REDIS-02, DEC-05

**Criterios de aceite:**

- Cada namespace possui owner, key builder, fonte, sensibilidade, TTL, jitter, tamanho maximo e evento de invalidacao.
- Toda chave tem TTL e prefixo de app/ambiente/versao.
- Dados proibidos por ADR-05 possuem testes automatizados.
- Nenhum caller monta chave manualmente fora da abstracao.
- Existe kill switch global e por namespace.

#### CACHE-02 - Implementar camada cache-aside resiliente

**Prioridade:** P1<br>
**Bloqueia producao:** sim para cache habilitado<br>
**Dependencias:** CACHE-01

**Criterios de aceite:**

- Miss consulta Postgres, valida/serializa e grava com TTL+jitter.
- Timeout/erro Redis faz fallback sem retornar lista vazia ou 404 falso.
- Circuit breaker evita tempestade de reconexao.
- Single-flight/local coalescing e protecao distribuida de performance reduzem stampede.
- Lock, se usado, tem token/timeout/unlock seguro e nunca garante correcao de negocio.
- Payload e tempo de serializacao possuem limite/metricas.

#### CACHE-03 - Invalidar cache por eventos da outbox

**Prioridade:** P1<br>
**Bloqueia producao:** sim<br>
**Dependencias:** CACHE-02, QUEUE-02, QUEUE-10

**Criterios de aceite:**

- Mutation e evento de invalidacao confirmam juntos no Postgres.
- Perfil, conteudo, publicacao, privacidade, sala, follow, notificacao e exclusao possuem mapa de chaves.
- Falha de invalidacao recebe retry; TTL limita staleness residual.
- Mudanca publico -> privado nunca vaza dado de cache antigo.
- Redis, cache Next e CDN seguem contrato unico de invalidacao.
- Testes cobrem corrida leitura/update/invalidation/retry.

#### CACHE-04 - Habilitar primeiros casos de uso medidos

**Prioridade:** P1/P2<br>
**Bloqueia producao:** apenas se necessario ao SLO<br>
**Dependencias:** CACHE-03, PERF-02

**Ordem planejada:**

1. Taxonomias/referencias publicas.
2. Resumo publico de professor.
3. Conteudo publicado e sanitizado por ID+version.
4. Catalogos/rankings/agregados caros comprovados.
5. Contadores com consistencia eventual aprovada.

Feed personalizado completo, matricula, autorizacao e payload privado ficam fora do primeiro rollout.

**Criterios de aceite:**

- Baseline de queries/latencia existe antes do cache.
- Shadow read compara DB x cache sem servir o resultado.
- Leitura cacheada entra por percentual/flag e possui rollback instantaneo.
- Hit ratio e reducao de carga justificam manter o namespace.
- Isolamento de audiencia/visibilidade e testado.

#### CACHE-05 - Proteger hot keys, stampede e cold start

**Prioridade:** P1<br>
**Bloqueia producao:** sim quando cache participa do SLO<br>
**Dependencias:** CACHE-02, DEC-05

**Criterios de aceite:**

- TTL usa jitter para evitar expiracao sincronizada.
- Negative cache e permitido somente para dado publico, com TTL de poucos segundos aprovado.
- Cold cache/load test nao esgota pool do Postgres.
- Concurrency cap e backpressure protegem origem.
- Hot key, stampede e fallback possuem alerta.
- Stale-while-revalidate so existe onde staleness foi explicitamente aprovada.

#### CACHE-06 - Observabilidade, seguranca e purge de cache

**Prioridade:** P1<br>
**Bloqueia producao:** sim<br>
**Dependencias:** CACHE-01..05, LGPD-03

**Criterios de aceite:**

- Hit/miss, latencia, evictions, bytes, erros, fallback e idade sao medidos por namespace.
- Logs nao contem key com e-mail/IP bruto, PII ou valor cacheado.
- Exclusao/suspensao/privacidade invalida chaves afetadas.
- Flush integral e indisponibilidade nao mudam autorizacao/corretude.
- Teste automatizado prova ausencia de gabarito, token e documento no Redis.

#### RATE-01 - Implementar rate limiting distribuido seguro

**Prioridade:** P1<br>
**Bloqueia producao:** sim<br>
**Dependencias:** SEC-04, DEC-05

**Decisao:** manter o limitador autoritativo no Postgres ate existir `REDIS_CONTROL_URL` ou edge rate limiting aprovado. Nao usar `redis-cache` sujeito a eviction para auth.

**Criterios de aceite:**

- Algoritmo e atomico/distribuido e usa IP somente do proxy confiavel.
- Chaves usam HMAC/identificador nao reversivel, sem e-mail/IP puro.
- Politicas cobrem IP, conta, acao e limite global, com TTL automatico.
- Resposta inclui 429/`Retry-After` sem enumerar conta.
- Failure mode por risco e documentado; auth sensivel nao fica simplesmente fail-open.
- Defesa de borda continua ativa; Redis nao e unica camada anti-DDoS.

### Matriz inicial de cache

| Dado | Cache inicial | TTL inicial para validar | Regra de seguranca |
|---|---|---|---|
| Taxonomias publicas | Sim | Minutos/horas + jitter | Invalidar em alteracao administrativa |
| Perfil publico resumido | Sim | Curto, por exemplo 5 min + jitter | Visibilidade/estado revalidado em eventos sensiveis |
| Conteudo publico sanitizado | Sim | Curto, por exemplo 2 min + jitter | Key por ID+version; unpublish/privacidade invalida imediatamente |
| Ranking/catalogo publico | Sim, apos medir | Curto, por exemplo 1 min + jitter | Nao incluir dado privado |
| Contadores sociais | Sim, eventual | Muito curto, por exemplo 30 s + jitter | Definicao de metrica e abuso controlados |
| Feed personalizado | Nao no primeiro rollout | N/A | Quando adotado, cachear IDs/candidatos e reautorizar no DB |
| Matricula/autorizacao | Nao como autoridade | N/A | Postgres decide sempre |
| Gabarito/submissao/nota | Proibido | N/A | Nunca armazenar no cache |
| Tokens/documentos/secrets | Proibido | N/A | Nunca armazenar no cache |

Os TTLs acima sao hipoteses iniciais para teste, nao valores finais. CACHE-01 deve aprovar cada valor conforme staleness, carga e risco.

### E07 - Upload e storage seguro

| ID | Pri. | Feature/demanda | Criterios de aceite | Dep. |
|---|---|---|---|---|
| STO-01 | P0 | Autenticar antes do multipart e unificar limites | Anonimo e rejeitado antes de `formData`; ingress/API/UI usam mesmo limite; payload excedente e abortado sem buffer integral | SEC-03 |
| STO-02 | P0 | Upload direto com quarentena e scan | URL assinada curta, checksum/tamanho, finalize autenticado, magic bytes/decoder/AV; somente `clean` e servido | QUEUE-04, REDIS-03 |
| STO-03 | P1 | Servir por CDN/URL assinada com Range | Bucket privado, autorizacao por recurso, Range/ETag/cache correto; web nao proxyficara video grande | STO-02, INFRA-01 |
| STO-04 | P0 | Ledger, lifecycle, delecao e reconciliacao | Objetos vinculados, operacoes idempotentes, orfaos detectaveis e inventario para purge; outage S3 nao vira 404 silencioso | DB-01, LGPD-01 |
| STO-05 | P0 | Provisionar storage com minimo privilegio | App nao cria bucket; service account por ambiente/prefixo; criptografia, versionamento, lifecycle e rotacao | INFRA-01, INFRA-02 |

Requisitos complementares:

- Quota de bytes/arquivos por usuario, turma e tipo de conteudo.
- Limite de concorrencia para upload/scan e protecao de custo.
- Documento de professor com retencao minima aprovada e acesso auditado.
- Inventario periodico DB x bucket.
- Teste EICAR e MIME divergente em staging, sem arquivo perigoso disponivel.

### E08 - Infraestrutura de producao

| ID | Pri. | Feature/demanda | Criterios de aceite | Dep. |
|---|---|---|---|---|
| INFRA-01 | P0 | Provisionar fundacao privada e HA | Conta/VPC/rede, Postgres+pooler, object storage, ingress TLS/WAF e bases para web/worker/Redis; nenhum admin port publico | DEC-04, DEC-05 |
| INFRA-02 | P0 | Criar contrato de env e secrets manager | Schema tipado build/runtime; startup fail-fast; URL publica obrigatoria no build; secrets externos, rotacionaveis e sem log | DEC-04 |
| INFRA-03 | P1 | Criar imagens/servicos imutaveis de web, worker e dispatcher | Digest/SHA, usuario nao-root, healthcheck, resource limits, graceful shutdown; sem `container_name` que impece escala | CICD-01, QUEUE-03 |
| INFRA-04 | P0 | Implementar backup, PITR, restore e DR | Postgres PITR, storage versionado, Redis queue/re-drive; backups criptografados fora do dominio de falha e drill mede RPO/RTO | DEC-05, REDIS-04, STO-04 |

O Compose atual nao e uma feature de producao. A demanda INFRA-01 deve escolher e provisionar o ambiente real; publicar o Compose em uma VM nao fecha o epico.

### E09 - CI/CD e qualidade de release

| ID | Pri. | Feature/demanda | Criterios de aceite | Dep. |
|---|---|---|---|---|
| CICD-01 | P0 | Criar CI de qualidade e seguranca | Install limpa, ESLint/format, typecheck sem `ignoreBuildErrors`, unit, build, SCA, secret e container scan; high/critical bloqueia | Nenhuma |
| CICD-02 | P0 | Criar CI de banco e integracao | Postgres+Redis+MinIO reais; migration fresh/upgrade, authz, outbox, queue, cache e storage smoke; artefatos de falha anexados | DB-01, REDIS-01 |
| CICD-03 | P0 | Criar CD com promocao do mesmo artefato | Build unico por SHA, registry, SBOM/assinatura, staging -> prod sem rebuild, migration one-off com lock e audit log | CICD-01, CICD-02, INFRA-01, INFRA-03 |
| CICD-04 | P0 | Implementar rollout, flags e rollback | Expand/contract, compatibilidade N/N-1, canary, smoke por papel, flags com owner/expiracao/kill switch e rollback ensaiado | CICD-03, REL-01 |

Rollback obrigatorio:

- Voltar web/worker ao digest anterior.
- Desligar flags e cache reads.
- Pausar filas e drenar/segregar jobs incompativeis.
- Limpar namespace de cache quando necessario.
- Usar roll-forward para schema; migration destrutiva nao depende de rollback SQL improvisado.
- Efeito externo usa compensacao explicita, nao promessa de undo.

### E10 - Observabilidade e incidentes

| ID | Pri. | Feature/demanda | Criterios de aceite | Dep. |
|---|---|---|---|---|
| OBS-01 | P0 | Criar liveness, readiness e sinteticos | Liveness local; readiness valida DB/schema/capacidade minima; LB/deploy usam probes; sinteticos cobrem login/feed/sala/submit | INFRA-01 |
| OBS-02 | P0 | Criar logs, tracing, metricas e error tracking | JSON sem PII/secrets; request -> outbox -> job -> worker compartilha trace/correlation ID; dashboards DB/Redis/S3/IA/e-mail | INFRA-01 |
| OBS-03 | P0 | Definir SLO, alertas, on-call e runbooks | Alertas acionaveis com owner/runbook; error budget; incident commander; tabletop e postmortem | DEC-05, OBS-01, OBS-02 |

Metricas minimas:

- Web: taxa, erro, duracao p50/p95/p99 e saturacao.
- DB: pool, conexoes, locks, slow query, timeout, CPU e storage.
- Queue: waiting, active, delayed, failed, stalled, retry, duracao, oldest age e DLQ.
- Redis: conexoes, latencia, memoria, `evicted_keys`, AOF, replication/failover.
- Cache: hit/miss, fallback, eviction, bytes, stampede e staleness.
- Externos: S3, Resend e IA por latencia, erro, quota e custo.
- Negocio: signup, e-mail verificado, convite, submit, publicacao e purge concluido.

### E11 - Cadastro e identidade do usuario

| ID | Pri. | Feature/demanda | Criterios de aceite | Dep. |
|---|---|---|---|---|
| IDENT-01 | P0 | Implementar verificacao de e-mail | Token hash, single-use, expiracao, reenvio/rate limit e `email.send`; privilegios de risco aguardam verificacao | QUEUE-08, SEC-04 |
| IDENT-02 | P0 | Redesenhar signup como state machine idempotente | Cliente/servidor usam mesma senha; campos exibidos persistem ou somem; falha de login/upload retoma sem duplicar conta | IDENT-01, DB-03 |
| IDENT-03 | P0 | Preservar convite por cadastro/login/onboarding | Codigo sobrevive a todos os passos; matricula acontece exatamente uma vez e respeita capacidade/status da sala | IDENT-02, EVA-02 |
| IDENT-04 | P1 | Criar retomada da verificacao de professor | Pendente/rejeitado acessa fluxo correto, reenvia documento, pede revisao e acompanha status sem trocar tipo indevidamente | QUEUE-07, TRUST-01 |

### E12 - LGPD e ciclo de vida

| ID | Pri. | Feature/demanda | Criterios de aceite | Dep. |
|---|---|---|---|---|
| LGPD-01 | P0 | Finalizar termos, privacidade, menores e contatos | Sem placeholders/fornecedor incorreto; controlador/DPO/base legal/menores/transferencia aprovados por Juridico | DEC-01, DEC-04 |
| LGPD-02 | P0 | Implementar consentimento versionado e cookies reais | Hash/versao/data/fonte; reconsentimento/revogacao; recusar impede Analytics em teste de rede | LGPD-01 |
| LGPD-03 | P0 | Implementar direitos, retencao, exportacao e purge | Acesso/correcao/portabilidade/exclusao com SLA/owner; calendario por dado; DB/storage/cache/jobs removidos com evidencia | QUEUE-10, STO-04 |
| LGPD-04 | P0 | Formalizar governanca de dados e fornecedores | Inventario/classificacao, ROPA/DPIA para IA/menores/documentos, DPA/subprocessadores, incidente e transferencia internacional | DEC-02, DEC-04 |

Essas demandas nao podem ser encerradas apenas porque uma tela ou checkbox foi implementado. Exigem artefatos, processo operacional e aprovacao humana competente.

### E13 - Trust & Safety e backoffice

| ID | Pri. | Feature/demanda | Criterios de aceite | Dep. |
|---|---|---|---|---|
| TRUST-01 | P0 | Criar backoffice de verificacao de professor | Fila, preview seguro, decisao/motivo, reenvio, apelo, revogacao, SLA e auditoria; IA apenas no papel aprovado | DEC-03, QUEUE-07 |
| TRUST-02 | P1 | Criar denuncia, bloqueio, moderacao e apelo | Perfis/conteudos/comentarios reportaveis; bloqueio; fila, SLA, evidencias e recurso; politicas publicadas | TRUST-03 |
| TRUST-03 | P0 | Criar identidade administrativa segura | RBAC minimo, MFA, least privilege, sessao curta, audit log imutavel e separacao de funcoes | SEC-03, INFRA-02 |

### E14 - Notificacoes e comunicacao

| ID | Pri. | Feature/demanda | Criterios de aceite | Dep. |
|---|---|---|---|---|
| NOTIF-01 | P1 | Criar catalogo de eventos e preferencias reais | Atividade, material, prazo, conteudo, follow, submit e nota mapeados; cada toggle possui contrato e entrega verificavel | QUEUE-04 |
| NOTIF-02 | P1 | Criar entrega, links e estados consistentes | Dedup, destino correto por entity, read state, e-mail opt-in, retry e status; nenhuma notificacao para evento nao confirmado | NOTIF-01, QUEUE-08 |
| NOTIF-03 | P1 | Configurar reputacao e operacao de e-mail | Dominio/remetente, SPF/DKIM/DMARC, bounce/complaint, unsubscribe quando aplicavel e dashboard de delivery | DEC-04, QUEUE-08 |

### E15 - Verdade e completude do produto

| ID | Pri. | Feature/demanda | Criterios de aceite | Dep. |
|---|---|---|---|---|
| PROD-01 | P0 | Remover ou implementar IA simulada | Notas 95/88/92, tutor por palavra e onboarding falso removidos/flagged ou reais; falha explicita; sem claim de plagio/fato sem evidencia | DEC-02 |
| PROD-02 | P1 | Validar conteudo e estados por tipo | Schemas server-side, corpo/regras obrigatorios e state machine draft/review/scheduled/published definida e transacional | DB-03, DEC-02 |
| PROD-03 | P0 | Remover claims, numeros e depoimentos nao comprovados | Estatisticas/depoimentos tem fonte ou somem; landing corresponde a features ativas | DEC-02, DEC-04 |
| PROD-04 | P1 | Resolver mocks, buscas e links mortos | Progresso/busca/avisos/rotas/redes sao implementados, rotulados beta ou removidos da superficie publica | DEC-04 |
| PROD-05 | P1 | Criar suporte real | Contato/ajuda/FAQ, triagem, SLA e escalacao Seguranca/LGPD operacionais | DEC-05, OBS-03 |
| PROD-06 | P1 | Implementar ou remover monetizacao | Se pago: checkout/webhook/entitlement/fiscal/reembolso/conciliacao; se gratis: precos e promessas removidos | DEC-04 |

### E16 - Performance e dados

| ID | Pri. | Feature/demanda | Criterios de aceite | Dep. |
|---|---|---|---|---|
| PERF-01 | P1/P2 | Implementar cursor e filtros no SQL | Feed, comentarios, notificacoes, salvos e alunos usam keyset; filtros nao ocultam resultados antigos; teste de pagina grande | DB-06 |
| PERF-02 | P1 | Criar baseline, load test e query tuning | Cenarios/volumes de DEC-05; p95/p99/SLO, `EXPLAIN BUFFERS`, pool, Redis e custos medidos; gargalos documentados | DEC-05, OBS-02 |
| PERF-03 | P2 | Corrigir rankings, agregados e contadores | Metricas usam dataset completo/dedup; ranking pesado e otimizado/materializado somente com evidencia | DB-06, CACHE-04 |
| PERF-04 | P2 | Planejar cache/replica/particionamento por metrica | Decisao usa carga real; owner, custo, consistencia e rollback documentados; nao introduzir complexidade preventiva | PERF-02 |

### E17 - UX, acessibilidade e manutenibilidade

| ID | Pri. | Feature/demanda | Criterios de aceite | Dep. |
|---|---|---|---|---|
| UX-01 | P1 | Atingir WCAG 2.1 AA no fluxo critico | Teclado/foco/Escape/nome acessivel/contraste/reduced motion; axe + auditoria manual de signup/sala/avaliacao | CICD-01 |
| UX-02 | P1/P2 | Completar SEO e imagens publicas | Metadata/canonical/OG/sitemap/robots/manifest; remove `v0.app`; imagens otimizadas sem vazar privados | PROD-04 |
| ENG-01 | P2 | Refatorar modulos gigantes e boundaries | Dominios/actions/DTOs/repositorios separados; reduzir `any`; erros/loading/not-found consistentes; cobertura antes da divisao | CICD-01 |
| ENG-02 | P2 | Atualizar documentacao e toolchain | README usa S3/Redis/schema real; package name/engines/packageManager; scripts smoke validos e docs antigas marcadas historicas | DB-01, REDIS-01 |

### E18 - Certificacao e lancamento

| ID | Pri. | Feature/demanda | Criterios de aceite | Dep. |
|---|---|---|---|---|
| REL-01 | P0 | Criar staging paritario e isolado | Conta/VPC/DB/Redis queue/cache/bucket/secrets/provedores sandbox separados; dados sinteticos; mesmo digest de prod | INFRA-01, CICD-03 |
| REL-02 | P0 | Executar matriz final de testes | Unit, integration real, E2E por papel, resiliencia, carga, acessibilidade e scans com evidencias anexadas | Todos os epicos tecnicos |
| REL-03 | P0 | Executar pentest, threat review, DR e tabletop | Sem high/critical; restore/failover/replay/rollback medidos; pessoas e runbooks participam | REL-01, REL-02, OBS-03 |
| REL-04 | P0 | Executar piloto fechado e soak | Flags/limites, usuarios convidados, suporte/on-call, SLO/error budget e criterios de abort observados pela janela aprovada | REL-03 |
| REL-05 | P0 | Executar go-live progressivo | Checklist G5, canary, smoke por papel, aprovacao multidisciplinar, rollback pronto e revisoes 24/72h agendadas | REL-04, todos os blockers |
| REL-06 | P2/P3 | Operar pos-lancamento por metricas | Revisao de SLO/custo/incidente, backlog P2/P3 priorizado por dados e capacity forecast atualizado | REL-05 |

## 9. Matriz de verificacao obrigatoria

### 9.1 Unitarios

- DTO/politica sem gabarito.
- Autorizacao por papel/audiencia.
- State machines de signup, conteudo, verificacao e purge.
- Schemas e versionamento de jobs/eventos/cache.
- Key builders e classificacao de dado cacheavel.
- Idempotencia, dedup e classificacao de erro retryable/permanente.
- Validacao de redirects, URLs, rate limits e consentimentos.

### 9.2 Integracao real

- Postgres: migrations, constraints, transacoes, locks, outbox e concorrencia.
- Redis queue: dispatch, BullMQ, delayed, stalled, retry, DLQ e replay.
- Redis cache: miss/hit, TTL, invalidacao, flush, outage e isolation.
- MinIO/S3: upload, scan, serving, Range, delete, orfao e outage.
- Resend/IA: contrato, timeout, 429, 5xx, idempotency e circuit breaker.

Mocks isolados nao fecham o gate de integracao.

### 9.3 Resiliencia

- Matar worker antes, durante e depois de efeito externo.
- Entregar o mesmo evento/job mais de uma vez.
- Reiniciar Redis queue com job waiting/active/delayed.
- Indisponibilizar Redis cache e executar cold start.
- Simular memoria cheia: fila nao pode expulsar chave; cache deve expulsar conforme policy.
- Simular particao/reconexao e retry storm.
- Simular failover DB/Redis e provider externo degradado.
- Provar recuperacao sem efeito duplicado ou autorizacao stale.

### 9.4 E2E por papel

- Signup, e-mail, OAuth, convite e onboarding.
- Sessao em dois dispositivos, troca/reset/exclusao/suspensao.
- Professor pendente/rejeitado/aprovado e revisao manual.
- Conteudo por visibilidade/audiencia/follow/turma.
- Prova/simulado sem gabarito, prazo, draft, duplo submit e nota.
- Publicacao imediata/agendada, cancelamento e notificacao.
- Upload limpo/perigoso, download autorizado e exclusao.
- Consentimento/revogacao, exportacao e purge LGPD.
- Moderacao, denuncia, bloqueio, apelo e admin auditado.

### 9.5 Release e seguranca

- Fresh e upgrade migration.
- SAST, SCA, secret scan, container scan e SBOM.
- DAST em staging e pentest independente.
- Axe e auditoria manual de acessibilidade.
- Carga/capacidade com alvo aprovado, incluindo fan-out e cold cache.
- Restore Postgres/storage, re-drive outbox e failover Redis.
- Rollback de app/worker/flags/cache e roll-forward de schema.

## 10. Estrategia de rollout

### 10.1 Filas

Ordem por dominio:

1. Criar schema/outbox/ledger sem mudar comportamento.
2. Liberar dispatcher e worker com processamento desabilitado/shadow quando possivel.
3. Habilitar produtor de outbox por feature flag.
4. Processar com concorrencia minima.
5. Comparar efeito/estado e ativar metricas/alertas.
6. Desligar `after()` para o dominio; nunca manter os dois efeitos ativos.
7. Reconciliar estados legados.
8. Aumentar concorrencia dentro do budget.

### 10.2 Cache

Ordem por namespace:

1. Medir baseline sem cache.
2. Habilitar escrita/shadow e comparar DB x cache.
3. Habilitar leitura para percentual pequeno.
4. Monitorar hit/miss, staleness, fallback e DB.
5. Aumentar percentual gradualmente.
6. Manter kill switch que desabilita reads sem deploy.

### 10.3 Aplicacao

- Migration expand-only com advisory lock.
- Mesmo digest em staging e producao.
- Canary em etapas aprovadas.
- Smoke autenticado de aluno, professor e admin por etapa.
- Avanco somente apos janela e aprovacao definidas.
- Mudanca destrutiva de schema apenas em release posterior, quando codigo antigo nao depender mais dela.

## 11. Criterios imediatos de abort/no-go

Interromper rollout ou manter `NO-GO` se ocorrer qualquer item:

- P0 aberto ou regressao de auth, IDOR ou gabarito.
- Migration, restore ou rollback nao demonstrado.
- Vulnerabilidade high/critical sem waiver valido.
- Textos legais, menores ou consentimento sem aprovacao.
- Alerta/on-call/runbook critico indisponivel.
- Vazamento de PII, dado entre usuarios/turmas ou autorizacao por cache stale.
- `evicted_keys > 0` no Redis de fila.
- Backlog age, stalled ou DLQ acima do SLO.
- Divergencia cache/DB que altera corretude.
- Saturacao de Postgres/Redis, 5xx/latencia ou falha de signup/upload acima do limite.
- Falha de provider sem fallback/runbook no fluxo critico.

## 12. Demandas que nao se encerram apenas com codigo

| Area | Entrega humana/organizacional exigida | Aprovacao/evidencia |
|---|---|---|
| Juridico/DPO | Controlador/DPO, termos, bases legais, menores, retencao, ROPA/DPIA, DPA e incidente LGPD | Parecer/documentos aprovados |
| Produto/negocio | Gratuito/pago, claims, IA, selo, publico-alvo e limites | Decisao registrada e UX alinhada |
| Operacao humana | Verificacao, moderacao, denuncia/apelo, suporte, on-call e incident commander | Escala, treinamento, SLA e simulacao |
| Infra/contratos | Cloud/regiao, Redis/Postgres/S3/e-mail/IA, SLA/DPA/custo/quotas | Contratos e arquitetura aprovados |
| Seguranca | Rotacao real de secrets, threat review, pentest e waivers | Evidencia externa/interna e owners |
| Continuidade | SLO/RPO/RTO, backup, restore, rollback e tabletop | Drill medido com participantes |
| Dados | Inventario, classificacao, owners e calendario de descarte | Registro de tratamento e jobs ativos |
| Capacidade/financas | Forecast e budget de DB, Redis, storage, e-mail e IA | Load test e limite de custo aprovados |
| Acessibilidade/conteudo | Auditoria manual, textos e atendimento inclusivo | Relatorio e correcoes aceitas |

## 13. Rastreabilidade com a auditoria

### 13.1 P0

| Auditoria | Demanda principal neste plano |
|---|---|
| P0-01 Gabaritos | EVA-01, CACHE-01, REL-02 |
| P0-02 IDOR de avaliacoes | EVA-02, REL-02 |
| P0-03 Open redirect | SEC-01 |
| P0-04 Migrations | DB-01, CICD-02 |
| P0-05 Dependencias | SEC-02, CICD-01 |
| P0-06 Sessoes/conta excluida | SEC-03 |
| P0-07 Uploads | STO-01, STO-02 |
| P0-08 Infra/minimo privilegio | DB-02, REDIS-03, INFRA-01, STO-05 |
| P0-09 Background nao duravel | QUEUE-01 a QUEUE-12, REDIS-01 a REDIS-04 |
| P0-10 IA/claims fabricados | DEC-02, PROD-01, PROD-03 |
| P0-11 Signup/e-mail/convite | IDENT-01 a IDENT-04 |
| P0-12 LGPD/cookies/menores | LGPD-01 a LGPD-04 |

### 13.2 P1 por dominio

| Grupo da auditoria | Cobertura |
|---|---|
| Seguranca SEC-13..20 | SEC-04..06, TRUST-01..03, RATE-01, LGPD-04 |
| Dados DATA-01..08 | DB-01..06, QUEUE-01, STO-04, PERF-03 |
| Operacoes OPS-01..09 | INFRA-01..04, CICD-01..04, OBS-01..03, QUEUE-08/10 |
| Produto PROD-01..09 | NOTIF-01..03, PROD-01..06, QUEUE-06, TRUST-01 |

### 13.3 P2/P3

| Grupo | Cobertura |
|---|---|
| Cursor, SQL, ranking, contadores | PERF-01..04, DB-06 |
| CDN/upload/cache/imagens | STO-02..03, CACHE-01..06, UX-02 |
| Acessibilidade/SEO/UX de erro | UX-01..02, ENG-01 |
| Refatoracao/types/docs | ENG-01..02 |
| Materializacao/particionamento/broker | PERF-04 e REL-06, somente por metrica |

## 14. Checklist final de producao

### Seguranca e integridade

- [ ] 12/12 P0 da auditoria estao fechados e retestados.
- [ ] Nenhum gabarito aparece em payload de aluno.
- [ ] Matriz de autorizacao cross-user esta verde.
- [ ] Sessoes sao revogaveis e conta inativa perde acesso imediato.
- [ ] Dependencias/scans/pentest nao possuem high/critical aberto.
- [ ] Upload pre-auth, limite, scan, quota e serving seguro estao ativos.

### Redis, filas e cache

- [ ] Redis queue/cache sao endpoints independentes.
- [ ] Queue usa `noeviction`, HA e persistencia.
- [ ] Cache usa limite/eviction e e descartavel.
- [ ] Outbox e dominio sao atomicos.
- [ ] Todos os trabalhos criticos sairam de `after()`.
- [ ] Retry, timeout, DLQ, replay, idempotencia e painel estao operacionais.
- [ ] Restart/failover/duplicidade foram testados.
- [ ] Cache outage/flush/stampede/isolation foram testados.
- [ ] Redis nao contem gabarito, documento, secret ou PII desnecessaria.

### Dados, infraestrutura e operacao

- [ ] Fresh/upgrade migration e runtime role minimo estao verdes.
- [ ] Postgres/storage/Redis privados e gerenciados/HA estao ativos.
- [ ] Backup/PITR/restore/re-drive atingem RPO/RTO.
- [ ] CI/CD, artefato imutavel, canary e rollback foram ensaiados.
- [ ] Health, dashboards, alertas, on-call e runbooks estao ativos.
- [ ] Staging paritario usa dados sinteticos e o mesmo digest.

### Produto e compliance

- [ ] Signup/e-mail/convite/professor passam E2E.
- [ ] IA, numeros, depoimentos e claims sao reais ou removidos.
- [ ] Preferencias/notificacoes alteram comportamento real.
- [ ] Backoffice, moderacao, suporte e apelo estao operacionais.
- [ ] LGPD/cookies/menores/retencao/exportacao/purge foram aprovados e testados.
- [ ] Acessibilidade critica e links publicos foram revisados.

### Release

- [ ] G0 a G4 possuem evidencias e aprovacoes.
- [ ] Piloto/soak cumpriu SLO e error budget.
- [ ] Criterios de abort e rollback estao prontos.
- [ ] Go-live G5 foi aprovado por Produto, Engenharia, Seguranca, Operacoes e DPO/Juridico.

## 15. Template para abrir cada feature

```markdown
# [ID] Titulo orientado a resultado

## Metadados
- Prioridade:
- Fase/gate:
- Bloqueia producao:
- Owner:
- Aprovadores:
- Dependencias:

## Problema e evidencia
Comportamento atual, arquivos/linhas e impacto.

## Resultado esperado
Estado observavel depois da entrega.

## Escopo
O que entra.

## Fora de escopo
O que nao entra.

## Contratos
API/dado/evento/job/cache, versao e compatibilidade.

## Seguranca e dados
Threat model, PII/LGPD, autorizacao e retencao.

## Criterios de aceite
- Given/When/Then do caminho feliz.
- Erro, timeout, concorrencia e retry.
- Autorizacao por papel/audiencia.
- Telemetria e alertas.

## Plano de teste
Unitario, integracao, E2E, resiliencia, carga e seguranca.

## Migration e rollout
Backfill, flag, shadow/canary, compatibilidade e cutover.

## Rollback/compensacao
Como desligar sem perder dado ou duplicar efeito.

## Evidencias para Done
Links de CI, dashboards, testes, runbook, aprovacao e riscos residuais.
```

## 16. Referencias tecnicas oficiais

- [BullMQ - Going to production](https://docs.bullmq.io/guide/going-to-production): conexao resiliente e `noeviction` para filas.
- [BullMQ - Idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs): handlers pequenos e idempotentes para retry.
- [BullMQ - Deduplication](https://docs.bullmq.io/guide/jobs/deduplication): IDs e modos de deduplicacao.
- [BullMQ - Job Schedulers](https://docs.bullmq.io/guide/job-schedulers): agendamentos atuais, em vez de API legada.
- [BullMQ - Metrics](https://docs.bullmq.io/guide/telemetry/metrics): telemetria de jobs/filas.
- [Redis - Persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/): AOF, RDB e tradeoffs de durabilidade.
- [Redis - Key eviction](https://redis.io/docs/latest/develop/reference/eviction/): `maxmemory` e policies para cache.
- [Redis - Security](https://redis.io/docs/latest/operate/oss_and_stack/management/security/): rede confiavel, ACL e TLS.
- [Redis - Cache-aside](https://redis.io/docs/latest/develop/use-cases/cache-aside/): cache de leitura com TTL e fallback para fonte primaria.

## 17. Registro de execucao das demandas

| Data | Demanda | Status | Evidencia | Observacao |
|---|---|---|---|---|
| 2026-07-14 | DEC-01 | Concluida com aceite de risco | `docs/DEC-01_PUBLICO_ALVO_MENORES_2026-07-14.md` | Responsavel pelo projeto definiu acesso amplo sem coleta ou verificacao etaria e aceitou os riscos residuais. Nao existe parecer formal de DPO/Juridico ou Seguranca; a plataforma nao deve alegar certificacao de conformidade para uso por criancas. |
| 2026-07-14 | DEC-02 | Concluida | `docs/DEC-02_IA_NO_LANCAMENTO_2026-07-14.md` | Responsavel pelo projeto definiu lancamento sem IA visivel ou habilitada. Remocao de navegacao, claims e rotas fica em `PROD-01` e `PROD-03`; qualquer reativacao exige nova decisao. |
| 2026-07-14 | DEC-03 | Implementada no repositorio; operacao pendente | `docs/DEC-03_SELO_PROFESSOR_OPERACAO_HUMANA_2026-07-14.md`; `app/admin/professores` | Backoffice humano possui documento privado, decisao, motivo, disciplinas, MFA, auditoria e revogacao. Falta provisionar operadores reais e ensaiar o SLA. |
| 2026-07-14 | DEC-04 | Negocio definido; infraestrutura pendente | `docs/DEC-04_NEGOCIO_FORNECEDORES_2026-07-14.md` | Lancamento sera 100% gratuito. Postgres, Redis e storage ficam em Docker local provisoriamente; cloud, dominio, storage duravel, backup e operacao ainda bloqueiam producao publica. |
| 2026-07-14 | REDIS-01 | Implementada; smoke pendente | `docker-compose.yml`; `Dockerfile`; `workers/worker.mjs` | Redis de fila usa AOF/noeviction/volume e Redis de cache usa LFU/memoria limitada, ambos sem portas publicas. Compose passa validacao estatica; restart/AOF e isolamento real aguardam daemon Docker funcional. |
| 2026-07-14 | REDIS-02 | Parcialmente implementada | `lib/redis/client.ts`; `workers/runtime.mjs`; `workers/dispatcher.mjs`; `workers/worker.mjs` | URLs, clientes, namespace, fail-fast e shutdown existem. Producao ainda exige TLS/ACL, budgets, metricas e servico escolhido. |
| 2026-07-14 | SEC-01 | Concluida | `lib/auth/redirect.ts`; `tests/oauth-redirect.test.ts` | Redirecionamento interno rejeita host externo, barras invertidas, encoding simples/duplo e caracteres de controle. Teste unitario verde. |
| 2026-07-14 | SEC-02 | Concluida no repositorio | `package.json`; `package-lock.json` | Next 16.2.10 e PostCSS 8.5.19 com override testado. `npm audit --omit=dev --audit-level=moderate` retornou zero vulnerabilidades em 2026-07-14. |
| 2026-07-14 | EVA-01 | Implementada no codigo; E2E pendente | `lib/activities/exam.ts`; `tests/exam-security.test.ts`; actions de submissao | DTO publico remove `correctIndex`; solucoes exigem autoria ou submissao enviada. Teste unitario inspeciona o payload; teste E2E/RSC antes e depois da entrega ainda pende. |
| 2026-07-14 | EVA-02 | Implementada no codigo; integracao remota pendente | `scripts/047_content_submission_access.sql`; `app/actions/content-exercise-submissions.ts`; CI | Politica unica exige aluno ativo/verificado e audiencia valida e e repetida atomicamente no write. CI contem matriz publico/professor/turma/privado/nao verificado. |
| 2026-07-14 | DB-01 | Implementada; integracao remota pendente | `scripts/migrate.mjs`; `scripts/041_queue_outbox.sql` | Manifesto canonico com 33 migrations, ledger, checksum, advisory lock e transacao. Fresh/upgrade real aguardam Docker/CI. |
| 2026-07-14 | DB-02 | Parcialmente implementada | `scripts/migrate.mjs`; `docker-compose.yml` | Migration owner e runtime foram separados; runtime nao e superuser/createdb/createrole. Ainda usa `BYPASSRLS` porque o app nao propaga `auth.uid()` ao banco, portanto o criterio final de menor privilegio nao esta fechado. |
| 2026-07-14 | DB-03 | Parcialmente implementada | `lib/db/transaction.ts`; `lib/queue/outbox.ts`; `app/actions/content-items.ts` | Unidade de trabalho e outbox atomica aplicadas a publicacao de artigo e dica. Demais mutacoes criticas ainda precisam migrar. |
| 2026-07-14 | DB-05 | Parcialmente implementada | `lib/db/pool.ts`; `workers/dispatcher.mjs`; `workers/worker.mjs` | Pools possuem maximo, connect/idle/query/statement/lock/transaction timeout, lifetime, nome e error listener. Pooler, budget por replicas e metricas do provedor pendem. |
| 2026-07-14 | QUEUE-01 | Parcialmente implementada | `scripts/041_queue_outbox.sql`; `lib/queue/outbox.ts` | Outbox, ledger, DLQ, dedup, versao e correlation ID existem. Retencao/purge e testes concorrentes em Postgres real pendem. |
| 2026-07-14 | QUEUE-02 | Parcialmente implementada | `workers/dispatcher.mjs` | Claim com lease/SKIP LOCKED, jobId deterministico, backoff e estado dispatched separado. Reconciliador/alerta de backlog e teste de crash real pendem. |
| 2026-07-14 | QUEUE-03 | Parcialmente implementada | `Dockerfile`; `workers/runtime.mjs`; `workers/worker.mjs` | Worker independente, contrato com metadados e shutdown existem. Compatibilidade N/N-1 e pools por dominio pendem. |
| 2026-07-14 | QUEUE-04 | Parcialmente implementada | `workers/dispatcher.mjs`; `workers/worker.mjs`; `scripts/041_queue_outbox.sql`; `app/admin/filas` | Retry exponencial, ledger idempotente, DLQ persistente e replay com RBAC/auditoria existem. Testes de crash/retry storm e circuit breakers pendem. |
| 2026-07-14 | QUEUE-08 | Implementada no codigo; provider real pendente | `lib/email/delivery.ts`; `workers/worker.mjs`; `scripts/043_email_delivery.sql` | E-mail usa outbox, payload AES-GCM, retry/DLQ, timeout, status e chave de idempotencia. Falta dominio Resend verificado e teste de entrega real. |
| 2026-07-14 | QUEUE-10 | Implementada para purge de conta | rota de cron; `workers/worker.mjs`; `scheduler` | Purge em lote remove objetos antes do hard-delete e e idempotente. Falta ensaio real de retencao/restore. |
| 2026-07-14 | QUEUE-11 | Implementada no repositorio | `app/admin/filas`; `app/actions/admin-queue-operations.ts` | Backlog, heartbeats, DLQ e replay exigem administrador com MFA e geram auditoria. |
| 2026-07-14 | QUEUE-09 | Parcialmente implementada | `workers/worker.mjs`; `scripts/041_queue_outbox.sql` | Notificacao de novo conteudo usa lotes, cursor, preferencia, constraint unica e continuacao via outbox. Metricas, carga e demais eventos pendem. |
| 2026-07-14 | QUEUE-12 | Parcialmente implementada | `app/actions/content-items.ts`; `app/api/professor-verification/upload/route.ts` | Nao existem chamadas `after()` em `app/` ou `lib/`. Estados legados, reconciliacao e ensaio de cutover/rollback ainda pendem. |
| 2026-07-14 | CACHE-01 | Parcialmente implementada | `lib/cache/policy.ts`; `tests/cache-policy.test.ts` | Namespace/versionamento, TTL+jitter e bloqueio de componentes inseguros existem para perfil publico. Registry completo e classificacao por dominio pendem. |
| 2026-07-14 | CACHE-02 | Parcialmente implementada | `lib/cache/cache-aside.ts`; `app/actions/professors.ts` | Cache-aside com timeout, parse, fallback ao DB e revalidacao de visibilidade foi aplicado ao perfil publico. Circuit breaker, single-flight, metricas e teste de outage real pendem. |
| 2026-07-14 | STO-01 | Parcialmente implementada | APIs de upload; `docker/Caddyfile`; `next.config.mjs` | Autenticacao precede parse nas APIs, ingress e servidor limitam 20 MB e limites da UI foram alinhados. Upload direto/streaming e quota de bytes por conta ainda pendem. |
| 2026-07-14 | STO-02 | Implementada no codigo; EICAR pendente | `lib/security/clamav.ts`; `lib/blob.ts`; servico `clamav` | Todo `put()` faz scan fail-closed antes de persistir e documento valida magic bytes. Teste EICAR na stack real ainda pende. |
| 2026-07-14 | STO-05 | Implementada apenas no Docker local | `docker-compose.yml`; `docker/minio/app-policy.json` | Bucket privado e usuario de aplicacao com policy minima sao provisionados por `minio-init`. Criptografia, lifecycle, rotacao e storage de producao seguem pendentes. |
| 2026-07-14 | INFRA-03 | Parcialmente implementada | `Dockerfile`; `docker-compose.yml` | Web, migrator, worker e dispatcher separados, sem root, com limites e healthcheck local. Digest/registry e plataforma real pendem. |
| 2026-07-14 | CICD-01 | Implementada; execucao remota pendente | `.github/workflows/ci.yml`; `eslint.config.mjs`; `next.config.mjs` | CI executa install limpa, lint, typecheck, testes, build, audit, gitleaks e scan de imagem. Localmente lint fecha com zero erros, 12 warnings de imagem; workflow ainda nao rodou no GitHub. |
| 2026-07-14 | CICD-02 | Parcialmente implementada | `.github/workflows/ci.yml` | Job sobe stack real e valida migrations, role, Redis e outbox ate worker. Authz/cache/storage/fresh+upgrade completos ainda pendem. |
| 2026-07-14 | OBS-01 | Parcialmente implementada | `app/api/health/live/route.ts`; `app/api/health/ready/route.ts`; `docker-compose.yml` | Readiness valida config, DB/schema, storage, ClamAV, Redis queue/cache e heartbeats de worker/dispatcher. Sinteticos externos e capacidade pendem. |
| 2026-07-14 | LGPD-04 | Implementada no codigo | `app/api/account/export`; configuracoes de aluno/professor | Titular baixa snapshot JSON consistente dos dados proprios, sem hashes, tokens ou trilhas administrativas; rota e autenticada, no-store e limitada. |
| 2026-07-14 | LGPD-05 | Implementada no codigo; ensaio pendente | exclusao de conta; scheduler; job `account.purge` | Soft-delete revoga sessoes e hard-delete em lote remove objetos apos 30 dias. Restore/purge real ainda deve ser ensaiado. |
| 2026-07-14 | TRUST-01 | Implementada no repositorio; operacao pendente | `app/admin/professores`; `scripts/grant-admin.mjs` | Revisao humana possui MFA, RBAC, documento privado, auditoria, decisao e revogacao. Falta operador real e teste de SLA. |
| 2026-07-14 | PROD-02 | Concluida para preferencias expostas | configuracoes; `lib/notifications/event.ts`; worker | Foram removidos toggles sem backend; novos conteudos e alertas de entrega agora alteram a criacao real de notificacoes. |
| 2026-07-14 | PROD-01 | Concluida para o primeiro lancamento | rotas `tutor`/`revisoes`; editor e navegacao | IA simulada, notas 95/88/92, dialogs e claims foram retirados da superficie; rotas antigas redirecionam. Codigo de integracao permanece inativo para eventual decisao futura. |
| 2026-07-14 | PROD-03 | Concluida na superficie publica | `components/landing`; `app/page.tsx` | Numeros, depoimentos e claims de base de usuarios sem fonte foram removidos. |
| 2026-07-14 | ENG-02 | Implementada no repositorio | `README.md`; `docs/RUNBOOK_PRODUCAO_DOCKER.md`; `docs/STATUS_RELEASE_2026-07-14.md` | Stack, deploy, admin, backup, restore, rollback, escala, evidencias e bloqueios externos foram consolidados; ativacao no host real ainda pende. |

## 18. Conclusao

O caminho de producao nao e apenas adicionar Redis ao Compose. A arquitetura proposta usa Redis de fila e cache separados, BullMQ protegido por transactional outbox, workers independentes, invalidacao de cache por eventos e uma topologia gerenciada/HA no ambiente real.

Ao concluir todas as demandas que bloqueiam producao, demonstrar os gates G0-G5 e obter as aprovacoes tecnicas/operacionais/juridicas, a EduConnect podera entrar em producao de forma controlada. P2/P3 permanecem orientados por carga e SLO, mas qualquer um deles vira bloqueador se os testes do volume de lancamento demonstrarem necessidade.
