# Unified Environment Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidar a configuração local e da VPS em um único `.env.example`, usando `.env` como arquivo privado por máquina e removendo templates redundantes.

**Architecture:** Docker Compose continuará sendo a fronteira única de execução local e da VPS. O repositório versionará apenas `.env.example`; cada máquina terá seu próprio `.env`, com os mesmos nomes de variáveis e valores específicos do ambiente. O `.env` atual será preservado em um backup local ignorado antes da reorganização.

**Tech Stack:** Docker Compose v2, Next.js 16, Node.js 24, testes nativos `node:test`.

---

### Task 1: Criar o contrato canônico de ambiente

**Files:**
- Create: `.env.example`
- Create: `tests/environment-template.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Escrever o teste que exige um único modelo**

Adicionar um teste que carregue `.env.example`, `.env.docker.example` e `.env.production.example`. Ele deverá exigir o arquivo canônico, rejeitar os dois modelos antigos e verificar as variáveis críticas:

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"

test("repository exposes one complete environment template", () => {
  assert.equal(existsSync(".env.example"), true)
  assert.equal(existsSync(".env.docker.example"), false)
  assert.equal(existsSync(".env.production.example"), false)
  const template = readFileSync(".env.example", "utf8")
  for (const key of [
    "AUTH_URL", "POSTGRES_PASSWORD", "REDIS_QUEUE_PASSWORD", "S3_SECRET_KEY",
    "OPENAI_API_KEY", "QDRANT_API_KEY", "LANGFUSE_SECRET_KEY",
  ]) assert.match(template, new RegExp(`^${key}=`, "m"))
})
```

Adicionar `test:env-config` e incluí-lo em `npm test`.

- [ ] **Step 2: Executar o teste e confirmar RED**

Run: `npx -y -p node@24 -c 'node --test tests/environment-template.test.ts'`

Expected: FAIL porque `.env.example` ainda não existe e os exemplos antigos ainda existem.

- [ ] **Step 3: Criar `.env.example` completo**

Consolidar a união dos dois modelos atuais. Usar `localhost` nos valores que permitem execução local e marcadores explícitos para credenciais:

```dotenv
APP_DOMAIN=localhost
AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
ALLOW_INSECURE_LOCAL_ORIGIN=true

FEATURE_AI_COPILOT=false
OPENAI_API_KEY=CHANGE_ME_OPENAI_API_KEY
QDRANT_API_KEY=CHANGE_ME_QDRANT_API_KEY
LANGFUSE_SECRET_KEY=CHANGE_ME_LANGFUSE_SECRET_KEY
```

Incluir todas as variáveis obrigatórias do Compose base e do overlay de IA. Organizar nas treze seções definidas na especificação. Explicar nos comentários quais quatro URLs mudam na VPS e como gerar segredos com `openssl`.

- [ ] **Step 4: Remover modelos redundantes**

Excluir `.env.docker.example` e `.env.production.example`. Excluir também `.env.ai.local`, que é local, ignorado e foi criado somente para o teste interrompido.

- [ ] **Step 5: Executar o teste e confirmar GREEN**

