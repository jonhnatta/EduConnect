"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { ADMIN_MFA_COOKIE, createAdminMfaToken, getAdminRoleAccess } from "@/lib/auth/admin"
import { decryptTotpSecret, verifyTotp } from "@/lib/auth/totp"
import { checkRateLimit } from "@/lib/security/rate-limit"

export async function confirmAdminMfa(formData: FormData) {
  const access = await getAdminRoleAccess()
  if (!access) redirect("/login")
  const allowed = await checkRateLimit(`admin-mfa:${access.userId}`, 8, 900, { failClosed: true })
  const code = String(formData.get("code") ?? "")
  if (!allowed || !verifyTotp(decryptTotpSecret(access.totpSecretEncrypted), code)) {
    redirect("/admin/mfa?error=invalid")
  }
  const store = await cookies()
  store.set(ADMIN_MFA_COOKIE, createAdminMfaToken(access.userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: 8 * 60 * 60,
  })
  redirect("/admin/professores")
}
