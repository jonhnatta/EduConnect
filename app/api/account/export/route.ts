import { NextResponse } from "next/server"
import { getAuthedUser } from "@/lib/auth/user"
import { dbPool } from "@/lib/db/pool"
import { checkRateLimit } from "@/lib/security/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getAuthedUser()
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })

  const allowed = await checkRateLimit(`account-export:${user.id}`, 3, 24 * 3600, {
    failClosed: true,
  })
  if (!allowed) {
    return NextResponse.json({ error: "Limite de exportacoes excedido" }, { status: 429 })
  }

  const client = await dbPool().connect()
  try {
    await client.query("begin transaction isolation level repeatable read read only")
    const account = await client.query(
      `select id, email, auth_provider, email_verified_at, created_at, updated_at
         from public.users where id = $1`,
      [user.id]
    )
    const profile = await client.query("select * from public.profiles where id = $1", [user.id])

    const datasets: Array<[string, string]> = [
      ["classrooms_created", "select * from public.classrooms where professor_id = $1 order by created_at"],
      ["classroom_memberships", "select * from public.classroom_members where student_id = $1 order by joined_at"],
      ["content_created", "select * from public.content_items where author_id = $1 order by created_at"],
      ["activity_submissions", "select * from public.classroom_activity_submissions where student_id = $1 order by created_at"],
      ["content_submissions", "select * from public.content_exercise_submissions where student_id = $1 order by created_at"],
      ["planner_tasks", "select * from public.student_planner_personal_tasks where student_id = $1 order by created_at"],
      ["comments", "select * from public.content_comments where user_id = $1 order by created_at"],
      ["reactions", "select * from public.content_reactions where user_id = $1 order by created_at"],
      ["shares", "select * from public.content_share_events where user_id = $1 order by created_at"],
      ["saved_content", "select * from public.content_saves where user_id = $1 order by created_at"],
      ["teacher_relationships", "select * from public.teacher_followers where student_id = $1 or teacher_id = $1 order by created_at"],
      ["notifications", "select * from public.notifications where recipient_id = $1 order by created_at"],
      ["professor_reviews", "select * from public.professor_reviews where student_id = $1 or teacher_id = $1 order by created_at"],
    ]
    const data: Record<string, unknown[]> = {}
    for (const [name, sql] of datasets) data[name] = (await client.query(sql, [user.id])).rows
    await client.query("commit")

    const body = JSON.stringify({
      schema_version: 1,
      exported_at: new Date().toISOString(),
      account: account.rows[0] ?? null,
      profile: profile.rows[0] ?? null,
      data,
    }, null, 2)
    const date = new Date().toISOString().slice(0, 10)
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="educonnect-dados-${date}.json"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    await client.query("rollback").catch(() => {})
    return NextResponse.json({ error: "Nao foi possivel gerar a exportacao" }, { status: 500 })
  } finally {
    client.release()
  }
}
