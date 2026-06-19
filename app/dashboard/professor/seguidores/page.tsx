import Link from "next/link"
import { Users, ChevronLeft } from "lucide-react"
import { requireProfessorAccess } from "@/lib/auth/guards"
import { getMyFollowers } from "@/app/actions/follows"

export const dynamic = "force-dynamic"

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

export default async function ProfessorSeguidoresPage() {
  await requireProfessorAccess()
  const followers = await getMyFollowers()

  return (
    <div className="max-w-3xl mx-auto pb-20 lg:pb-0">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard/professor" className="text-gray-400 hover:text-gray-700">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Users className="h-5 w-5 text-[#1D4ED8]" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-gray-900">Seguidores</h1>
            <p className="text-sm text-gray-500">{followers.length} aluno{followers.length !== 1 ? "s" : ""} seguindo voce</p>
          </div>
        </div>
      </div>

      {followers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
          <Users className="h-12 w-12 text-gray-200 mx-auto mb-4" />
          <p className="font-medium text-gray-900">Nenhum seguidor ainda</p>
          <p className="mt-1 text-sm text-gray-500">
            Quando alunos seguirem voce, eles apareceram aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {followers.map((f) => (
            <div key={f.id} className="flex items-center gap-4 bg-white rounded-xl border border-gray-100 p-4">
              <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-emerald-100 to-teal-50 flex items-center justify-center text-[#10B981] font-bold text-base overflow-hidden shrink-0">
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
