import Link from "next/link"
import { Bookmark, FileText, Dumbbell, ClipboardList, BarChart2, Lightbulb, Heart, MessageCircle } from "lucide-react"
import { listMySavedContent } from "@/app/actions/content-items"

export const dynamic = "force-dynamic"

const TYPE_CFG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  article: { label: "Artigo", icon: <FileText className="h-4 w-4" />, color: "bg-blue-50 text-blue-600" },
  exercise: { label: "Exercício", icon: <Dumbbell className="h-4 w-4" />, color: "bg-amber-50 text-amber-600" },
  assessment: { label: "Prova", icon: <ClipboardList className="h-4 w-4" />, color: "bg-red-50 text-red-600" },
  simulado: { label: "Simulado", icon: <BarChart2 className="h-4 w-4" />, color: "bg-purple-50 text-purple-600" },
  dica: { label: "Dica", icon: <Lightbulb className="h-4 w-4" />, color: "bg-green-50 text-green-600" },
}

export default async function AlunoSalvosPage() {
  const saved = await listMySavedContent(100)

  return (
    <div className="max-w-4xl mx-auto pb-20 lg:pb-0">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
          <Bookmark className="h-5 w-5 text-[#10B981]" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Salvos</h1>
          <p className="text-gray-600">Conteúdos que você guardou para ver depois</p>
        </div>
      </div>

      {saved.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
          <Bookmark className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="font-display font-semibold text-lg text-gray-900 mb-2">Nada salvo ainda</h3>
          <p className="text-gray-500">
            Toque no marcador <Bookmark className="inline h-4 w-4 align-text-bottom" /> em qualquer
            conteúdo do feed para guardá-lo aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {saved.map((item) => {
            const cfg = TYPE_CFG[item.type] ?? TYPE_CFG.article
            return (
              <Link
                key={item.id}
                href={`/conteudo/${item.id}`}
                className="block bg-white rounded-xl border border-gray-100 p-5 hover:border-[#10B981]/40 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${cfg.color}`}>
                    {cfg.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      {cfg.label}
                    </span>
                    <h3 className="font-medium text-gray-900 leading-snug">{item.title}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {item.author.full_name ?? "Professor"}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Heart className="h-3.5 w-3.5" /> {item.like_count}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="h-3.5 w-3.5" /> {item.comment_count}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
