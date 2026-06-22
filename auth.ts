import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { queryOne } from "@/lib/db/query"
import { ensureSocialUser } from "@/lib/auth/social-user"
import { checkRateLimit, resetRateLimit } from "@/lib/security/rate-limit"

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
}

type ProfileTokenRow = {
  user_type: string | null
}

const providers = [
  Credentials({
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    authorize: async (raw) => {
      const parsed = credentialsSchema.safeParse(raw)
      if (!parsed.success) return null

      const { email, password } = parsed.data
      const emailKey = email.toLowerCase()

      // Rate limit anti brute-force: 20 tentativas / 15 min por e-mail.
      const allowed = await checkRateLimit(`login:${emailKey}`, 20, 900)
      if (!allowed) return null

      const user = await queryOne<DbUser & { deleted_at: string | null }>(
        `select u.id, u.email, u.password_hash, p.user_type, p.deleted_at
           from public.users u
           left join public.profiles p on p.id = u.id
          where u.email = $1`,
        [emailKey]
      )
      // Sempre executa o compare (com hash real ou dummy) para nao vazar timing.
      const hashToCompare = user?.password_hash ?? DUMMY_BCRYPT_HASH
      const ok = await bcrypt.compare(password, hashToCompare)
      if (!user?.password_hash || !ok) return null
      if (user.deleted_at) return null

      // Login OK: zera o contador de tentativas.
      await resetRateLimit(`login:${emailKey}`)
      return { id: user.id, email: user.email, userType: user.user_type ?? null }
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
  // maxAge curto reduz a janela de exposição de tokens (sem revogação server-side em JWT puro).
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
      const profileRow = await queryOne<{ user_type: string | null; deleted_at: string | null }>(
        "select user_type, deleted_at from public.profiles where id = $1",
        [dbUser.id]
      )
      if (profileRow?.deleted_at) return "/login?error=AccountDeleted"
      ;(user as any).userType = profileRow?.user_type ?? null
      return true
    },
    jwt: async ({ token, user }) => {
      if (user?.id) token.sub = String(user.id)
      if (user?.email) token.email = user.email
      // Persiste o tipo de usuario no token (apenas no login, quando `user` existe).
      if (user) (token as any).userType = (user as any).userType ?? null
      // userType no token serve apenas para UX (redirecionamento no middleware).
      // Nunca use como fonte de verdade para autorização — use lib/auth/guards.ts,
      // que consulta o banco diretamente a cada requisição protegida.
      if (!user && token.sub && !(token as any).userType) {
        const profileRow = await queryOne<ProfileTokenRow>(
          "select user_type from public.profiles where id = $1",
          [String(token.sub)]
        )
        ;(token as any).userType = profileRow?.user_type ?? null
      }
      return token
    },
    session: async ({ session, token }) => {
      if (session.user && token.sub) {
        // next-auth types keep id optional; attach for server usage.
        ;(session.user as any).id = token.sub
        ;(session.user as any).userType = (token as any).userType ?? null
      }
      return session
    },
  },
})
