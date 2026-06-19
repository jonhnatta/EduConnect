import Link from "next/link"
import { Users, ChevronLeft, ChevronRight } from "lucide-react"
import { requireAlunoAccess } from "@/lib/auth/guards"
import { getMyFollowing } from "@/app/actions/follows"

export const dynamic = "force-dynamic"

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

export default async function AlunoSeguindoPage() {
  await requireAlunoAccess()
  const following = await getMyFollowing()

  return (
    <div className="max-w-3xl mx-auto pb-20 lg:pb-0">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard/aluno" className="text-gray-400 hover:text-gray-700">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <Users className="h-5 w-5 text-[#10B981]" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-gray-900">Professores que sigo</h1>
            <p className="text-sm text-gray-500">Voce segue {following.length} professor{following.length !== 1 ? "es" : ""}</p>
          </div>
        </div>
      </div>

      {following.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
          <Users className="h-12 w-12 text-gray-200 mx-auto mb-4" />
          <p className="font-medium text-gray-900">Voce ainda nao segue nenhum professor</p>
          <p className="mt-1 text-sm text-gray-500">Explore professores e siga os que tem conteudo do seu interesse.</p>
          <Link
            href="/dashboard/aluno/explorar"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#10B981] px-4 py-2 text-sm font-medium text-white hover:bg-[#059669]"
          >
            Explorar professores
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {following.map((f) => (
            <Link
              key={f.id}
              href={f.slug ? `/professor/${f.slug}` : "#"}
              className="flex items-center gap-4 bg-white rounded-xl border border-gray-100 p-4 hover:border-[#10B981]/30 hover:shadow-sm transition-all"
            >
              <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-blue-100 to-indigo-50 flex items-center justify-center text-[#1D4ED8] font-bold text-base overflow-hidden shrink-0">
                {f.avatar_url ? (
                  <img src={f.avatar_url} alt={f.full_name} className="w-full h-full object-cover" />
                ) : (
                  initials(f.full_name)
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{f.full_name}</p>
                <p className="text-xs text-gray-400">Seguindo desde {formatDate(f.followed_at)}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-300 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
