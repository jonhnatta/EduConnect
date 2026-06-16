import { listProfessores, listDisciplinas } from "@/app/actions/professors"
import { ExplorarProfessoresClient } from "./_client"

export default async function AlunoExplorarPage() {
  const [{ professors, total, hasMore }, disciplinas] = await Promise.all([
    listProfessores({ offset: 0, limit: 18 }),
    listDisciplinas(),
  ])

  return (
    <ExplorarProfessoresClient
      initialProfessors={professors}
      initialTotal={total}
      initialHasMore={hasMore}
      disciplinas={disciplinas}
    />
  )
}
