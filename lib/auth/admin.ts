import { createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { getAuthedUser } from "@/lib/auth/user"
import { queryOne } from "@/lib/db/query"

export const ADMIN_MFA_COOKIE = "educonnect_admin_mfa"

export type AdminAccess = {
  userId: string
  email: string
  role: "reviewer" | "admin"
  totpSecretEncrypted: string
}

function signingSecret(): string {
  const value = process.env.ADMIN_SESSION_SECRET
  if (!value || value.length < 32) throw new Error("ADMIN_SESSION_SECRET must have at least 32 characters")
  return value
}

export async function getAdminRoleAccess(): Promise<AdminAccess | null> {
  const user = await getAuthedUser()
  if (!user?.email) return null
  const admin = await queryOne<{ role: "reviewer" | "admin"; totp_secret_encrypted: string }>(
    `select a.role, a.totp_secret_encrypted
       from public.admin_users a
       join public.users u on u.id = a.user_id
      where a.user_id = $1 and a.active = true and u.email_verified_at is not null`,
    [user.id]
  ).catch(() => null)
  if (!admin) return null
  return {
    userId: user.id,
    email: user.email,
    role: admin.role,
    totpSecretEncrypted: admin.totp_secret_encrypted,
  }
}

export function createAdminMfaToken(userId: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt: now + 8 * 60 * 60 * 1000 })).toString("base64url")
  const signature = createHmac("sha256", signingSecret()).update(payload).digest("base64url")
  return `${payload}.${signature}`
}

function verifyAdminMfaToken(value: string, userId: string, now = Date.now()): boolean {
  const [payload, signature] = value.split(".")
  if (!payload || !signature) return false
  const expected = createHmac("sha256", signingSecret()).update(payload).digest("base64url")
  const expectedBytes = Buffer.from(expected)
  const signatureBytes = Buffer.from(signature)
  if (expectedBytes.length !== signatureBytes.length || !timingSafeEqual(expectedBytes, signatureBytes)) {
    return false
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    return parsed.userId === userId && Number(parsed.expiresAt) > now
  } catch {
    return false
  }
}

export async function getAdminMfaAccess(): Promise<AdminAccess | null> {
  const access = await getAdminRoleAccess()
  if (!access) return null
  const value = (await cookies()).get(ADMIN_MFA_COOKIE)?.value
  if (!value || !verifyAdminMfaToken(value, access.userId)) return null
  return access
}
