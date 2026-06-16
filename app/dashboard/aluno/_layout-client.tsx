"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  GraduationCap,
  Home,
  BookOpen,
  Users,
  Bot,
  Search,
  Trophy,
  Bookmark,
  Settings,
  User,
  Bell,
  Menu,
  X,
  LogOut,
  ChevronDown
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PendingInviteHandler } from "@/components/dashboard/pending-invite-handler"

const navigation = [
  { name: "Inicio", href: "/dashboard/aluno", icon: Home },
  { name: "Plano de Estudos", href: "/dashboard/aluno/plano", icon: BookOpen },
  { name: "Minhas Salas", href: "/dashboard/aluno/salas", icon: Users },
  { name: "Tutor IA", href: "/dashboard/aluno/tutor", icon: Bot },
  { name: "Explorar Professores", href: "/dashboard/aluno/explorar", icon: Search },
  { name: "Salvos", href: "/dashboard/aluno/salvos", icon: Bookmark },
  { name: "Meu Progresso", href: "/dashboard/aluno/progresso", icon: Trophy },
]

const bottomNav = [
  { name: "Configuracoes", href: "/dashboard/aluno/configuracoes", icon: Settings },
  { name: "Meu Perfil", href: "/dashboard/aluno/perfil", icon: User },
]

export function AlunoLayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { status } = useSession()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profile, setProfile] = useState<{ full_name: string; avatar_url: string | null } | null>(null)

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
    if (!name) return "U"
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PendingInviteHandler />
      {/* Mobile Header */}
      <header className="lg:hidden sticky top-0 z-40 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <Link href="/dashboard/aluno" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#10B981] to-[#059669] flex items-center justify-center">
              <GraduationCap className="h-4 w-4 text-white" />
            </div>
            <span className="font-display text-lg font-bold text-gray-900">EduConnect</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon" className="relative">
              <Link href="/dashboard/aluno/notificacoes" aria-label="Abrir notificacoes">
                <Bell className="h-5 w-5 text-gray-600" />
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
              </Link>
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
        fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 transform transition-transform duration-200
        lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="px-4 py-4 border-b border-gray-100">
            <Link href="/dashboard/aluno" className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-[#10B981] to-[#059669] flex items-center justify-center">
                <GraduationCap className="h-5 w-5 text-white" />
              </div>
              <span className="font-display text-xl font-bold text-gray-900">EduConnect</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-[#10B981] text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          {/* Bottom Navigation */}
          <div className="px-3 py-4 border-t border-gray-100 space-y-1">
            {bottomNav.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-[#10B981] text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              )
            })}
          </div>

          {/* User Section */}
          <div className="px-3 py-4 border-t border-gray-100">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={profile?.avatar_url || ""} />
                    <AvatarFallback className="bg-[#10B981] text-white text-sm">
                      {getInitials(profile?.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-gray-900">{profile?.full_name || "Carregando..."}</div>
                    <div className="text-xs text-gray-500">Aluno</div>
                  </div>
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/aluno/perfil">
                    <User className="mr-2 h-4 w-4" />
                    Meu Perfil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/aluno/configuracoes">
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar conteudo, professores..."
                className="w-full h-10 pl-10 pr-4 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="icon" className="relative">
              <Link href="/dashboard/aluno/notificacoes" aria-label="Abrir notificacoes">
                <Bell className="h-5 w-5 text-gray-600" />
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
              </Link>
            </Button>
            <Avatar className="h-9 w-9">
              <AvatarImage src={profile?.avatar_url || ""} />
              <AvatarFallback className="bg-[#10B981] text-white text-sm">
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
                  isActive ? "text-[#10B981]" : "text-gray-500"
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
