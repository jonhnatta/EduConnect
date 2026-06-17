import Link from "next/link"
import { BookOpen, Users, GraduationCap } from "lucide-react"
import { requireAlunoAccess } from "@/lib/auth/guards"
import { listPublicClassrooms } from "@/app/actions/classrooms"
import { JoinByCodeForm } from "@/app/dashboard/aluno/salas/join-by-code-form"

export const dynamic = "force-dynamic"

export default async function ExplorarSalasPage() {
  await requireAlunoAccess()
  const classrooms = await listPublicClassrooms(50)

  return (
    <div className="max-w-5xl mx-auto pb-20 lg:pb-0">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
          <BookOpen className="h-5 w-5 text-[#10B981]" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Explorar Salas</h1>
          <p className="text-sm text-gray-500">Salas abertas que voce pode entrar agora.</p>
        </div>
      </div>

      <div className="mb-8 rounded-xl border border-emerald-100 bg-emerald-50 p-5">
        <h2 className="font-display font-semibold text-gray-900 mb-1">Entrar por codigo de convite</h2>
        <p className="text-sm text-gray-500 mb-3">Se voce tem um codigo, cole-o aqui para entrar na sala.</p>
        <JoinByCodeForm />
      </div>

      {classrooms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
          <BookOpen className="h-12 w-12 text-gray-200 mx-auto mb-4" />
          <p className="font-medium text-gray-900">Nenhuma sala publica disponivel</p>
          <p className="mt-1 text-sm text-gray-500">Quando professores abrirem salas publicas, elas apareceram aqui.</p>
        </div>
      ) : (
        <>
          <h2 className="font-display font-semibold text-lg text-gray-900 mb-4">
            {classrooms.length} sala{classrooms.length !== 1 ? "s" : ""} abertas
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {classrooms.map((c) => (
              <div key={c.id} className="bg-white rounded-xl border border-gray-100 p-5 hover:border-[#10B981]/30 hover:shadow-sm transition-all flex flex-col gap-3">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-medium text-gray-900 leading-snug">{c.name}</h3>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Aberta</span>
                  </div>
                  <p className="text-sm text-gray-500">{c.subject} · {c.education_level}</p>
                  {c.description && (
                    <p className="text-sm text-gray-600 mt-2 line-clamp-2">{c.description}</p>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-50">
                  <span className="flex items-center gap-1">
                    <GraduationCap className="h-3.5 w-3.5" />
                    {c.professor_name}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {c.member_count}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
