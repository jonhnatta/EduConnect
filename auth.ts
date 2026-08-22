import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { queryOne } from "@/lib/db/query"
import { ensureSocialUser } from "@/lib/auth/social-user"
import { checkRateLimit, resetRateLimit } from "@/lib/security/rate-limit"
import { isSessionAccountStateValid } from "@/lib/auth/session-state"
import { securityFingerprint, trustedClientIp } from "@/lib/security/request-identity"

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

// Hash bcrypt fixo (custo 12) usado quando o usuario nao existe ou e OAuth-only.
// Garante que authorize() sempre execute um bcrypt.compare, eliminando o sinal de
// timing que distinguia "sem conta / OAuth-only" de "senha incorreta" (anti-enumeracao).
const DUMMY_BCRYPT_HASH =
  "$2b$12$q.ul727zW.Gkg.nHsQAAtO/C22WWNwNWbBqOp465VkOwZqU4.bg7O"

type DbUser = {
  id: string
  email: string
  password_hash: string | null
  user_type: string | null
  session_version: string | number
  account_status: string | null
  deleted_at: string | null
  email_verified_at: string | null
}

type ProfileTokenRow = {
  user_type: string | null
  deleted_at: string | null
  account_status: string | null
  session_version: string | number
  email_verified_at: string | null
}

const providers = [
  Credentials({
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    authorize: async (raw, request) => {
      const parsed = credentialsSchema.safeParse(raw)
      if (!parsed.success) return null

      const { email, password } = parsed.data
      const emailKey = email.toLowerCase()
      const loginKey = securityFingerprint(`${emailKey}:${trustedClientIp(request)}`)

      // Rate limit anti brute-force: 20 tentativas / 15 min por e-mail.
      const allowed = await checkRateLimit(`login:${loginKey}`, 20, 900, { failClosed: true })
      if (!allowed) return null

      const user = await queryOne<DbUser>(
        `select u.id, u.email, u.password_hash, u.session_version, u.email_verified_at,
                p.user_type, p.deleted_at, p.account_status
           from public.users u
           left join public.profiles p on p.id = u.id
          where u.email = $1`,
        [emailKey]
      )
      // Sempre executa o compare (com hash real ou dummy) para nao vazar timing.
      const hashToCompare = user?.password_hash ?? DUMMY_BCRYPT_HASH
      const ok = await bcrypt.compare(password, hashToCompare)
      if (!user?.password_hash || !ok) return null
      if (!user.email_verified_at) return null
      if (user.deleted_at || user.account_status !== "active") return null

      // Login OK: zera o contador de tentativas.
      await resetRateLimit(`login:${loginKey}`)
      return {
        id: user.id,
        email: user.email,
        userType: user.user_type ?? null,
        sessionVersion: Number(user.session_version),
      }
    },
  }),
]

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }) as any,
  )
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // O JWT e curto, mas tambem e revogado imediatamente por session_version.
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
  providers,
  callbacks: {
    signIn: async ({ user, account, profile }) => {
      if (account?.provider !== "google") {
        return true
      }

      const email = user.email || (profile as any)?.email
      const providerAccountId = account.providerAccountId

      if (!email || !providerAccountId) {
        return "/login?error=OAuthEmailMissing"
      }

      const dbUser = await ensureSocialUser({
        provider: "google",
        providerAccountId,
        email,
        emailVerified: Boolean((profile as any)?.email_verified),
        name: user.name ?? (profile as any)?.name ?? null,
        avatarUrl: user.image ?? (profile as any)?.picture ?? null,
      })

      if (!dbUser) {
        return "/login?error=OAuthCreateAccount"
      }

      user.id = dbUser.id
      user.email = dbUser.email
      const profileRow = await queryOne<ProfileTokenRow>(
        `select p.user_type, p.deleted_at, p.account_status, u.session_version, u.email_verified_at
           from public.profiles p
           join public.users u on u.id = p.id
          where p.id = $1`,
        [dbUser.id]
      )
      if (!profileRow || !profileRow.email_verified_at || profileRow.deleted_at || profileRow.account_status !== "active") {
        return "/login?error=AccountDeleted"
      }
      ;(user as any).userType = profileRow?.user_type ?? null
      ;(user as any).sessionVersion = Number(profileRow.session_version)
      return true
    },
    jwt: async ({ token, user }) => {
      if (user?.id) token.sub = String(user.id)
      if (user?.email) token.email = user.email
      if (user) {
        ;(token as any).userType = (user as any).userType ?? null
        ;(token as any).sessionVersion = Number((user as any).sessionVersion)
      }

      // Toda leitura de sessao revalida a conta no banco. Falha de banco e estado
      // divergente sao fail-closed: o token perde o subject e deixa de autenticar.
      if (token.sub) {
        try {
          const state = await queryOne<ProfileTokenRow>(
            `select p.user_type, p.deleted_at, p.account_status, u.session_version, u.email_verified_at
               from public.profiles p
               join public.users u on u.id = p.id
              where p.id = $1`,
            [String(token.sub)]
          )
          if (!isSessionAccountStateValid((token as any).sessionVersion, state ? {
            sessionVersion: state.session_version,
            emailVerifiedAt: state.email_verified_at,
            deletedAt: state.deleted_at,
            accountStatus: state.account_status,
          } : null)) {
            delete token.sub
            ;(token as any).invalidated = true
          } else {
            ;(token as any).userType = state!.user_type ?? null
          }
        } catch {
          delete token.sub
          ;(token as any).invalidated = true
        }
      }
      return token
    },
    session: async ({ session, token }) => {
      if ((token as any).invalidated || !token.sub) {
        ;(session as any).user = null
      } else if (session.user) {
        // next-auth types keep id optional; attach for server usage.
        ;(session.user as any).id = token.sub
        ;(session.user as any).userType = (token as any).userType ?? null
      }
      return session
    },
  },
})
