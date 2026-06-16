# Prontidão para Produção — EduConnect

Avaliação para lançar e obter os primeiros clientes. Ordenado por bloqueio.
Contexto: Next.js 16 (App Router), Postgres via `pg`, NextAuth v5 (JWT), Vercel Blob, Resend (e-mail), xAI (moderação). Deploy atual: Docker Compose (app + 1 Postgres em volume local).

---

## 🔴 BLOQUEADORES — não dá para lançar sem

1. **Aprovação de professor.** ✅ *Implementado (16/06) — fluxo por IA + fila manual:*
   - No upload do documento, uma análise automática **plugável** decide: imagem reconhecida como professor → `approved`; caso contrário (incl. PDF e quando nenhum provedor está configurado) → `rejected`.
   - No `rejected`, o dashboard do professor mostra um botão **"Solicitar análise manual"** → entra na fila `pending` (com `manual_requested_at`).
   - **Relatório diário** (`node scripts/report-professores-manuais.mjs`, ou `scripts/reports/professores_analise_manual.sql`) lista a fila para revisão humana; aprovar/reprovar via UPDATE até existir um painel.
   - **Provedor de IA plugável** (`lib/professor-verification/analyze.ts`). ✅ *Ativo: OpenAI `gpt-4o-mini` (visão) via API externa* — `PROFESSOR_VERIFICATION_PROVIDER=openai`. Imagens de documento são analisadas e aprovadas automaticamente quando há alta confiança; PDFs e falhas vão para a fila manual. Alternativas: `xai`, `anthropic` (ponto de extensão). **Pendente:** painel admin (hoje a decisão manual final é por UPDATE no banco).

2. **Armazenamento de arquivos em modo simulador.** `.env` tem `UPLOAD_SIMULATOR=true` → uploads vão para `/tmp/blob-sim` (efêmero, some no restart, não escala). Produção precisa do **Vercel Blob real (token válido) ou S3/R2**. Você já relatou o Blob estourando o limite — definir o storage e o plano é pré-requisito.

3. **Banco de dados de produção.** Hoje é um container Postgres com volume local — sem backup, sem alta disponibilidade, sem restore. Produção precisa de **Postgres gerenciado** (Neon, Supabase, RDS) com **backups automáticos** e um plano de restore.

4. **Conformidade LGPD / páginas legais.** ✅ *Parcial (16/06):* criadas as páginas `/termos`, `/privacidade` (LGPD) e `/cookies`, banner de consentimento de cookies, aceite obrigatório de Termos no cadastro (senha **e** login social) com registro de consentimento (`profiles.terms_accepted_at`, migração `025`). **Falta:** preencher os dados da empresa nos placeholders `[ ]`, revisão jurídica, e um fluxo de exclusão/exportação de dados (direitos do titular).

5. **Segredos e config de produção.** `AUTH_SECRET` foi rotacionado (ok), mas falta um processo de gestão de segredos por ambiente (não usar o `.env` de dev em prod). Revisar todas as chaves: `BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY`, `XAI_API_KEY`, `AUTH_GOOGLE_*`.

6. **Domínio de e-mail verificado.** `PASSWORD_RESET_FROM_EMAIL` cai no `onboarding@resend.dev` (sandbox). Sem **domínio verificado no Resend (SPF/DKIM)**, e-mails caem em spam ou são bloqueados — quebra recuperação de senha e qualquer comunicação.

7. **Menor privilégio no banco (Onda 4 da auditoria).** App ainda conecta como superuser Postgres. Script `024_least_privilege_app_role.sql` pronto para aplicar e testar.

---

## 🟠 ESSENCIAIS PARA OS PRIMEIROS CLIENTES

8. **Modelo de monetização** (se os clientes pagam). **Não há nenhuma integração de pagamento** (a página "plano" é plano de estudos, não cobrança). Se o lançamento é pago, falta tudo: gateway (Stripe/Mercado Pago), planos, checkout, webhooks, controle de assinatura/acesso.

9. **Rate limiting.** Nenhum endpoint tem limite (login, signup, reset de senha, upload, preview de sala por código). Aberto a abuso/força-bruta. Precisa de um limitador (por IP/usuário).

10. **Monitoramento de erros e uptime.** Sem Sentry/observabilidade, sem healthcheck, sem alertas. Em produção você fica cego para falhas. Adicionar error tracking + `/api/health` + uptime check.

11. **Verificação de e-mail no cadastro.** Signup por senha não verifica e-mail (origem do risco de account-takeover já corrigido em parte). Para produção, **confirmar e-mail** antes de liberar a conta.

12. **Aceite de Termos no cadastro.** ✅ *Feito (16/06):* checkbox obrigatório de Termos + Privacidade no cadastro por senha e no onboarding via Google, com consentimento gravado em `profiles.terms_accepted_at`.

13. **`ignoreBuildErrors: true` no `next.config`.** O build ignora erros de TypeScript — um erro real passa para produção silenciosamente. Remover e fazer o build falhar de verdade.

---

## 🟡 IMPORTANTE (logo após o lançamento)

14. **Cobertura de testes.** Só 2 arquivos de teste. Cobrir os fluxos críticos: auth, submissão/correção de prova, autorização (os IDORs recém-corrigidos), pagamento (se houver).

15. **CI/CD.** Não há `.github/workflows`. Pipeline mínimo: typecheck + lint + testes + build a cada push; deploy automatizado.

16. **Headers de segurança.** Sem CSP, HSTS, X-Frame-Options, Referrer-Policy. Adicionar no `next.config`/middleware.

17. **Performance.** `images.unoptimized: true` (sem otimização de imagem). Avaliar otimização, caching e índices no banco para as queries de feed/explorar sob carga.

18. **Moderação de conteúdo.** Existe um agente de revisão (xAI) — validar custo, limites de API, fallback se a IA falhar, e fila de revisão humana para casos sinalizados.

19. **Sistema de notificações / e-mails transacionais.** Só existe e-mail de reset. Faltam: boas-vindas, confirmação de e-mail, aviso de aprovação de professor, notificações de sala/atividade.

20. **Acessibilidade e SEO.** Revisar a11y (contraste, foco, labels) e SEO/metadata para descoberta orgânica.

---

## 🔵 OPERACIONAL / NEGÓCIO

- **Canal de suporte** (e-mail/chat) e página de contato.
- **Onboarding** guiado para professor (com expectativa de prazo de aprovação) e aluno.
- **Analytics de produto** (Vercel Analytics já está instalado — configurar eventos-chave).
- **Domínio + DNS + HTTPS** configurados no provedor de deploy.
- **Política de retenção/backup** e runbook de incidentes.
- **Página de status** e termos de SLA (se vender para instituições).

---

## Sequência sugerida até o lançamento

**Fase 1 (bloqueadores técnicos):** storage real (#2) → Postgres gerenciado + backup (#3) → menor privilégio (#7) → domínio de e-mail (#6) → segredos de prod (#5).
**Fase 2 (operar com clientes):** painel admin de aprovação (#1) → páginas legais + aceite + LGPD (#4, #12) → verificação de e-mail (#11) → rate limiting (#9) → monitoramento (#10) → remover `ignoreBuildErrors` (#13).
**Fase 3 (monetização, se aplicável):** integração de pagamento (#8).
**Fase 4 (qualidade contínua):** testes (#14), CI/CD (#15), headers (#16), performance (#17), notificações (#19).
