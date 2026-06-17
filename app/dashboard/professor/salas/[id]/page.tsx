import { notFound } from "next/navigation"
import { requireProfessorAccess } from "@/lib/auth/guards"
import {
  getClassroomForProfessor,
  listMembersForClassroom,
} from "@/app/actions/classrooms"
import {
  getSubmissionEnviosByActivity,
  getPendingGradingByActivity,
} from "@/app/actions/activity-submissions"
import { listActivitiesForClassroomAsProfessor } from "@/app/actions/classroom-activities"
import { listMaterialsForClassroomAsProfessor } from "@/app/actions/classroom-materials"
import { getClassroomPerformanceForProfessor } from "@/app/actions/classroom-performance"
import { ProfessorSalaDetail } from "./professor-sala-detail"

export default async function ProfessorSalaDetalhesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireProfessorAccess()

  const { id } = await params
  const result = await getClassroomForProfessor(id)
  if (!result.row) notFound()

  const [{ members }, { rows: activities }, { rows: materials }, performance] =
    await Promise.all([
      listMembersForClassroom(id),
      listActivitiesForClassroomAsProfessor(id),
      listMaterialsForClassroomAsProfessor(id),
      getClassroomPerformanceForProfessor(id),
    ])

  const activityIds = activities.map((a) => a.id)
  const [submissionEnvios, pendingGrading] = await Promise.all([
    getSubmissionEnviosByActivity(id, activityIds),
    getPendingGradingByActivity(id, activityIds),
  ])

  return (
    <ProfessorSalaDetail
      classroom={result.row}
      members={members}
      activities={activities}
      materials={materials}
      submissionEnvios={submissionEnvios}
      pendingGrading={pendingGrading}
      performance={performance}
    />
  )
}
