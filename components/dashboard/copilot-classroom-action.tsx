"use client"

import { useState } from "react"
import { Sparkles, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type Props = { classroomId: string; mode: "performance" | "classroom"; periodStart?: string; periodEnd?: string }

export function CopilotClassroomAction({ classroomId, mode, periodStart = "2026-01-01", periodEnd = "2099-12-31" }: Props) {
  const [loading, setLoading] = useState(false)
  const [proposal, setProposal] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const generate = async () => {
    setLoading(true); setError(null)
    try {
      const conversation = await fetch("/api/copilot/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: mode === "performance" ? "Analise de desempenho" : "Sugestao para sala" }) })
      const conversationData = await conversation.json().catch(() => null)
      if (!conversation.ok || typeof conversationData?.conversation?.id !== "string") throw new Error(conversationData?.error || "Nao foi possivel iniciar o Copilot")
      const request = mode === "performance" ? { module: mode, classroomId, periodStart, periodEnd, objective: "Identificar padroes agregados e recomendar proximos passos para a turma." } : { module: mode, classroomId, topic: "Proxima atividade da turma", audience: "Alunos da sala", objective: "Sugerir uma atividade ou conteudo para a turma com base nos dados agregados autorizados.", sourceIds: [] }
      const response = await fetch("/api/copilot/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: conversationData.conversation.id, idempotencyKey: crypto.randomUUID(), request }) })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.proposal) throw new Error(data?.error || "Nao foi possivel gerar a proposta")
      setProposal(data.proposal)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Nao foi possivel gerar a proposta") } finally { setLoading(false) }
  }
  return <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium text-gray-900">Copilot do professor</p><p className="text-xs text-gray-600">{mode === "performance" ? "Analise agregada, sem diagnostico individual." : "Sugestao para a sala, sem criar ou publicar automaticamente."}</p></div><Button type="button" size="sm" onClick={() => void generate()} disabled={loading} className="gap-2"><Sparkles className="h-4 w-4" />{loading ? "Gerando..." : mode === "performance" ? "Gerar analise" : "Sugerir atividade"}</Button></div>{error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}{proposal && <div className="mt-3 rounded-md border border-blue-100 bg-white p-3"><div className="flex items-center justify-between gap-2"><Badge variant="secondary">{proposal.safety.decision}</Badge><Button type="button" variant="ghost" size="icon" onClick={() => setProposal(null)} aria-label="Fechar proposta"><X className="h-4 w-4" /></Button></div>{proposal.draft.overview && <p className="mt-2 text-sm text-gray-700">{proposal.draft.overview}</p>}{proposal.draft.title && <p className="mt-2 font-medium text-gray-900">{proposal.draft.title}</p>}{proposal.draft.activity && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{proposal.draft.activity}</p>}{proposal.draft.findings && <ul className="mt-2 list-disc pl-5 text-sm text-gray-700">{proposal.draft.findings.map((item: string) => <li key={item}>{item}</li>)}</ul>}{proposal.draft.recommendations && <div className="mt-2 text-sm"><strong>Recomendacoes</strong><ul className="list-disc pl-5 text-gray-700">{proposal.draft.recommendations.map((item: string) => <li key={item}>{item}</li>)}</ul></div>}{proposal.warnings?.length > 0 && <p className="mt-2 text-xs text-amber-700">Avisos: {proposal.warnings.join(" ")}</p>}</div>}</div>
}
