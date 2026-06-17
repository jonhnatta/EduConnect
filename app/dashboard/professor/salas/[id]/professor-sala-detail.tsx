"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft,
  Users,
  FileText,
  MessageSquare,
  BarChart,
  FolderOpen,
  Plus,
  Trash2,
  Pencil,
  ClipboardCheck,
} from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import type { ClassroomRow } from "@/lib/classrooms/types"
import type { ClassroomActivityRow } from "@/lib/activities/types"
import { ACTIVITY_TYPE_LABELS } from "@/lib/activities/types"
import type { ClassroomPerformanceForProfessor } from "@/lib/classrooms/performance"
import type { ClassroomMaterialRow } from "@/lib/materials/types"
import { MATERIAL_STATUS_LABELS } from "@/lib/materials/types"
import { ShareInviteButton } from "@/components/dashboard/share-invite-button"
import { ClassroomPerformancePanel } from "@/components/dashboard/classroom-performance-panel"
import { ClassroomMuralEditor } from "@/components/dashboard/classroom-mural-editor"
import { ActivitySubmissionsDialog } from "@/components/dashboard/activity-submissions-dialog"
import { ClassroomActivityFormDialog } from "@/components/dashboard/classroom-activity-form-dialog"
import { ClassroomMaterialFormDialog } from "@/components/dashboard/classroom-material-form-dialog"
import { removeClassroomMember } from "@/app/actions/classrooms"
import { deleteActivity } from "@/app/actions/classroom-activities"
import { deleteMaterial } from "@/app/actions/classroom-materials"
import { parseActivityAttachments } from "@/lib/activities/attachments"
import { parseExamFromSettings } from "@/lib/activities/exam"
import { ActivityAttachmentsList } from "@/components/dashboard/activity-attachments-list"
import { toast } from "sonner"

type Member = {
  student_id: string
  full_name: string | null
  joined_at: string
}

const TABS = [
  { id: "alunos", label: "Alunos", icon: Users },
  { id: "atividades", label: "Atividades", icon: FileText },
  { id: "corrigir", label: "Para corrigir", icon: ClipboardCheck },
  { id: "materiais", label: "Material Extra", icon: FolderOpen },
  { id: "mural", label: "Mural", icon: MessageSquare },
  { id: "desempenho", label: "Desempenho", icon: BarChart },
]

type Props = {
  classroom: ClassroomRow & { member_count: number }
  members: Member[]
  activities: ClassroomActivityRow[]
  materials: ClassroomMaterialRow[]
  /** Contagem de provas enviadas (status enviado) por activity id */
  submissionEnvios: Record<string, number>
  /** Entregas pendentes de correção manual (questões abertas sem nota) por activity id */
  pendingGrading: Record<string, number>
  performance: ClassroomPerformanceForProfessor
}

function formatActivityWhen(iso: string | null): string {
  if (!iso) return "—"
  try {
    return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR })
  } catch {
    return "—"
  }
}