Run: `npx -y -p node@24 -c 'node --test tests/environment-template.test.ts'`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .env.example .env.docker.example .env.production.example tests/environment-template.test.ts package.json
git commit -m "refactor(config): unify environment template"
```

### Task 2: Organizar o arquivo privado da máquina

**Files:**
- Preserve: `.env.local`
- Move locally: `.env` to `.env.legacy.local`
- Create locally: `.env`
- Modify: `.gitignore`
- Modify: `.dockerignore`

- [ ] **Step 1: Confirmar proteção contra versionamento**

Run: `git check-ignore .env .env.local .env.legacy.local`

Expected: os três caminhos são ignorados.

- [ ] **Step 2: Preservar o ambiente legado**

Se `.env` existir e `.env.legacy.local` não existir, mover `.env` para `.env.legacy.local`. Nunca sobrescrever um backup existente. Copiar `.env.example` para o novo `.env`.

O resultado local deverá ser:

```text
.env                 configuração Docker a preencher
.env.local           configuração Next.js antiga preservada
.env.legacy.local    backup recuperável do antigo .env
```

- [ ] **Step 3: Simplificar regras de ignore**

Manter `.env` e `.env*.local` ignorados pelo Git. No `.dockerignore`, manter `.env` e `.env*` fora do contexto da imagem, removendo somente regras redundantes que mencionam arquivos excluídos.

- [ ] **Step 4: Verificar que nenhum segredo foi preparado para commit**

Run: `git status --short --ignored | grep -E '\.env($|\.)'`

Expected: `.env`, `.env.local` e `.env.legacy.local` aparecem como ignorados; somente `.env.example` pode estar versionado.

- [ ] **Step 5: Commit das regras versionadas**

```bash
git add .gitignore .dockerignore
git commit -m "chore(config): protect machine environment files"
```

### Task 3: Atualizar documentação e comandos

**Files:**
- Modify: `README.md`
- Modify: `docs/RUNBOOK_PRODUCAO_DOCKER.md`
- Modify: `docs/SECURITY_AUDIT.md`
- Modify: `docs/superpowers/plans/2026-08-24-ai-foundation-knowledge.md`

- [ ] **Step 1: Atualizar o fluxo local**

Documentar no README:

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.ai.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.ai.yml up -d --build
```

Explicar que `FEATURE_AI_COPILOT=false` permite subir a infraestrutura sem liberar o recurso e que uma chave OpenAI real é necessária antes de processar embeddings.

- [ ] **Step 2: Atualizar o fluxo da VPS**

No runbook, usar o mesmo `.env.example` e os mesmos arquivos Compose, adicionando `--profile production`:

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.ai.yml --profile production config --quiet
docker compose -f docker-compose.yml -f docker-compose.ai.yml --profile production up -d --build
```

- [ ] **Step 3: Remover recomendações operacionais obsoletas**

Atualizar documentos atuais para `.env.example`. Preservar a auditoria histórica em `docs/AUDITORIA_PRODUCAO_ESCALABILIDADE_2026-07-14.md`, porque ela descreve o estado observado em 2026-07-14 e não é uma instrução operacional vigente.

- [ ] **Step 4: Verificar referências**

Run:

```bash
rg -n "cp \.env\.docker\.example|cp \.env\.production\.example|--env-file \.env\.docker\.example" README.md docs
```

Expected: nenhuma ocorrência em documentação operacional ou planos executáveis atuais.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/RUNBOOK_PRODUCAO_DOCKER.md docs/SECURITY_AUDIT.md docs/superpowers/plans/2026-08-24-ai-foundation-knowledge.md
git commit -m "docs(config): document one environment workflow"
```

### Task 4: Verificação integrada

**Files:**
- Test: `tests/environment-template.test.ts`
- Test: `tests/ai-infrastructure.test.ts`
- Test: `tests/production-security.test.ts`

- [ ] **Step 1: Validar o modelo sem usar credenciais reais**

Criar um arquivo temporário fora do repositório a partir de `.env.example`, substituir todos os marcadores `CHANGE_ME_*` por valores sintéticos válidos e usá-lo somente nos comandos de configuração.

- [ ] **Step 2: Validar os dois composes**

Run:

```bash
docker compose --env-file <arquivo-temporario> -f docker-compose.yml config --quiet
docker compose --env-file <arquivo-temporario> -f docker-compose.yml -f docker-compose.ai.yml config --quiet
```

Expected: ambos saem com código zero.

- [ ] **Step 3: Confirmar fail-closed**

Remover `QDRANT_API_KEY` da cópia temporária e executar o Compose com overlay.

Expected: código diferente de zero e mensagem de variável obrigatória, sem imprimir qualquer segredo real.

- [ ] **Step 4: Executar verificações do projeto**

Run:

```bash
npx -y -p node@24 -c 'npm test'
npx -y -p node@24 -c './node_modules/.bin/tsc --noEmit'
npx -y -p node@24 -c 'npm run lint'
git diff --check
git status --short
```

Expected: testes e TypeScript passam; lint sem erros; nenhum arquivo real de ambiente aparece preparado para commit.

- [ ] **Step 5: Commit final de ajustes de teste**

```bash
git add tests/environment-template.test.ts package.json package-lock.json
git commit -m "test(config): verify unified environment workflow"
```
