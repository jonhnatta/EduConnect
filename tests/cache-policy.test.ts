import assert from "node:assert/strict"
import test from "node:test"
import { cacheKey, ttlWithJitter } from "../lib/cache/policy.ts"

test("builds namespaced and versioned cache keys", () => {
  const previous = process.env.REDIS_NAMESPACE
  process.env.REDIS_NAMESPACE = "educonnect:test"
  try {
    assert.equal(
      cacheKey("professor-profile", "abc-123:v1"),
      "educonnect:test:cache:v1:professor-profile:abc-123:v1"
    )
  } finally {
    if (previous === undefined) delete process.env.REDIS_NAMESPACE
    else process.env.REDIS_NAMESPACE = previous
  }
})

test("rejects unsafe or PII-like cache key components", () => {
  assert.throws(() => cacheKey("profile", "user@example.com"))
  assert.throws(() => cacheKey("profile", "../../secret"))
})

test("adds bounded positive TTL jitter", () => {
  for (let i = 0; i < 50; i += 1) {
    const ttl = ttlWithJitter(60)
    assert.ok(ttl >= 60 && ttl <= 66)
  }
})