export function ProfessorSalaDetail({
  classroom,
  members,
  activities,
  materials,
  submissionEnvios,
  pendingGrading,
  performance,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialTab = searchParams.get("tab")
  const [activeTab, setActiveTab] = useState(
    initialTab && TABS.some((t) => t.id === initialTab) ? initialTab : "alunos"
  )
  const totalPending = Object.values(pendingGrading).reduce((a, b) => a + b, 0)
  const [removing, setRemoving] = useState<string | null>(null)
  const [activityDialogOpen, setActivityDialogOpen] = useState(false)
  const [editingActivity, setEditingActivity] =
    useState<ClassroomActivityRow | null>(null)
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false)
  const [editingMaterial, setEditingMaterial] =
    useState<ClassroomMaterialRow | null>(null)
  const [submissionsOpen, setSubmissionsOpen] = useState(false)
  const [submissionsActivity, setSubmissionsActivity] =
    useState<ClassroomActivityRow | null>(null)

  const handleRemove = async (studentId: string) => {
    if (!confirm("Remover este aluno da sala?")) return
    setRemoving(studentId)
    const res = await removeClassroomMember(classroom.id, studentId)
    setRemoving(null)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("Aluno removido")
    router.refresh()
  }

  const openNewActivity = () => {
    setEditingActivity(null)
    setActivityDialogOpen(true)
  }

  const openEditActivity = (a: ClassroomActivityRow) => {
    setEditingActivity(a)
    setActivityDialogOpen(true)
  }

  const handleDeleteActivity = async (a: ClassroomActivityRow) => {
    if (!confirm(`Excluir a atividade "${a.title}"?`)) return
    const res = await deleteActivity(a.id, classroom.id)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("Atividade removida")
    router.refresh()
  }

  const openNewMaterial = () => {
    setEditingMaterial(null)
    setMaterialDialogOpen(true)
  }

  const openEditMaterial = (m: ClassroomMaterialRow) => {
    setEditingMaterial(m)
    setMaterialDialogOpen(true)
  }

  const handleDeleteMaterial = async (m: ClassroomMaterialRow) => {
    if (!confirm(`Excluir o material "${m.title}"?`)) return
    const res = await deleteMaterial(m.id, classroom.id)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("Material removido")
    router.refresh()
  }

  return (
    <div className="max-w-6xl mx-auto pb-20 lg:pb-0">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-gray-100 pb-6 mb-6">
        <div>
          <Link
            href="/dashboard/professor/salas"
            className="text-gray-500 hover:text-gray-900 flex items-center gap-2 mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para Salas
          </Link>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="font-display text-3xl font-bold text-gray-900">
              {classroom.name}
            </h1>
            <Badge
              variant="outline"
              className="border-gray-200 text-gray-600 bg-gray-50"
            >
              {classroom.education_level}
            </Badge>
          </div>
          <p className="text-gray-600 max-w-xl">
            {classroom.description?.trim() || "Sem descricao."}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-100 p-4 shrink-0 shadow-sm space-y-3">
          <div>
            <p className="text-sm text-gray-500 mb-1">Codigo de convite</p>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="font-mono text-xl font-bold text-[#1D4ED8] bg-blue-50 px-3 py-1 rounded">
                {classroom.invite_code}
              </div>
              <ShareInviteButton inviteCode={classroom.invite_code} />
            </div>
          </div>
          <p className="text-xs text-gray-500 max-w-xs">
            Os alunos entram pelo link ou digitando o codigo em Minhas Salas.
          </p>
        </div>
      </div>

      <div className="flex overflow-x-auto border-b border-gray-100 mb-6 pb-[1px] -mx-4 px-4 sm:mx-0 sm:px-0">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 sm:py-4 border-b-2 whitespace-nowrap transition-colors ${
                isActive
                  ? "border-[#1D4ED8] text-[#1D4ED8] font-medium"
                  : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200"
              }`}
            >
              <tab.icon
                className={`h-4 w-4 ${isActive ? "text-[#1D4ED8]" : "text-gray-400"}`}
              />
              {tab.label}
              {tab.id === "corrigir" && totalPending > 0 && (
                <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">
                  {totalPending}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 min-h-[500px]">
        {activeTab === "alunos" && (
          <div>
            <div className="p-4 sm:p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="font-display font-semibold text-lg text-gray-900">
                  Alunos matriculados
                </h2>
                <p className="text-sm text-gray-500">
                  Total de {members.length} aluno(s) nesta turma
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-sm text-gray-500">
                    <th className="p-4 sm:px-6 font-medium">Nome</th>
                    <th className="p-4 sm:px-6 font-medium">Entrada</th>
                    <th className="p-4 sm:px-6 font-medium text-right">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {members.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="p-8 text-center text-gray-500 text-sm"
                      >
                        Nenhum aluno ainda. Compartilhe o codigo{" "}
                        <span className="font-mono font-semibold text-[#1D4ED8]">
                          {classroom.invite_code}
                        </span>{" "}
                        ou o link de convite.
                      </td>
                    </tr>
                  ) : (
                    members.map((aluno) => (
                      <tr
                        key={aluno.student_id}
                        className="hover:bg-gray-50/50 transition-colors"
                      >
                        <td className="p-4 sm:px-6">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-blue-100 text-[#1D4ED8] flex items-center justify-center font-bold text-xs shrink-0">
                              {(aluno.full_name ?? "?").charAt(0)}
                            </div>
                            <span className="font-medium text-gray-900">
                              {aluno.full_name ?? "Aluno"}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 sm:px-6 text-sm text-gray-500">
                          {new Date(aluno.joined_at).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="p-4 sm:px-6 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-gray-400 hover:text-red-500"
                            disabled={removing === aluno.student_id}
                            onClick={() => handleRemove(aluno.student_id)}
                            aria-label="Remover aluno"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "atividades" && (
          <div>
            <div className="p-4 sm:p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="font-display font-semibold text-lg text-gray-900">
                  Atividades
                </h2>
                <p className="text-sm text-gray-500">
                  Somente alunos desta sala veem estas atividades
                </p>
              </div>
              <Button
                type="button"
                className="bg-[#1D4ED8] hover:bg-[#1E3A8A] gap-2"
                onClick={openNewActivity}
              >
                <Plus className="h-4 w-4" />
                Nova Atividade
              </Button>
            </div>
            <div className="p-4 sm:p-6 grid gap-4">
              {activities.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  Nenhuma atividade ainda. Crie a primeira para a turma.
                </p>
              ) : (
                activities.map((ativ) => {
                  const hasExam = !!parseExamFromSettings(ativ.settings)
                  const enviados = submissionEnvios[ativ.id] ?? 0
                  return (
                  <div
                    key={ativ.id}
                    className="border border-gray-100 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-[#1D4ED8] uppercase tracking-wider">
                          {ACTIVITY_TYPE_LABELS[ativ.type]}
                        </span>
                        <Badge
                          variant="secondary"
                          className={
                            ativ.status === "rascunho"
                              ? "bg-amber-100 text-amber-800"
                              : ativ.status === "encerrada"
                                ? "bg-gray-100 text-gray-700"
                                : "bg-green-100 text-green-800"
                          }
                        >
                          {ativ.status === "rascunho"
                            ? "Rascunho"
                            : ativ.status === "encerrada"
                              ? "Encerrada"
                              : "Aberta"}
                        </Badge>
                      </div>
                      <h3 className="font-medium text-gray-900 text-lg">
                        {ativ.title}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        Prazo: {formatActivityWhen(ativ.due_at)}
                        {ativ.max_score != null && (
                          <span className="ml-2">
                            · Nota max. {ativ.max_score}
                          </span>
                        )}
                      </p>
                      <ActivityAttachmentsList
                        attachments={parseActivityAttachments(ativ.settings)}
                      />
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-center md:text-right">
                        <p className="font-mono text-xl font-bold text-gray-900">
                          {hasExam ? enviados : 0}/{classroom.member_count}
                        </p>
                        <p className="text-xs text-gray-500">entregas</p>
                      </div>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {hasExam ? (
                          <Button
                            type="button"
                            variant="secondary"
                            className="shrink-0"
                            onClick={() => {
                              setSubmissionsActivity(ativ)
                              setSubmissionsOpen(true)
                            }}
                          >
                            Entregas
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          onClick={() => openEditActivity(ativ)}
                          aria-label="Editar atividade"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0 text-red-600 hover:text-red-700"
                          onClick={() => handleDeleteActivity(ativ)}
                          aria-label="Excluir atividade"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {activeTab === "corrigir" && (
          <div>
            <div className="p-4 sm:p-6 border-b border-gray-100">
              <h2 className="font-display font-semibold text-lg text-gray-900">
                Avaliacoes para corrigir
              </h2>
              <p className="text-sm text-gray-500">
                Entregas com questoes abertas aguardando sua correcao manual. As objetivas ja sao corrigidas automaticamente.
              </p>
            </div>
            <div className="p-4 sm:p-6 grid gap-4">
              {(() => {
                const toGrade = activities.filter((a) => (pendingGrading[a.id] ?? 0) > 0)
                if (toGrade.length === 0) {
                  return (
                    <div className="text-center py-10">
                      <ClipboardCheck className="h-12 w-12 text-gray-200 mx-auto mb-3" />
                      <p className="font-medium text-gray-900">Tudo em dia!</p>
                      <p className="mt-1 text-sm text-gray-500">
                        Nenhuma entrega aguardando correcao manual no momento.
                      </p>
                    </div>
                  )
                }
                return toGrade.map((ativ) => {
                  const pendentes = pendingGrading[ativ.id] ?? 0
                  return (
                    <div
                      key={ativ.id}
                      className="border border-gray-100 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-[#1D4ED8] uppercase tracking-wider">
                            {ACTIVITY_TYPE_LABELS[ativ.type]}
                          </span>
                          <Badge className="bg-red-100 text-red-700">
                            {pendentes} para corrigir
                          </Badge>
                        </div>
                        <h3 className="font-medium text-gray-900 text-lg">{ativ.title}</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Prazo: {formatActivityWhen(ativ.due_at)}
                          {ativ.max_score != null && (
                            <span className="ml-2">· Nota max. {ativ.max_score}</span>
                          )}
                        </p>
                      </div>
                      <div className="shrink-0">
                        <Button
                          type="button"
                          className="bg-[#1D4ED8] hover:bg-[#1E3A8A] gap-2"
                          onClick={() => {
                            setSubmissionsActivity(ativ)
                            setSubmissionsOpen(true)
                          }}
                        >
                          <ClipboardCheck className="h-4 w-4" />
                          Corrigir agora
                        </Button>
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        )}

        {activeTab === "materiais" && (
          <div>
            <div className="p-4 sm:p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="font-display font-semibold text-lg text-gray-900">
                  Material extra
                </h2>
                <p className="text-sm text-gray-500">
                  Apoio a turma — nao vale nota (diferente de Atividades)
                </p>
              </div>
              <Button
                type="button"
                className="bg-[#1D4ED8] hover:bg-[#1E3A8A] gap-2"
                onClick={openNewMaterial}
              >
                <Plus className="h-4 w-4" />
                Adicionar material
              </Button>
            </div>
            <div className="p-4 sm:p-6 grid gap-4">
              {materials.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  Nenhum material ainda. Envie PDFs, links ou arquivos de apoio.
                </p>
              ) : (
                materials.map((mat) => (
                  <div
                    key={mat.id}
                    className="border border-gray-100 rounded-xl p-4 flex flex-col md:flex-row md:items-start justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge
                          variant="secondary"
                          className={
                            mat.status === "rascunho"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-green-100 text-green-800"
                          }
                        >
                          {MATERIAL_STATUS_LABELS[mat.status]}
                        </Badge>
                      </div>
                      <h3 className="font-medium text-gray-900 text-lg">
                        {mat.title}
                      </h3>
                      {mat.description?.trim() ? (
                        <p className="text-sm text-gray-600 mt-1 line-clamp-3">
                          {mat.description}
                        </p>
                      ) : null}
                      {mat.external_url ? (
                        <p className="text-sm mt-2">
                          <a
                            href={mat.external_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#1D4ED8] hover:underline break-all"
                          >
                            {mat.external_url}
                          </a>
                        </p>
                      ) : null}
                      <ActivityAttachmentsList
                        attachments={parseActivityAttachments(mat.settings)}
                      />
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => openEditMaterial(mat)}
                        aria-label="Editar material"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleDeleteMaterial(mat)}
                        aria-label="Excluir material"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "mural" && (
          <ClassroomMuralEditor
            classroomId={classroom.id}
            initialDescription={classroom.description}
            initialCoverPathname={classroom.cover_image_pathname ?? null}
          />
        )}

        {activeTab === "desempenho" && (
          <ClassroomPerformancePanel
            classroomId={classroom.id}
            initialData={performance}
          />
        )}
      </div>

      <ClassroomActivityFormDialog
        classroomId={classroom.id}
        open={activityDialogOpen}
        onOpenChange={setActivityDialogOpen}
        activity={editingActivity}
        onSaved={() => router.refresh()}
      />

      <ClassroomMaterialFormDialog
        classroomId={classroom.id}
        open={materialDialogOpen}
        onOpenChange={setMaterialDialogOpen}
        material={editingMaterial}
        onSaved={() => router.refresh()}
      />

      <ActivitySubmissionsDialog
        classroomId={classroom.id}
        activity={submissionsActivity}
        open={submissionsOpen}
        onOpenChange={(o) => {
          setSubmissionsOpen(o)
          if (!o) setSubmissionsActivity(null)
        }}
      />
    </div>
  )
}
