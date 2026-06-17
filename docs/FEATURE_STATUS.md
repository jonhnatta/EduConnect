# Estado de Desenvolvimento do EduConnect

> Varredura de código (16/06/2026) classificando funcionalidades em: ✅ real · 🟥 mockado (mostra dado falso) · 🟧 incompleto · ⬜ faltando.
> Total: **73 itens** — 32 reais, 9 mockados, 15 incompletos, 17 faltando.
>
> **Atualização (17/06/2026):** todos os bloqueadores não-IA e a maioria dos importantes foram implementados. Itens concluídos marcados com **✅ CONCLUÍDO** abaixo. O que resta é (a) IA adiada para a API externa e (b) 2 ajustes de honestidade não-IA.

## Resumo Executivo

A promessa central — *"feed enxuto e útil + salas + tutor IA"* — tem um **núcleo forte de salas e conteúdo**, mas os pilares "tutor IA", "feed por quem você segue" e "notificações" ainda **não existem de verdade**.

### 5 itens mais críticos
1. **Tutor IA é falso** — o chat responde 4 frases fixas via `setTimeout`, sem LLM. `app/dashboard/aluno/tutor/page.tsx:55-97`. ⏳ **ADIADO (API de IA externa)**
2. **Feed ignora quem o aluno segue** — feed é global/cronológico; seguir não muda nada. `scripts/200_app_schema_postgres.sql:383-409`. ✅ **CONCLUÍDO** (`scripts/027_feed_follow_ranking.sql`)
3. **Plano "personalizado por IA" é encenação** — onboarding diz "a IA está montando seu plano", mas só faz um INSERT. `app/cadastro/onboarding/page.tsx:102-117`. ⏳ **IA adiada** — falta tornar a mensagem honesta (não-IA, pendente)
4. **Notificações inexistentes no backend** — sem tabela, sem eventos, sininho sempre aceso. `scripts/` (nenhuma tabela). ✅ **CONCLUÍDO** (migrations 030/033, eventos + read-state + sininho condicional)
5. **Exclusão de conta / LGPD** — política cita Art. 18, mas não há mecanismo. Risco legal. ✅ **CONCLUÍDO** (`deleteAccount` + `deleted_at` + cron de purga 30 dias)

> Bônus: o botão **"Salvar preferências"** das Configurações é decorativo (sem `onClick`) — nada nas configurações persiste. ✅ **CONCLUÍDO** (action real + visibilidade + toggles persistem)

---

## 🟥 Mockado (mostra dado falso ao usuário)
- **Tutor IA (aluno)** — `if/else` sobre 4 palavras + `setTimeout`. `tutor/page.tsx:55-97`. **Bloqueador.** ⏳ **ADIADO (API de IA externa)**
- **Plano por IA (onboarding)** — só INSERT; respostas nunca lidas. `cadastro/onboarding/page.tsx:102-117`. **Bloqueador.** ⏳ **IA adiada** — falta ajustar mensagem (não-IA, pendente)
- **Marcos / Conquistas / badges (progresso)** — blocos estáticos; código diz "Mockup de...". `aluno/progresso/page.tsx:142-161,219-236`. Importante. ⏳ **PENDENTE (não-IA)**
- **Notificações (aluno)** — listas literais fixas; botões sem ação. `aluno/notificacoes/page.tsx:7-35`. Importante. ✅ **CONCLUÍDO** (dados reais + marcar lido + paginação)
- **Notificações (professor)** — idem; descrição admite "mockup". `professor/notificacoes/page.tsx:7-26`. Importante. ✅ **CONCLUÍDO**
- **Sininho (bolinha vermelha)** — `<span>` estático, sempre aceso. `_layout-client.tsx` (aluno :97/:235, professor :172/:326). Importante. ✅ **CONCLUÍDO** (badge condicional ao `unreadCount`)
- **"Stories" de professores (feed professor)** — 5 professores fictícios hardcoded. `professor-content-feed.tsx:51-57`. Importante. ✅ **CONCLUÍDO** (bloco fictício removido)
- **Botão "Revisão IA (preview)" no editor** — relatório falso idêntico para todo artigo. `criar-conteudo-client.tsx:511-551`. Importante. ⏳ **ADIADO (API de IA externa)**
- **Cartão "Privacidade" (configurações)** — código se declara "mockup". `aluno/professor-settings-client.tsx`. Desejável. ✅ **CONCLUÍDO** (texto "mockup" removido)

