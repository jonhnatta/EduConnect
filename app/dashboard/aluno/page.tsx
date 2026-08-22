export const revalidate = 0

import { redirect } from "next/navigation"
import { getStudentFeedPage } from "@/app/actions/content-items"
import { getOnboardingStatus, getPlannerWeek } from "@/app/actions/student-planner"
import { getAuthedUser } from "@/lib/auth/user"
import { AlunoFeedClient } from "@/components/dashboard/aluno-feed-client"

export default async function AlunoFeedPage() {
  const { completed } = await getOnboardingStatus()
  if (!completed) redirect("/cadastro/onboarding")

  const todayIso = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })

  const [initialFeedPage, user, planner] = await Promise.all([
    getStudentFeedPage({ category: "todos" }),
    getAuthedUser(),
    getPlannerWeek(),
  ])

  const todayDay = planner.days.find((d) => d.dateIso === todayIso)
  const todayPersonal = todayDay?.personalItems ?? []
  const todayClassroom = todayDay?.classroomItems ?? []

  const todayItems = [
    ...todayPersonal.map((t) => ({
      id: t.id,
      title: t.title,
      isDone: t.isDone,
      href: null as string | null,
      kind: "personal" as const,
    })),
    ...todayClassroom.map((c) => ({
      id: c.activityId,
      title: c.activityTitle,
      isDone: c.submissionStatus === "enviado",
      href: c.href,
      kind: "classroom" as const,
    })),
  ]

  const todayDone = todayItems.filter((t) => t.isDone).length
  const todayTotal = todayItems.length
  const todayProgress = todayTotal > 0 ? Math.round((todayDone / todayTotal) * 100) : 0

  return (
    <AlunoFeedClient
      initialPage={initialFeedPage}
      viewerUserId={user?.id ?? null}
      todayItems={todayItems}
      streakDays={planner.stats.streakDays}
      todayProgress={todayProgress}
      weekStats={{
        personalDone: planner.stats.personalDone,
        personalTotal: planner.stats.personalTotal,
        classroomSubmitted: planner.stats.classroomSubmitted,
        classroomActivitiesInWeek: planner.stats.classroomActivitiesInWeek,
      }}
    />
  )
}
