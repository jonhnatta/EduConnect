"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Eye,
  FileText,
  Dumbbell,
  ClipboardList,
  BarChart2,
  Lightbulb,
  Heart,
  Star,
  Loader2,
} from "lucide-react"
import type { ProfessorPost } from "@/app/actions/professors"
import { submitProfessorReview, type ProfessorReviewsSummary } from "@/app/actions/professor-reviews"

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}

function formatDate(iso: string | null) {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  article: { label: "Artigo", icon: <FileText className="h-5 w-5" />, color: "bg-blue-50 text-blue-600" },
  exercise: { label: "Exercicio", icon: <Dumbbell className="h-5 w-5" />, color: "bg-amber-50 text-amber-600" },
  assessment: { label: "Prova", icon: <ClipboardList className="h-5 w-5" />, color: "bg-red-50 text-red-600" },
  simulado: { label: "Simulado", icon: <BarChart2 className="h-5 w-5" />, color: "bg-purple-50 text-purple-600" },
  dica: { label: "Dica", icon: <Lightbulb className="h-5 w-5" />, color: "bg-green-50 text-green-600" },
}

function StarRow({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className={onChange ? "cursor-pointer" : "cursor-default"}
          aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
        >
          <Star className={`h-5 w-5 ${n <= value ? "fill-[#F59E0B] text-[#F59E0B]" : "text-gray-300"}`} />
        </button>
      ))}
    </div>
  )
}

export function PublicProfileTabs({
  posts,
  teacherId,
  reviews,
}: {
  posts: ProfessorPost[]
  teacherId: string
  reviews: ProfessorReviewsSummary
}) {
  const [activeTab, setActiveTab] = useState<"publicacoes" | "avaliacoes">("publicacoes")
  const router = useRouter()
  const [rating, setRating] = useState(reviews.myReview?.rating ?? 0)
  const [comment, setComment] = useState(reviews.myReview?.comment ?? "")
  const [saving, startSaving] = useTransition()

  function handleSubmitReview() {
    if (rating < 1) {
      toast.error("Escolha uma nota de 1 a 5")
      return
    }
    startSaving(async () => {
      const res = await submitProfessorReview(teacherId, rating, comment)
      if (res.ok) {
        toast.success("Avaliacao enviada")
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div>
      <div className="mb-6 flex gap-6 border-b border-gray-200 px-2">
        <button
          className={`relative pb-3 text-sm font-medium transition-colors ${
            activeTab === "publicacoes" ? "text-[#1D4ED8]" : "text-gray-500 hover:text-gray-900"
          }`}
          onClick={() => setActiveTab("publicacoes")}
        >
          Publicacoes recentes
          {activeTab === "publicacoes" ? (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-[#1D4ED8]" />
          ) : null}
        </button>
        <button
          className={`relative pb-3 text-sm font-medium transition-colors ${
            activeTab === "avaliacoes" ? "text-[#1D4ED8]" : "text-gray-500 hover:text-gray-900"
          }`}
          onClick={() => setActiveTab("avaliacoes")}
        >
          Avaliacoes
          {activeTab === "avaliacoes" ? (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-[#1D4ED8]" />
          ) : null}
        </button>
      </div>

      {activeTab === "publicacoes" ? (
        posts.length > 0 ? (
          <div className="space-y-4">
            {posts.map((post) => {
              const cfg = TYPE_CONFIG[post.type] ?? TYPE_CONFIG.article
              return (
                <div
                  key={post.id}
                  className="rounded-xl border border-gray-100 bg-white p-5 transition-all hover:border-[#1D4ED8]/30 hover:shadow-md"
                >
                  <div className="flex items-start gap-4">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${cfg.color}`}>
                      {cfg.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          {cfg.label}
                        </span>
                        {post.published_at ? <span className="text-xs text-gray-400">{formatDate(post.published_at)}</span> : null}
                      </div>
                      <h3 className="mb-2 text-lg font-medium leading-tight text-gray-900">{post.title}</h3>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3.5 w-3.5" /> {formatCount(post.view_count)} visualizacoes
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="h-3.5 w-3.5" /> {formatCount(post.like_count)} curtidas
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center text-gray-400">
            Nenhuma publicacao publica ainda.
          </div>
        )
      ) : (
        <div className="space-y-6">
          {/* Resumo */}
          <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-5">
            <div className="text-center">
              <div className="font-display text-3xl font-bold text-gray-900">
                {reviews.count > 0 ? reviews.average.toFixed(1) : "—"}
              </div>
              <StarRow value={Math.round(reviews.average)} />
            </div>
            <div className="text-sm text-gray-500">
              {reviews.count > 0
                ? `${reviews.count} avaliacao${reviews.count > 1 ? "es" : ""} de alunos`
                : "Ainda sem avaliacoes"}
            </div>
          </div>

          {/* Formulário (apenas aluno logado) */}
          {reviews.canReview ? (
            <div className="rounded-xl border border-gray-100 bg-white p-5">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">
                {reviews.myReview ? "Editar sua avaliacao" : "Avaliar este professor"}
              </h3>
              <StarRow value={rating} onChange={setRating} />
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={1000}
                placeholder="Conte como foi sua experiencia (opcional)"
                className="mt-3 min-h-24 resize-none"
              />
              <Button
                onClick={handleSubmitReview}
                disabled={saving}
                className="mt-3 gap-2 bg-[#1D4ED8] hover:bg-[#1E3A8A]"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {reviews.myReview ? "Atualizar avaliacao" : "Enviar avaliacao"}
              </Button>
            </div>
          ) : null}

          {/* Lista */}
          {reviews.reviews.length > 0 ? (
            <div className="space-y-3">
              {reviews.reviews.map((r) => (
                <div key={r.id} className="rounded-xl border border-gray-100 bg-white p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">{r.student_name ?? "Aluno"}</span>
                    <StarRow value={r.rating} />
                  </div>
                  {r.comment ? <p className="text-sm text-gray-600">{r.comment}</p> : null}
                  <p className="mt-1 text-xs text-gray-400">{formatDate(r.created_at)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center text-gray-400">
              Seja o primeiro a avaliar este professor.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