## 🟧 Incompleto (começado, falta peça)
- **Feed por follow** — follow é real, mas a função SQL do feed ignora `teacher_followers`. Importante. ✅ **CONCLUÍDO** (`scripts/027_feed_follow_ranking.sql`)
- **Filtros de categoria do feed** (aluno e professor) — botões decorativos; "Vídeos" nem é tipo existente. Desejável. ✅ **CONCLUÍDO** (Artigos/Exercícios/Provas/Dicas funcionais)
- **Card "Seguidores" (dashboard professor)** — mostra `"—"` apesar de `followers_count` existir. `professor/page.tsx:64`. Importante. ✅ **CONCLUÍDO**
- **"Análise de Desempenho" (professor)** — nome engana: é a lista de revisões de IA, não desempenho de alunos. Importante. ✅ **CONCLUÍDO** (renomeada + dashboard de desempenho consolidado)
- **Salvar conteúdo** — persiste no banco, mas **não há tela "Salvos"** (beco sem saída). Importante. ✅ **CONCLUÍDO** (página "Salvos")
- **Botão "Salvar preferências"** (configurações) — sem `onClick`/action; nada persiste. Importante. ✅ **CONCLUÍDO**
- **Toggle de Perfil público (configurações)** — só muda state local; não salva (coluna existe). Importante. ✅ **CONCLUÍDO**
- **Toggles de notificação** (aluno e professor) — começam `true` fixo, não persistem, sem onde armazenar. Desejável. ✅ **CONCLUÍDO** (persistem em `notification_prefs`)
- **Aba "Avaliações" do perfil público** — placeholder "Em breve". Desejável. ✅ **CONCLUÍDO** (sistema de avaliações do professor)
- **Perfil público do aluno** — dados reais, mas estático, "Sobre" genérico fixo. Desejável. ⏳ **PENDENTE (desejável)**
- **Contagens sociais no header** — metade real, metade `0` fixo (professor "seguindo=0", aluno "seguidores=0"). Desejável. ✅ **CONCLUÍDO**
- **Salvar do próprio conteúdo (feed professor)** — só state local, não chama `toggleContentSave`. Desejável. ✅ **CONCLUÍDO**

## ⬜ Faltando (não existe)
- **Notificações — tabela no banco.** Nenhuma tabela no schema. **Bloqueador.** ✅ **CONCLUÍDO** (migration 030)
- **Notificações — geração de eventos** (novo seguidor, novo conteúdo, atividade corrigida). **Bloqueador.** ✅ **CONCLUÍDO** (os 3 eventos + `review_result`)
- **Feed de quem sigo** — `feed_content_items_for_user` não referencia `teacher_followers`. **Bloqueador.** ✅ **CONCLUÍDO**
- **Exclusão de conta (LGPD)** — sem `deleteAccount`/`deleted_at`. **Bloqueador.** ✅ **CONCLUÍDO** (+ cron de purga 30 dias)
- **Notificações — read-state** (marcar como lido). Importante. ✅ **CONCLUÍDO** (individual + tudo)
- **Tutor IA do professor** — rota/UI não existem. Importante. ⏳ **ADIADO (API de IA externa)**
- **Histórico de conversa do tutor** — sem tabelas; perde tudo ao recarregar. Importante. ⏳ **ADIADO (API de IA externa)**
- **Listas de seguidores/seguindo** — sem tela nem action; contadores não clicáveis. Importante. ✅ **CONCLUÍDO**
- **Rota de desempenho consolidada (cross-turma)** — só existe dentro de cada sala. Importante. ✅ **CONCLUÍDO**
- **Troca de senha autenticada** (nas configurações) — só existe via "esqueci a senha". Importante. ✅ **CONCLUÍDO** (+ rate-limit)
- **Salas ABERTAS vs FECHADAS (reforço)** — toda sala é privada por convite; não há tipo/visibilidade. Importante. ✅ **CONCLUÍDO** (`is_public` + tela Explorar Salas)
- **Streaming do tutor / tratamento de erro do chat.** Desejável/Importante. ⏳ **ADIADO (API de IA externa)**
- **Histórico e gráficos temporais de progresso.** Desejável. ⏳ **PENDENTE (desejável)**
- **Preferências de notificação (e-mail/push).** Desejável. ⏳ **PENDENTE (desejável)**

