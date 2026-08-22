"use client"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { CheckCircle2, ChevronRight, FileText, PenSquare, Sparkles } from "lucide-react"
import Link from "next/link"

type Props = {
  totalPosts: number
  publishedCount: number
  draftCount: number
}

export function ProfessorFeedSidebar({
  totalPosts,
  publishedCount,
  draftCount,
}: Props) {
  const pct =
    totalPosts > 0 ? Math.round((publishedCount / totalPosts) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-[#1E3A8A] to-[#1D4ED8] rounded-xl p-4 text-white">
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium">Suas publicações</span>
          <Sparkles className="h-6 w-6 opacity-90" />
        </div>
        <div className="text-4xl font-bold font-display">{totalPosts}</div>
        <p className="text-sm text-blue-100 mt-1">
          {publishedCount} publicado(s) · {draftCount} rascunho(s)
        </p>
      </div>

      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-gray-900">Criar conteúdo</h3>
          <Link
            href="/dashboard/professor/criar"
            className="text-sm text-[#1D4ED8] hover:underline flex items-center gap-1"
          >
            Novo <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Artigos aparecem no feed dos alunos conforme a visibilidade que escolher.
        </p>
        <Button asChild className="w-full bg-[#1D4ED8] hover:bg-[#1E3A8A] gap-2">
          <Link href="/dashboard/professor/criar">
            <PenSquare className="h-4 w-4" />
            Novo artigo
          </Link>
        </Button>
      </div>

      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-display font-semibold text-gray-900 mb-4">Resumo</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-[#10B981]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900">No ar</div>
              <div className="text-xs text-gray-500">{publishedCount} publicado(s)</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <FileText className="h-4 w-4 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900">Rascunhos</div>
              <div className="text-xs text-gray-500">{draftCount} em edição</div>
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-gray-600">Conteúdo publicado</span>
            <span className="font-medium text-[#10B981]">{pct}%</span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>
      </div>
    </div>
  )
}
