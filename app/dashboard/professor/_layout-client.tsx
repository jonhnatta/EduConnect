"use client"

import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { usePathname, useSearchParams, useRouter } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  GraduationCap,
  Home,
  PenSquare,
  Users,
  UsersRound,
  BarChart3,
  Bot,
  Settings,
  User,
  Bell,
  Menu,
  X,
  LogOut,
  ChevronDown,
  Plus,
  AlertCircle
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const navigation = [
  { name: "Inicio", href: "/dashboard/professor", icon: Home },
  { name: "Criar Conteudo", href: "/dashboard/professor/criar", icon: PenSquare },
  { name: "Minhas Salas", href: "/dashboard/professor/salas", icon: Users },
  { name: "Meus Alunos", href: "/dashboard/professor/alunos", icon: UsersRound },
  { name: "Analise de Desempenho", href: "/dashboard/professor/analise", icon: BarChart3 },
  { name: "Revisoes pela IA", href: "/dashboard/professor/revisoes", icon: Bot },
]

const bottomNav = [
  { name: "Configuracoes", href: "/dashboard/professor/configuracoes", icon: Settings },
  { name: "Meu Perfil", href: "/dashboard/professor/perfil", icon: User },
]

function ProfessorLayoutContent({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { status } = useSession()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profile, setProfile] = useState<{
    full_name: string
    avatar_url: string | null
    professor_verification_status?: string | null
  } | null>(null)
  const isPendente =
    searchParams.get("status") === "pendente" ||
    profile?.professor_verification_status === "pending"

  useEffect(() => {
    if (status !== "authenticated") return
    const loadProfile = () => fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setProfile(d?.profile ?? null))
      .catch(() => setProfile(null))
    loadProfile()
    window.addEventListener("profile:updated", loadProfile)
    return () => window.removeEventListener("profile:updated", loadProfile)
  }, [status])

  const handleLogout = async () => {
    await signOut({ redirect: false })
    router.push("/login")
    router.refresh()
  }

  const getInitials = (name: string | undefined) => {
    if (!name) return "P"
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Pending Banner */}
      {isPendente && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <p className="text-sm text-amber-800">
              Seu cadastro esta em analise. Funcionalidades de publicacao estarao disponiveis apos aprovacao.
            </p>
          </div>
        </div>
      )}

      {/* Mobile Header */}
      <header className="lg:hidden sticky top-0 z-40 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <Link href="/dashboard/professor" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#1D4ED8] to-[#1E3A8A] flex items-center justify-center">
              <GraduationCap className="h-4 w-4 text-white" />
            </div>
            <span className="font-display text-lg font-bold text-gray-900">EduConnect</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5 text-gray-600" />
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 z-50 h-full w-64 bg-[#1E3A8A] transform transition-transform duration-200
        lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="px-4 py-4 border-b border-blue-800">
            <Link href="/dashboard/professor" className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center">
                <GraduationCap className="h-5 w-5 text-white" />
              </div>
              <span className="font-display text-xl font-bold text-white">EduConnect</span>
            </Link>
          </div>

          {/* Create Button */}
          <div className="px-3 py-4">
            <Button
              asChild
              className="w-full bg-white text-[#1E3A8A] hover:bg-blue-50 gap-2"
              disabled={isPendente}
            >
              <Link href="/dashboard/professor/criar">
                <Plus className="h-4 w-4" />
                Criar Conteudo
              </Link>
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              const isDisabled = isPendente && (item.href.includes("criar") || item.href.includes("salas"))
              return (
                <Link
                  key={item.name}
                  href={isDisabled ? "#" : item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-white/20 text-white"
                      : isDisabled
                      ? "text-blue-300/50 cursor-not-allowed"
                      : "text-blue-100 hover:bg-white/10"
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          {/* Bottom Navigation */}
          <div className="px-3 py-4 border-t border-blue-800 space-y-1">
            {bottomNav.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-white/20 text-white"
                      : "text-blue-100 hover:bg-white/10"
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              )
            })}
          </div>

          {/* User Section */}
          <div className="px-3 py-4 border-t border-blue-800">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-white/10 transition-colors">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={profile?.avatar_url || ""} />
                    <AvatarFallback className="bg-white/20 text-white text-sm">
                      {getInitials(profile?.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-white">{profile?.full_name || "Carregando..."}</div>
                    <div className="text-xs text-blue-200">Professor</div>
                  </div>
                  <ChevronDown className="h-4 w-4 text-blue-200" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/professor/perfil">
                    <User className="mr-2 h-4 w-4" />
                    Meu Perfil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/professor/configuracoes">
                    <Settings className="mr-2 h-4 w-4" />
                    Configuracoes
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600 cursor-pointer" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:pl-64">
        {/* Desktop Header */}
        <header className="hidden lg:flex sticky top-0 z-30 bg-white border-b border-gray-200 px-6 py-4 items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative max-w-md flex-1">
              <input
                type="text"
                placeholder="Buscar conteudo, alunos..."
                className="w-full h-10 pl-4 pr-4 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5 text-gray-600" />
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
            </Button>
            <Avatar className="h-9 w-9">
              <AvatarImage src={profile?.avatar_url || ""} />
              <AvatarFallback className="bg-[#1D4ED8] text-white text-sm">
                {getInitials(profile?.full_name)}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 lg:p-6">
          {children}
        </main>
      </div>

      {/* Floating Create Button (Mobile) */}
      {!isPendente && (
        <Link
          href="/dashboard/professor/criar"
          className="lg:hidden fixed bottom-20 right-4 h-14 w-14 rounded-full bg-[#1D4ED8] text-white shadow-lg flex items-center justify-center z-40"
        >
          <Plus className="h-6 w-6" />
        </Link>
      )}

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 py-2 z-40">
        <div className="flex items-center justify-around">
          {navigation.slice(0, 5).map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
                  isActive ? "text-[#1D4ED8]" : "text-gray-500"
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-xs font-medium">{item.name.split(" ")[0]}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

export function ProfessorLayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-[#1D4ED8] border-t-transparent rounded-full" />
      </div>
    }>
      <ProfessorLayoutContent>{children}</ProfessorLayoutContent>
    </Suspense>
  )
}
