import { createHmac } from "node:crypto"

export function securityFingerprint(value: string): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error("Missing env var: AUTH_SECRET")
  return createHmac("sha256", secret).update(value.trim().toLowerCase()).digest("hex")
}

export function trustedClientIp(request: Request): string {
  if (process.env.TRUST_PROXY_HEADERS !== "true") return "direct"
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    const values = forwarded.split(",").map((value) => value.trim()).filter(Boolean)
    if (values.length) return values.at(-1)!
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown"
}
