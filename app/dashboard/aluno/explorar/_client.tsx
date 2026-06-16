"use client"

import { useState, useTransition, useCallback, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Search,
  Users,
  CheckCircle2,
  BookOpen,
  ChevronRight,
  TrendingUp,
  Flame,
  Loader2,
} from "lucide-react"
import { listProfessores } from "@/app/actions/professors"
import type { ProfessorCard } from "@/app/actions/professors"
import { ProfessorSheet } from "./_professor-sheet"

const PAGE_SIZE = 18

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}

interface Props {
  initialProfessors: ProfessorCard[]
  initialTotal: number
  initialHasMore: boolean
  disciplinas: string[]
}

export function ExplorarProfessoresClient({
  initialProfessors,
  initialTotal,
  initialHasMore,
  disciplinas,
}: Props) {
  const [professors, setProfessors] = useState<ProfessorCard[]>(initialProfessors)
  const [total, setTotal] = useState(initialTotal)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [busca, setBusca] = useState("")
  const [disciplinaAtiva, setDisciplinaAtiva] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)

  // Offset atual reflte quantos já foram carregados para a query ativa
  const offsetRef = useRef(initialProfessors.length)
  // Guarda os filtros ativos quando o "Carregar mais" for chamado
  const activeFiltersRef = useRef({ q: "", disciplina: null as string | null })

  // Debounce para a busca por texto
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchFresh = useCallback(
    (q: string, disciplina: string | null) => {
      activeFiltersRef.current = { q, disciplina }
      startTransition(async () => {
        const result = await listProfessores({
          q: q || undefined,
          disciplina: disciplina ?? undefined,
          offset: 0,
          limit: PAGE_SIZE,
        })
        setProfessors(result.professors)
        setTotal(result.total)
        setHasMore(result.hasMore)
        offsetRef.current = result.professors.length
      })
    },
    []
  )

  function handleBuscaChange(value: string) {
    setBusca(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchFresh(value, disciplinaAtiva)
    }, 350)
  }

  function handleDisciplinaClick(d: string | null) {
    const next = disciplinaAtiva === d ? null : d
    setDisciplinaAtiva(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    fetchFresh(busca, next)
  }

  async function handleLoadMore() {
    setIsLoadingMore(true)
    try {
      const { q, disciplina } = activeFiltersRef.current
      const result = await listProfessores({
        q: q || undefined,
        disciplina: disciplina ?? undefined,
        offset: offsetRef.current,
        limit: PAGE_SIZE,
      })
      setProfessors((prev) => [...prev, ...result.professors])
      setTotal(result.total)
      setHasMore(result.hasMore)
      offsetRef.current += result.professors.length
    } finally {
      setIsLoadingMore(false)
    }
  }

  const emDestaque = professors.filter((p) => p.em_alta)
  const demais = professors.filter((p) => !p.em_alta)
  const isFiltering = !!(busca || disciplinaAtiva)

  return (
    <>
    <ProfessorSheet slugOrId={selectedSlug} onClose={() => setSelectedSlug(null)} />
    <div className="max-w-6xl mx-auto pb-20 lg:pb-0">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-2xl lg:text-3xl font-bold text-gray-900 mb-2">
          Explorar Professores
        </h1>
        <p className="text-gray-600">
          Encontre os melhores mentores para a sua jornada de aprendizado
        </p>
      </div>

      {/* Busca */}
      <div className="mb-6">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {isPending ? (
              <Loader2 className="h-5 w-5 text-[#1D4ED8] animate-spin" />
            ) : (
              <Search className="h-5 w-5 text-gray-400" />
            )}
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] transition-colors"
            placeholder="Buscar por nome ou disciplina, ex: Matemática..."
            value={busca}
            onChange={(e) => handleBuscaChange(e.target.value)}
          />
        </div>
      </div>

      {/* Filtros por disciplina */}
      <div className="flex overflow-x-auto pb-3 mb-8 gap-2 no-scrollbar">
        <button
          onClick={() => handleDisciplinaClick(null)}
          className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors shrink-0 ${
            !disciplinaAtiva
              ? "bg-[#1D4ED8] text-white shadow-sm"
              : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          Todos
        </button>
        {disciplinas.map((d) => (
          <button
            key={d}
            onClick={() => handleDisciplinaClick(d)}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors shrink-0 ${
              disciplinaAtiva === d
                ? "bg-[#1D4ED8] text-white shadow-sm"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Loading overlay */}
      <div className={`transition-opacity ${isPending ? "opacity-60 pointer-events-none" : "opacity-100"}`}>

        {/* Seção Em Destaque (só sem filtro ativo) */}
        {emDestaque.length > 0 && !isFiltering && (
          <>
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp className="h-5 w-5 text-[#10B981]" />
              <h2 className="font-display font-semibold text-xl text-gray-900">Em Destaque</h2>
              <span className="text-xs text-gray-400 ml-1">— mais curtidas e publicações</span>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
              {emDestaque.map((prof) => (
                <ProfessorCardItem key={prof.id} prof={prof} onSelect={setSelectedSlug} />
              ))}
            </div>
          </>
        )}

        {/* Seção principal */}
        {(demais.length > 0 || (isFiltering && professors.length > 0)) && (
          <>
            {emDestaque.length > 0 && !isFiltering && (
              <div className="flex items-center gap-2 mb-5">
                <BookOpen className="h-5 w-5 text-gray-400" />
                <h2 className="font-display font-semibold text-xl text-gray-900">
                  Mais Professores
                </h2>
              </div>
            )}
            {isFiltering && (
              <p className="text-sm text-gray-500 mb-5">
                {total} professor{total !== 1 ? "es" : ""} encontrado{total !== 1 ? "s" : ""}
              </p>
            )}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(isFiltering ? professors : demais).map((prof) => (
                <ProfessorCardItem key={prof.id} prof={prof} onSelect={setSelectedSlug} />
              ))}
            </div>
          </>
        )}

        {/* Empty state */}
        {professors.length === 0 && !isPending && (
          <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="font-display font-semibold text-lg text-gray-900 mb-2">
              Nenhum professor encontrado
            </h3>
            <p className="text-gray-500">
              Tente buscar por termos diferentes ou remover o filtro aplicado.
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => {
                setBusca("")
                setDisciplinaAtiva(null)
                fetchFresh("", null)
              }}
            >
              Limpar Filtros
            </Button>
          </div>
        )}
      </div>

      {/* Carregar mais */}
      {hasMore && professors.length > 0 && (
        <div className="mt-10 flex flex-col items-center gap-2">
          <p className="text-sm text-gray-400">
            Exibindo {professors.length} de {total} professores
          </p>
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando...
              </>
            ) : (
              "Carregar mais"
            )}
          </Button>
        </div>
      )}

      {/* Contador quando não há mais */}
      {!hasMore && professors.length > 0 && professors.length >= PAGE_SIZE && (
        <p className="mt-8 text-center text-sm text-gray-400">
          {professors.length} professor{professors.length !== 1 ? "es" : ""} exibido{professors.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
    </>
  )
}

function ProfessorCardItem({
  prof,
  onSelect,
}: {
  prof: ProfessorCard
  onSelect: (slug: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(prof.slug)}
      className="block group w-full text-left"
    >
      <div className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-lg hover:border-[#1D4ED8]/30 transition-all h-full flex flex-col relative overflow-hidden">
        {prof.em_alta && (
          <div className="absolute top-0 right-0 bg-[#F59E0B] text-white text-[10px] font-bold px-3 py-1 uppercase rounded-bl-lg tracking-wider flex items-center gap-1">
            <Flame className="h-2.5 w-2.5" />
            Em Alta
          </div>
        )}

        <div className="flex items-start gap-4 mb-4">
          {prof.avatar_url ? (
            <img
              src={prof.avatar_url}
              alt={prof.full_name}
              className="h-16 w-16 rounded-full object-cover shrink-0 border border-gray-100 group-hover:scale-105 transition-transform"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-gradient-to-tr from-blue-100 to-indigo-50 text-[#1D4ED8] flex items-center justify-center font-display font-bold text-xl shrink-0 border border-blue-100 group-hover:scale-105 transition-transform">
              {initials(prof.full_name)}
            </div>
          )}

          <div className="min-w-0">
            <h3 className="font-display font-semibold text-base text-gray-900 flex items-center gap-1.5 leading-tight">
              <span className="truncate">{prof.full_name}</span>
              <CheckCircle2 className="h-4 w-4 text-[#10B981] shrink-0" />
            </h3>
            <div className="flex flex-wrap gap-1 mt-2">
              {prof.interests.slice(0, 2).map((d) => (
                <Badge key={d} variant="secondary" className="bg-gray-100 text-gray-600 text-[10px] py-0">
                  {d}
                </Badge>
              ))}
              {prof.interests.length > 2 && (
                <Badge variant="secondary" className="bg-gray-100 text-gray-600 text-[10px] py-0">
                  +{prof.interests.length - 2}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <p className="text-gray-500 text-sm mb-5 line-clamp-2 flex-1">
          {prof.bio ?? "Professor verificado na plataforma EduConnect."}
        </p>

        <div className="mt-auto pt-4 border-t border-gray-100 flex items-center justify-between text-sm">
          <div className="flex items-center gap-4 text-gray-500">
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-gray-400" />
              <span>{formatCount(prof.followers_count)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <BookOpen className="h-4 w-4 text-gray-400" />
              <span>{prof.post_count} posts</span>
            </div>
          </div>
          <div className="text-[#1D4ED8] font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0">
            Ver Perfil <ChevronRight className="h-4 w-4" />
          </div>
        </div>
      </div>
    </button>
  )
}
