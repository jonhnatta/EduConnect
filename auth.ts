import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { queryOne } from "@/lib/db/query"
import { ensureSocialUser } from "@/lib/auth/social-user"

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

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
      const user = await queryOne<DbUser>(
        `select u.id, u.email, u.password_hash, p.user_type
           from public.users u
           left join public.profiles p on p.id = u.id
          where u.email = $1`,
        [email.toLowerCase()]
      )
      if (!user?.password_hash) return null

      const ok = await bcrypt.compare(password, user.password_hash)
      if (!ok) return null

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
  session: { strategy: "jwt" },
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
      const profileRow = await queryOne<{ user_type: string | null }>(
        "select user_type from public.profiles where id = $1",
        [dbUser.id]
      )
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
