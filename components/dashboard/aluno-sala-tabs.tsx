"use client"

import { ActivityAttachmentsList } from "@/components/dashboard/activity-attachments-list"
import { LeaveClassroomButton } from "@/components/dashboard/leave-classroom-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { StudentSubmissionGrade } from "@/app/actions/activity-submissions"
import type { StudentSelfPerformance } from "@/lib/classrooms/performance"
import { AlunoPerformancePanel } from "@/components/dashboard/aluno-performance-panel"
import { parseActivityAttachments } from "@/lib/activities/attachments"
import { parseExamFromSettings } from "@/lib/activities/exam"
import { parseTrabalhoConfig } from "@/lib/activities/trabalho"
import type { ClassroomActivityRow } from "@/lib/activities/types"
import { ACTIVITY_TYPE_LABELS } from "@/lib/activities/types"
import type { ClassroomRow } from "@/lib/classrooms/types"
import type { ClassroomMaterialRow } from "@/lib/materials/types"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  ArrowLeft,
  BookOpen,
  BarChart2,
  ExternalLink,
  FileText,
  FolderOpen,
  User,
} from "lucide-react"
import Link from "next/link"

type Sala = ClassroomRow & { professor_name: string | null }

type TabValue = "visao" | "atividades" | "materiais" | "desempenho"

type Props = {
  sala: Sala
  activities: ClassroomActivityRow[]
  activitiesError: string | null
  materials: ClassroomMaterialRow[]
  materialsError: string | null
  /** URL query `?tab=atividades` etc. */
  defaultTab?: TabValue
  /** Notas do aluno em atividades com prova (por activity id). */
  submissionGradesByActivity?: Record<string, StudentSubmissionGrade>
  /** Relatorio de desempenho (notas vs media da turma). */
  studentPerformance: StudentSelfPerformance
}

function formatDue(iso: string | null): string {
  if (!iso) return "Sem prazo definido"
  try {
    return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR })
  } catch {
    return "Sem prazo definido"
  }
}

