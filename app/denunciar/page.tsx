import { submitAbuseReport } from "@/app/actions/trust-safety"

const labels: Record<string, string> = {
  harassment: "Assédio ou intimidação",
  hate: "Ódio ou discriminação",
  sexual: "Conteúdo sexual",
  violence: "Violência ou ameaça",
  fraud: "Fraude ou spam",
  copyright: "Direitos autorais",
  privacy: "Privacidade ou dados pessoais",
  other: "Outro",
}

export default async function ReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams
  const targetType = params.targetType === "profile" ? "profile" : "content_item"
  const targetId = params.targetId ?? ""
  const returnTo = params.returnTo?.startsWith("/") ? params.returnTo : "/dashboard/aluno"
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-bold">Denunciar conteúdo ou perfil</h1>
      <p className="mt-2 text-sm text-gray-600">A equipe responsável analisará a denúncia. Não inclua senhas ou documentos pessoais.</p>
      <form action={submitAbuseReport} className="mt-6 space-y-4 rounded-xl border bg-white p-6">
        <input type="hidden" name="targetType" value={targetType} />
        <input type="hidden" name="targetId" value={targetId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <label className="block text-sm font-medium">Motivo
          <select name="category" required className="mt-1 block w-full rounded-md border p-2">
            {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Detalhes
          <textarea name="details" maxLength={2000} rows={6} className="mt-1 block w-full rounded-md border p-2" />
        </label>
        <button className="rounded-md bg-red-700 px-4 py-2 font-semibold text-white">Enviar denúncia</button>
      </form>
    </main>
  )
}
