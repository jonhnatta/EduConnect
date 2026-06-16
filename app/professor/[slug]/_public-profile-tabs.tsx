"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import {
  Eye,
  FileText,
  Dumbbell,
  ClipboardList,
  BarChart2,
  Lightbulb,
  Heart,
} from "lucide-react"
import type { ProfessorPost } from "@/app/actions/professors"

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

export function PublicProfileTabs({ posts }: { posts: ProfessorPost[] }) {
  const [activeTab, setActiveTab] = useState<"publicacoes" | "avaliacoes">("publicacoes")

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
        <div className="rounded-xl border border-gray-100 bg-white p-12 text-center text-gray-500">
          <Badge className="mb-4 bg-blue-50 text-blue-700 hover:bg-blue-50">Em breve</Badge>
          <p>O sistema de avaliacoes e reputacao do professor ficara disponivel em breve.</p>
        </div>
      )}
    </div>
  )
}
