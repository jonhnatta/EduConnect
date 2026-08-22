import Redis from "ioredis"

declare global {
  var __redisCache: Redis | undefined
  var __redisCacheConnect: Promise<void> | undefined
}

function requiredUrl(name: "REDIS_CACHE_URL"): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing env var: ${name}`)
  const url = new URL(value)
  const insecureAllowed = process.env.REDIS_ALLOW_INSECURE === "true"
  if (process.env.NODE_ENV === "production" && url.protocol !== "rediss:" && !insecureAllowed) {
    throw new Error(`${name} must use TLS outside the local Docker network`)
  }
  return value
}

export function redisCache(): Redis {
  if (globalThis.__redisCache) return globalThis.__redisCache

  const client = new Redis(requiredUrl("REDIS_CACHE_URL"), {
    lazyConnect: true,
    connectTimeout: 2_000,
    commandTimeout: 1_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  })
  client.on("error", (error) => {
    console.error(JSON.stringify({ event: "redis.cache.error", message: error.message }))
  })
  globalThis.__redisCache = client
  return client
}

export async function ensureRedisCacheReady(): Promise<Redis> {
  const client = redisCache()
  if (client.status === "ready") return client
  if (!globalThis.__redisCacheConnect) {
    globalThis.__redisCacheConnect = client.connect().finally(() => {
      globalThis.__redisCacheConnect = undefined
    })
  }
  await globalThis.__redisCacheConnect
  return client
}
