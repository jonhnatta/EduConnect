import { ensureRedisCacheReady } from "@/lib/redis/client"
import { cacheKey, ttlWithJitter } from "@/lib/cache/policy"

type CacheAsideOptions<T> = {
  namespace: string
  id: string
  ttlSeconds: number
  load: () => Promise<T>
  parse: (value: unknown) => T | null
}

export async function cacheAside<T>(options: CacheAsideOptions<T>): Promise<T> {
  if (process.env.CACHE_ENABLED !== "true" || !process.env.REDIS_CACHE_URL) {
    return options.load()
  }

  const key = cacheKey(options.namespace, options.id)
  try {
    const redis = await ensureRedisCacheReady()
    const cached = await redis.get(key)
    if (cached) {
      const parsed = options.parse(JSON.parse(cached))
      if (parsed !== null) return parsed
      await redis.del(key).catch(() => {})
    }
  } catch (error) {
    console.error(JSON.stringify({
      event: "cache.read_fallback",
      namespace: options.namespace,
      message: error instanceof Error ? error.message : "unknown",
    }))
  }

  const value = await options.load()
  if (value !== null && value !== undefined) {
    try {
      const redis = await ensureRedisCacheReady()
      await redis.set(key, JSON.stringify(value), "EX", ttlWithJitter(options.ttlSeconds))
    } catch (error) {
      console.error(JSON.stringify({
        event: "cache.write_skipped",
        namespace: options.namespace,
        message: error instanceof Error ? error.message : "unknown",
      }))
    }
  }
  return value
}
