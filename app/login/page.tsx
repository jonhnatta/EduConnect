"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { getProviders, signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { GraduationCap, Eye, EyeOff, Mail, Lock, ArrowRight, AlertCircle } from "lucide-react"
import { safeInternalPath } from "@/lib/auth/redirect"

function buildAuthRedirectUrl(next?: string) {
  // Usa o origin real do browser para evitar que o NextAuth produza URLs com
  // 0.0.0.0:3000 (endereço de bind do servidor, não o host acessível pelo usuário).
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const path = next ? `/auth/redirect?next=${encodeURIComponent(next)}` : "/auth/redirect"
  return `${origin}${path}`
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isGoogleAvailable, setIsGoogleAvailable] = useState<boolean | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(() => {
    const oauthError = searchParams.get("error")
    if (!oauthError) return null
    return oauthError === "OAuthEmailMissing"
      ? "Nao foi possivel obter o e-mail da conta Google"
      : "Nao foi possivel entrar com Google. Tente novamente."
  })
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  })

  useEffect(() => {
    let active = true

    getProviders()
      .then((providers) => {
        if (!active) return
        setIsGoogleAvailable(Boolean(providers?.google))
      })
      .catch(() => {
        if (!active) return
        setIsGoogleAvailable(false)
      })

    return () => {
      active = false
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const next = safeInternalPath(searchParams.get("next")) ?? undefined
    const res = await signIn("credentials", {
      redirect: false,
      email: formData.email,
      password: formData.password,
    })

    if (!res?.ok) {
      setError("E-mail ou senha incorretos")
      setIsLoading(false)
      return
    }

    router.push(buildAuthRedirectUrl(next))
    router.refresh()
  }

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true)
    setError(null)

    const next = safeInternalPath(searchParams.get("next")) ?? undefined

    // Defesa para uma aba aberta antes do redirect canônico do proxy. O endpoint
    // que cria o PKCE e o callback do Google precisam usar exatamente o mesmo host.
    const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL
    if (configuredAppUrl) {
      try {
        const configuredOrigin = new URL(configuredAppUrl).origin
        if (window.location.origin !== configuredOrigin) {
          window.location.assign(
            new URL(`${window.location.pathname}${window.location.search}`, configuredOrigin),
          )
          return
        }
      } catch {
        // Configuração inválida será tratada no servidor; mantém a mensagem padrão.
      }
    }

    await signIn("google", {
      callbackUrl: buildAuthRedirectUrl(next),
    })
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 mb-8">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-[#1D4ED8] to-[#1E3A8A] flex items-center justify-center">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-2xl font-bold text-gray-900">EduConnect</span>
          </Link>

          {/* Header */}
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-gray-900">Bem-vindo de volta</h1>
            <p className="mt-2 text-gray-600">Entre na sua conta para continuar aprendendo</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  className="pl-10 h-12"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                <Link href="/esqueci-senha" className="text-sm text-[#1D4ED8] hover:underline">
                  Esqueci minha senha
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Sua senha"
                  className="pl-10 pr-10 h-12"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 bg-[#1D4ED8] hover:bg-[#1E3A8A] text-base font-semibold"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Entrando...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Entrar
                  <ArrowRight className="h-5 w-5" />
                </span>
              )}
            </Button>
          </form>

          {isGoogleAvailable === true && (
            <>
              {/* Divider */}
              <div className="relative my-8">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-gray-500">ou continue com</span>
                </div>
              </div>

              {/* Social Login */}
              <div className="grid gap-4">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12"
                  disabled={isGoogleLoading}
                  onClick={handleGoogleSignIn}
                >
                  <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  {isGoogleLoading ? "Conectando..." : "Entrar com Google"}
                </Button>
              </div>
            </>
          )}

          {isGoogleAvailable === false && (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
              <p className="text-sm text-amber-800">
                Login com Google indisponivel neste ambiente.
              </p>
            </div>
          )}

          {/* Sign Up Link */}
          <p className="mt-8 text-center text-gray-600">
            {"Nao tem conta? "}
            <Link href="/cadastro" className="text-[#1D4ED8] font-semibold hover:underline">
              Cadastre-se
            </Link>
          </p>
        </div>
      </div>

      {/* Right Panel - Image/Branding */}
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-[#1E3A8A] to-[#1D4ED8] items-center justify-center p-12">
        <div className="max-w-lg text-white text-center">
          <div className="mb-8">
            <div className="h-20 w-20 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto">
              <GraduationCap className="h-10 w-10 text-white" />
            </div>
          </div>
          <h2 className="font-display text-3xl font-bold mb-4">
            Ensinar e uma arte. Aprender e uma jornada.
          </h2>
          <p className="text-blue-100 leading-relaxed">
            Conectamos professores e alunos em um ecossistema de aprendizado inteligente, 
            potencializado por Inteligencia Artificial.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-[#1D4ED8] border-t-transparent rounded-full" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
