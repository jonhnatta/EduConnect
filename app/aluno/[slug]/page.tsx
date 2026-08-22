import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { queryOne } from "@/lib/db/query"
import { employmentStatusLabel } from "@/lib/profile/public"

type PublicStudentProfile = {
  id: string
  full_name: string | null
  slug: string
  avatar_url: string | null
  cover_url: string | null
  bio: string | null
  interests: string[]
  education_level: string | null
  employment_status: string | null
  study_focus: string | null
}

function initials(name: string | null) {
  if (!name) return "A"
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export default async function PublicStudentProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const profile = await queryOne<PublicStudentProfile>(
    `select id, full_name, slug, avatar_url, cover_url, bio,
            coalesce(interests, array[]::text[]) as interests,
            education_level, employment_status, study_focus
       from public.profiles
      where lower(slug) = lower($1)
        and user_type = 'aluno'
        and coalesce(profile_visibility, 'private') = 'public'
        and deleted_at is null
        and account_status = 'active'
      limit 1`,
    [slug]
  )

  if (!profile) notFound()

  const followingRow = await queryOne<{ cnt: string }>(
    "select count(*)::int as cnt from public.teacher_followers where student_id = $1",
    [profile.id]
  ).catch(() => null)
  const followingCount = Number(followingRow?.cnt ?? 0)

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4fbf8_0%,#ffffff_24%,#ffffff_100%)] pb-16">
      <div className="h-52 bg-gradient-to-r from-[#065f46] via-[#059669] to-[#34d399]">
        {profile.cover_url ? (
          <img src={profile.cover_url} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>

      <div className="mx-auto -mt-16 max-w-5xl px-4 sm:px-6">
        <section className="overflow-hidden rounded-[28px] border border-emerald-100 bg-white shadow-[0_24px_80px_-36px_rgba(5,150,105,0.45)]">
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:p-10">
            <div className="flex flex-col items-center lg:items-start">
              <div className="h-36 w-36 overflow-hidden rounded-[28px] border-4 border-white bg-emerald-100 shadow-lg">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.full_name ?? "Perfil do aluno"} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-4xl font-bold text-emerald-700">
                    {initials(profile.full_name)}
                  </div>
                )}
              </div>
              <Badge className="mt-5 bg-emerald-600 text-white hover:bg-emerald-600">Aluno</Badge>
              <a
                href={`/denunciar?targetType=profile&targetId=${profile.id}&returnTo=${encodeURIComponent(`/aluno/${slug}`)}`}
                className="mt-3 text-xs text-red-700 hover:underline"
              >
                Denunciar perfil
              </a>
            </div>

            <div className="space-y-6">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
                  Perfil publico
                </p>
                <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                  {profile.full_name || "Aluno da EduConnect"}
                </h1>
                <p className="max-w-3xl text-base leading-7 text-slate-600">
                  {profile.bio || "Este aluno ainda nao adicionou uma descricao publica."}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Escolaridade</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">
                    {profile.education_level || "Nao informado"}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Situacao profissional</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">
                    {employmentStatusLabel(profile.employment_status)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Objetivo atual</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">
                    {profile.study_focus || "Nao informado"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 sm:p-8">
            <h2 className="font-display text-2xl font-semibold text-slate-900">O que estou estudando</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Uma visao rapida das areas que este aluno quer desenvolver dentro da plataforma.
            </p>

            {profile.interests.length > 0 ? (
              <div className="mt-6 flex flex-wrap gap-3">
                {profile.interests.map((item) => (
                  <Badge
                    key={item}
                    variant="outline"
                    className="rounded-full border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800"
                  >
                    {item}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="mt-6 text-sm text-slate-500">
                Nenhuma area de estudo foi adicionada ainda.
              </p>
            )}
          </section>

          <aside className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ecfdf5_0%,#ffffff_100%)] p-6 sm:p-8">
            <h2 className="font-display text-2xl font-semibold text-slate-900">Resumo</h2>
            <div className="mt-6 space-y-4 text-sm text-slate-700">
              <div className="rounded-2xl border border-emerald-100 bg-white/80 p-4">
                <p className="font-medium text-slate-900">Disponibilidade</p>
                <p className="mt-1 leading-6">
                  {profile.study_focus
                    ? profile.study_focus
                    : "Perfil aberto para networking academico e oportunidades futuras."}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-white/80 p-4">
                <p className="font-medium text-slate-900">Professores que segue</p>
                <p className="mt-1 text-2xl font-bold text-emerald-700">
                  {followingCount}
                </p>
                <p className="text-xs text-slate-500">
                  {followingCount === 1 ? "professor seguido" : "professores seguidos"} na EduConnect
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