export function AlunoSalaTabs({
  sala,
  activities,
  activitiesError,
  materials,
  materialsError,
  defaultTab = "visao",
  submissionGradesByActivity = {},
  studentPerformance,
}: Props) {
  return (
    <div className="max-w-6xl mx-auto pb-20 lg:pb-0">
      <Link
        href="/dashboard/aluno/salas"
        className="text-gray-500 hover:text-gray-900 flex items-center gap-2 mb-6 transition-colors text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para Minhas Salas
      </Link>

      <Tabs defaultValue={defaultTab} className="gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-gray-900">
                  {sala.name}
                </h1>
                <Badge
                  variant="outline"
                  className="border-gray-200 text-gray-600 bg-gray-50"
                >
                  {sala.education_level}
                </Badge>
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
              <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4 text-gray-400" />
                  {sala.subject}
                </span>
                <span className="flex items-center gap-1.5">
                  <User className="h-4 w-4 text-gray-400" />
                  Prof. {sala.professor_name ?? "—"}
                </span>
              </div>
            </div>
            <LeaveClassroomButton classroomId={sala.id} />
          </div>

          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="visao" className="gap-1.5">
              Visão geral
            </TabsTrigger>
            <TabsTrigger value="atividades" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Atividades
            </TabsTrigger>
            <TabsTrigger value="materiais" className="gap-1.5">
              <FolderOpen className="h-3.5 w-3.5" />
              Material extra
            </TabsTrigger>
            <TabsTrigger value="desempenho" className="gap-1.5">
              <BarChart2 className="h-3.5 w-3.5" />
              Desempenho
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="visao" className="mt-0">
          <div className="bg-white rounded-xl border border-gray-100 p-6 sm:p-8">
            {sala.cover_image_pathname ? (
              <div className="mb-6 rounded-xl overflow-hidden border border-gray-100 aspect-video max-h-72 bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element -- URL proxy autenticado */}
                <img
                  src={`/api/activity-attachment?pathname=${encodeURIComponent(sala.cover_image_pathname)}`}
                  alt={`Capa da sala ${sala.name}`}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : null}
            {sala.description?.trim() ? (
              <p className="text-gray-700 whitespace-pre-wrap">{sala.description}</p>
            ) : (
              <p className="text-gray-500 text-sm">
                Nenhuma descricao adicionada pelo professor.
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="atividades" className="mt-0">
          <div className="bg-white rounded-xl border border-gray-100 p-6 sm:p-8">
            {activitiesError ? (
              <p className="text-sm text-red-600 mb-4">{activitiesError}</p>
            ) : null}
            {activities.length === 0 && !activitiesError ? (
              <p className="text-sm text-gray-500 text-center py-10">
                Nenhuma atividade publicada nesta sala ainda.
              </p>
            ) : (
              <ul className="grid gap-3">
                {activities.map((a) => {
                  const hasExam = !!parseExamFromSettings(a.settings)
                  const hasTrabalho = !!parseTrabalhoConfig(a.settings)
                  const submittable = hasExam || hasTrabalho
                  const grade = submissionGradesByActivity[a.id]
                  const submitted = grade?.status === "enviado"
                  const graded = submitted && grade.score_total != null
                  const pendingCorrection = submitted && grade.score_total == null
                  const isDraft = grade?.status === "rascunho"
                  return (
                    <li
                      key={a.id}
                      className="border border-gray-100 rounded-xl p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-[#1D4ED8] uppercase tracking-wider">
                            {ACTIVITY_TYPE_LABELS[a.type]}
                          </span>
                          {/* Estado da entrega do aluno (prioridade) ou status da atividade */}
                          {graded ? (
                            <Badge className="text-[10px] sm:text-xs bg-emerald-100 text-emerald-800">
                              Respondido · corrigido
                            </Badge>
                          ) : pendingCorrection ? (
                            <Badge className="text-[10px] sm:text-xs bg-blue-100 text-blue-800">
                              Já respondido
                            </Badge>
                          ) : isDraft ? (
                            <Badge className="text-[10px] sm:text-xs bg-amber-100 text-amber-800">
                              Rascunho salvo
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className={
                                a.status === "encerrada"
                                  ? "text-[10px] sm:text-xs bg-gray-100 text-gray-700"
                                  : "text-[10px] sm:text-xs bg-green-100 text-green-800"
                              }
                            >
                              {a.status === "encerrada" ? "Encerrada" : "Aberta"}
                            </Badge>
                          )}
                        </div>
                        <h2 className="font-medium text-gray-900 text-base sm:text-lg mt-2">
                          {a.title}
                        </h2>
                        {graded ? (
                          <p className="text-sm font-semibold text-[#1D4ED8] mt-1.5 tabular-nums">
                            Sua nota: {grade?.score_total}
                            {a.max_score != null ? ` / ${a.max_score}` : ""}
                          </p>
                        ) : pendingCorrection ? (
                          <p className="text-sm text-blue-700 mt-1.5">
                            Entrega enviada — na esteira do professor para correção.
                          </p>
                        ) : null}
                        <p className="text-sm text-gray-500 mt-1.5">
                          Prazo: {formatDue(a.due_at)}
                          {a.max_score != null && (
                            <span className="ml-2">
                              · Nota máx. {a.max_score}
                            </span>
                          )}
                        </p>
                        <ActivityAttachmentsList
                          attachments={parseActivityAttachments(a.settings)}
                        />
                      </div>
                      <div className="flex flex-col gap-2 shrink-0 sm:items-end">
                        <Button
                          type="button"
                          variant={submitted ? "outline" : "default"}
                          className={
                            submitted
                              ? "border-gray-200"
                              : "bg-[#1D4ED8] hover:bg-[#1E3A8A]"
                          }
                          asChild
                        >
                          <Link
                            href={`/dashboard/aluno/salas/${sala.id}/atividades/${a.id}`}
                          >
                            {submitted
                              ? "Ver atividade"
                              : submittable && a.status !== "encerrada"
                                ? "Fazer atividade"
                                : "Ver detalhes"}
                          </Link>
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="materiais" className="mt-0">
          <div className="bg-white rounded-xl border border-gray-100 p-6 sm:p-8">
            <p className="text-sm text-gray-600 mb-4 border-b border-gray-100 pb-4">
              Material de apoio — apenas consulta,{" "}
              <span className="font-medium text-gray-900">nao vale nota</span>.
              Para tarefas e avaliacoes, use a aba Atividades.
            </p>
            {materialsError ? (
              <p className="text-sm text-red-600 mb-4">{materialsError}</p>
            ) : null}
            {materials.length === 0 && !materialsError ? (
              <p className="text-sm text-gray-500 text-center py-10">
                Nenhum material publicado nesta sala ainda.
              </p>
            ) : (
              <ul className="grid gap-4">
                {materials.map((m) => (
                  <li
                    key={m.id}
                    className="border border-gray-100 rounded-xl p-4"
                  >
                    <h2 className="font-medium text-gray-900 text-lg">
                      {m.title}
                    </h2>
                    {m.description?.trim() ? (
                      <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">
                        {m.description}
                      </p>
                    ) : null}
                    {m.external_url ? (
                      <a
                        href={m.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-[#1D4ED8] hover:underline mt-3 break-all"
                      >
                        <ExternalLink className="h-4 w-4 shrink-0" />
                        Abrir link externo
                      </a>
                    ) : null}
                    <ActivityAttachmentsList
                      attachments={parseActivityAttachments(m.settings)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="desempenho" className="mt-0">
          <div className="bg-white rounded-xl border border-gray-100 p-6 sm:p-8">
            <AlunoPerformancePanel data={studentPerformance} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
