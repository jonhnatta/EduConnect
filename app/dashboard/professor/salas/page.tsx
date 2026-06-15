import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Users,
  BookOpen,
  Calendar,
  Settings,
  Plus,
} from "lucide-react"
import { listClassroomsForProfessor } from "@/app/actions/classrooms"
import { CreateClassroomDialog } from "@/components/dashboard/create-classroom-dialog"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { requireProfessorAccess } from "@/lib/auth/guards"

export default async function ProfessorSalasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  await requireProfessorAccess()

  const sp = await searchParams
  const isPendente = sp.status === "pendente"
  const canCreate = !isPendente

  const { rows, error } = await listClassroomsForProfessor()

  return (
    <div className="max-w-6xl mx-auto pb-20 lg:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">
            Minhas Salas
          </h1>
          <p className="text-gray-600">Gerencie suas turmas e atividades</p>
        </div>
        <CreateClassroomDialog canCreate={canCreate} />
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}. Se ainda nao aplicou o SQL das salas, execute{" "}
          <code className="font-mono text-xs">scripts/002_classrooms.sql</code> no
          Postgres.
        </div>
      )}

      {rows.length === 0 && !error && (
        <div className="bg-white border text-center border-dashed border-gray-300 rounded-xl p-12 mt-8">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <BookOpen className="h-8 w-8 text-[#1D4ED8]" />
          </div>
          <h3 className="font-display font-semibold text-xl text-gray-900 mb-2">
            Nenhuma sala criada
          </h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Crie sua primeira sala de aula virtual para organizar seus alunos,
            publicar atividades exclusivas e acompanhar o desempenho.
          </p>
          <CreateClassroomDialog
            canCreate={canCreate}
            triggerClassName="bg-[#1D4ED8] hover:bg-[#1E3A8A] gap-2 mx-auto"
          />
        </div>
      )}

      {rows.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rows.map((sala) => (
            <div
              key={sala.id}
              className="bg-white rounded-xl border border-gray-100 hover:shadow-md transition-shadow flex flex-col h-full"
            >
              <div className="p-5 border-b border-gray-100">
                <div className="flex justify-between items-start mb-3">
                  <Badge
                    variant={sala.status === "ativa" ? "default" : "secondary"}
                    className={
                      sala.status === "ativa"
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-800"
                    }
                  >
                    {sala.status === "ativa" ? "Ativa" : "Encerrada"}
                  </Badge>
                </div>
                <h3 className="font-display font-semibold text-lg text-gray-900 mb-1">
                  {sala.name}
                </h3>
                <p className="text-sm text-gray-500 mb-4">{sala.education_level}</p>

                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4 text-gray-400" />
                    <span>{sala.subject}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-gray-400" />
                    <span>{sala.member_count} alunos</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-4 mt-auto rounded-b-xl flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>
                    Criada em{" "}
                    {format(new Date(sala.created_at), "dd/MM/yyyy", {
                      locale: ptBR,
                    })}
                  </span>
                </div>

                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link href={`/dashboard/professor/salas/${sala.id}`}>
                    <Settings className="h-3.5 w-3.5" />
                    Gerenciar
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
