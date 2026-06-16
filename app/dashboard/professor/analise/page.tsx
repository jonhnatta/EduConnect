import { listMyReviewedContent } from "@/app/actions/content-review"
import { ProfessorAnaliseClient } from "@/components/dashboard/professor-analise-client"
import { requireApprovedProfessorAccess } from "@/lib/auth/guards"
import { Bot } from "lucide-react"

export default async function ProfessorAnalisePage() {
  await requireApprovedProfessorAccess()

  const items = await listMyReviewedContent()

  return (
    <div className="max-w-3xl mx-auto pb-20 lg:pb-0">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <Bot className="h-5 w-5 text-[#1D4ED8]" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Análise de Desempenho</h1>
          <p className="text-sm text-gray-500">Resultados das revisões feitas pelo agente de IA</p>
        </div>
      </div>

      <ProfessorAnaliseClient items={items} />
    </div>
  )
}
