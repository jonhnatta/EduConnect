import { randomInt } from "node:crypto"

const SAFE_PART = /^[a-zA-Z0-9:_-]{1,180}$/

export function cacheKey(namespace: string, id: string): string {
  if (!SAFE_PART.test(namespace) || !SAFE_PART.test(id)) {
    throw new Error("Invalid cache key component")
  }
  const prefix = process.env.REDIS_NAMESPACE ?? "educonnect:local"
  return `${prefix}:cache:v1:${namespace}:${id}`
}

export function ttlWithJitter(ttlSeconds: number): number {
  const base = Math.max(1, Math.floor(ttlSeconds))
  const jitter = Math.max(1, Math.floor(base * 0.1))
  return base + randomInt(0, jitter + 1)
}
