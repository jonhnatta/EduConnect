# syntax=docker/dockerfile:1

# ---- Base ----
FROM node:24-alpine AS base
WORKDIR /app
# libc6-compat ajuda algumas dependencias nativas no Alpine
RUN apk add --no-cache libc6-compat

# ---- Dependencias ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build ----
FROM base AS builder
# NEXT_PUBLIC_* sao inlinadas no build; o valor pode ser sobrescrito via build-arg
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- Runtime ----
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Usuario sem privilegios
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Saida standalone do Next: server.js + dependencias minimas
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# O tracing standalone do Next pode preservar apenas o package.json do ioredis.
# Copiamos o cliente e suas dependencias runtime para que readiness/cache funcionem.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/ioredis ./node_modules/ioredis
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@ioredis/commands ./node_modules/@ioredis/commands
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/cluster-key-slot ./node_modules/cluster-key-slot
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/debug ./node_modules/debug
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/denque ./node_modules/denque
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/lodash.defaults ./node_modules/lodash.defaults
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/lodash.isarguments ./node_modules/lodash.isarguments
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/ms ./node_modules/ms
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/redis-errors ./node_modules/redis-errors
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/redis-parser ./node_modules/redis-parser
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/standard-as-callback ./node_modules/standard-as-callback
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

# Worker executa fora do ciclo de vida HTTP. Ele recebe somente o runtime de filas
# e pode ser escalado independentemente do servico web.
FROM deps AS worker
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY workers ./workers
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 worker
USER worker
CMD ["node", "workers/worker.mjs"]

FROM deps AS migrator
ENV NODE_ENV=production
COPY scripts ./scripts
USER node
CMD ["node", "scripts/migrate.mjs"]