---

## Próximos a desenvolver (priorizado)

> ⚠️ Decisão (16/06): **toda IA vai consumir uma API externa futura** — itens de IA estão ADIADOS (só deixar o ponto de integração pronto). Ver `memory: project-ai-external-api`.

### Bloqueadores (não-IA — atacar agora)
1. ✅ **Feed de quem sigo** — ligar `teacher_followers` à função do feed.
2. ✅ **Notificações** — fundação (tabela + geração de eventos).
3. ✅ **Exclusão de conta (LGPD)**.
4. ⏳ **Onboarding honesto** — remover/ajustar a mensagem falsa "a IA está montando seu plano" (a IA em si fica para a API externa). **← único não-IA pendente**

### Adiado (depende da API de IA externa)
- ⏳ Tutor IA (aluno e professor) — endpoint, histórico, streaming, erro.
- ⏳ Geração de plano de estudos por IA.
- ⏳ Botão "Revisão IA (preview)" no editor — usar a API real quando existir, ou remover o relatório falso por ora.

### Importantes
6. ✅ Configurações persistirem (action + toggle de visibilidade). 7. ✅ Página "Salvos". 8. ⏳ Tutor IA do professor (adiado-IA). 9. ⏳ Histórico do tutor (adiado-IA). 10. ✅ Listas seguidores/seguindo. 11. ✅ Notificações nas telas + read-state + sininho condicional. 12. ✅ Card "Seguidores" real. 13. ✅ Remover/Substituir "Stories" mockados. 14. ⏳ Revisão IA preview real ou remover (adiado-IA). 15. ✅ Análise de desempenho consolidada (e renomear a atual). 16. ✅ Troca de senha autenticada. 17. ✅ Salas abertas vs fechadas. 18. ✅ Remover textos "Mockup" visíveis e o "0 seguindo/seguidores" fixo (resta apenas o "Mockup" do progresso).

### Desejáveis (pós-lançamento)
⏳ Streaming do tutor; ✅ filtros de feed; ⏳ histórico/gráficos de progresso; ✅ avaliações/reputação do professor; ⏳ perfil de aluno mais social; ✅ paginação do feed/notificações; ⏳ preferências de notificação (e-mail/push).

---

## 📊 Balanço (17/06/2026)

**Concluídos:** todos os 5 bloqueadores não-IA + 13 importantes/incompletos + vários desejáveis.

**Pendentes não-IA (2):**
- Onboarding honesto (ajustar mensagem "A IA está analisando suas respostas")
- Remover textos "Mockup de..." da tela de progresso (marcos/conquistas/badges)

**Adiado para a API de IA externa:** Tutor IA (aluno + professor), plano por IA, revisão IA preview, histórico/streaming do tutor.

**Desejáveis pós-lançamento:** perfil de aluno mais social, histórico/gráficos temporais de progresso, preferências de notificação por e-mail/push.

## ✅ Já real (base sólida — não exige trabalho)
Publicação de conteúdo por tipo; CRUD de salas/atividades/materiais; entrada por código; revisão por IA de artigos (xAI); planner semanal/tarefas/streak; painéis de desempenho de turma e aluno; seguir professor; like/comentário/compartilhamento; verificação de professor por IA (OpenAI).
