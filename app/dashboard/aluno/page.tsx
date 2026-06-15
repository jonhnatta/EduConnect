export const revalidate = 0

import { redirect } from "next/navigation"
import {
  getFeedArticlesForCurrentUser,
  getMyLikesForContentIds,
  getMySavesForContentIds,
  listContentCommentPreviews,
} from "@/app/actions/content-items"
import { getOnboardingStatus, getPlannerWeek } from "@/app/actions/student-planner"
import { getAuthedUser } from "@/lib/auth/user"
import { AlunoFeedClient } from "@/components/dashboard/aluno-feed-client"

export default async function AlunoFeedPage() {
  const { completed } = await getOnboardingStatus()
  if (!completed) redirect("/cadastro/onboarding")

  const articles = (await getFeedArticlesForCurrentUser(20)) ?? []
  const ids = articles.map((a) => a.id)

  const todayIso = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })

  const [liked, saved, commentPreviews, user, planner] = await Promise.all([
    getMyLikesForContentIds(ids),
    getMySavesForContentIds(ids),
    listContentCommentPreviews(ids, 2),
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
      initialArticles={articles}
      initialLikedIds={[...liked]}
      initialSavedIds={[...saved]}
      initialCommentPreviews={commentPreviews}
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
