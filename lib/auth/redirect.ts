export type UserType = "aluno" | "professor"

export function dashboardPathForUserType(userType: UserType) {
  return userType === "professor" ? "/dashboard/professor" : "/dashboard/aluno"
}

export function authRedirectPath(userType: string | null | undefined) {
  if (userType === "aluno" || userType === "professor") {
    return dashboardPathForUserType(userType)
  }

  return "/cadastro/tipo-conta"
}

export function profileRedirectPath(profile: {
  user_type: string | null | undefined
  professor_verification_status?: string | null
}) {
  if (profile.user_type === "aluno") {
    return "/dashboard/aluno"
  }

  if (profile.user_type === "professor") {
    if (profile.professor_verification_status === "approved") {
      return "/dashboard/professor"
    }

    if (profile.professor_verification_status === "pending") {
      return "/dashboard/professor?status=pendente"
    }

    return "/cadastro/tipo-conta"
  }

  return "/cadastro/tipo-conta"
}

export function safeInternalPath(next: string | null): string | null {
  if (!next || next.length > 2048 || !next.startsWith("/")) {
    return null
  }

  // WHATWG URL normalizes backslashes as path separators. Decode repeatedly so
  // encoded and double-encoded variants cannot become an external authority.
  let decoded = next
  for (let i = 0; i < 3; i += 1) {
    try {
      const value = decodeURIComponent(decoded)
      if (value === decoded) break
      decoded = value
    } catch {
      return null
    }
  }

  if (
    decoded.startsWith("//") ||
    decoded.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(decoded)
  ) {
    return null
  }

  const base = new URL("https://educonnect.internal")
  const candidate = new URL(next, base)
  if (candidate.origin !== base.origin) return null

  return `${candidate.pathname}${candidate.search}${candidate.hash}`
}

/**
 * Mantém a página que inicia o OAuth no mesmo origin configurado para o callback.
 * Cookies PKCE são host-only: 127.0.0.1 e localhost não são intercambiáveis.
 */
export function canonicalAuthPageUrl(
  requestUrl: string,
  configuredUrl: string | null | undefined,
): string | null {
  if (!configuredUrl) return null

  try {
    const current = new URL(requestUrl)
    const configured = new URL(configuredUrl)
    if (
      (configured.protocol !== "http:" && configured.protocol !== "https:") ||
      configured.username ||
      configured.password ||
      current.origin === configured.origin
    ) {
      return null
    }

    return new URL(`${current.pathname}${current.search}`, configured.origin).toString()
  } catch {
    return null
  }
}
