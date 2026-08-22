"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { listStudentsAcrossClassroomsForProfessor } from "@/app/actions/classrooms"
import type { ProfessorStudentRow } from "@/lib/classrooms/types"
import { labelProfessorStudentRow } from "@/lib/classrooms/professor-students-display"
import { Input } from "@/components/ui/input"
import { Loader2, Search } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  initialQuery: string
}

export function ProfessorAlunosSearchBar({ initialQuery }: Props) {
  const router = useRouter()
  const [localQ, setLocalQ] = useState(initialQuery)
  const [suggestions, setSuggestions] = useState<ProfessorStudentRow[]>([])
  const [loadingSuggest, setLoadingSuggest] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceUrlRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Browser navigation can replace the server-provided query.
    setLocalQ(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    if (debounceUrlRef.current) clearTimeout(debounceUrlRef.current)
    debounceUrlRef.current = setTimeout(() => {
      const p = new URLSearchParams(window.location.search)
      const urlQ = p.get("q") ?? ""
      if (localQ.trim() === urlQ.trim()) return
      if (localQ.trim()) p.set("q", localQ.trim())
      else p.delete("q")
      p.set("page", "1")
      const path = window.location.pathname
      router.replace(`${path}?${p.toString()}`)
    }, 420)
    return () => {
      if (debounceUrlRef.current) clearTimeout(debounceUrlRef.current)
    }
  }, [localQ, router])

  useEffect(() => {
    const q = localQ.trim()
    if (q.length < 2) return
    let cancelled = false
    const t = setTimeout(async () => {
      setLoadingSuggest(true)
      const r = await listStudentsAcrossClassroomsForProfessor({
        search: q,
        page: 1,
        pageSize: 8,
      })
      if (!cancelled) {
        if (!r.error) setSuggestions(r.rows)
        setLoadingSuggest(false)
      }
    }, 280)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [localQ])

  function applySuggestion(row: ProfessorStudentRow) {
    const label = labelProfessorStudentRow(row)
    setLocalQ(label)
    setOpen(false)
    const p = new URLSearchParams(window.location.search)
    p.set("q", label)
    p.set("page", "1")
    router.replace(`${window.location.pathname}?${p.toString()}`)
  }

  return (
    <div className="relative mb-6">
      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <Input
          value={localQ}
          onChange={(e) => {
            setLocalQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 180)
          }}
          placeholder="Buscar aluno por nome..."
          className="pl-10 pr-4"
          aria-autocomplete="list"
          aria-expanded={open && localQ.trim().length >= 2}
          autoComplete="off"
        />
        {open && localQ.trim().length >= 2 && (
          <div
            className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white py-1 shadow-lg max-h-64 overflow-auto"
            role="listbox"
          >
            {loadingSuggest && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando...
              </div>
            )}
            {!loadingSuggest && suggestions.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-500">
                Nenhum aluno encontrado com esse texto.
              </div>
            )}
            {!loadingSuggest &&
              suggestions.map((row) => (
                <button
                  key={row.studentId}
                  type="button"
                  role="option"
                  aria-selected="false"
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm hover:bg-blue-50",
                    "focus:bg-blue-50 focus:outline-none"
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applySuggestion(row)}
                >
                  <span className="font-medium text-gray-900">
                    {labelProfessorStudentRow(row)}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {row.classrooms.length}{" "}
                    {row.classrooms.length === 1 ? "turma" : "turmas"}
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        A lista abaixo é paginada. A busca filtra por nome (e parte do codigo do
        perfil) e atualiza ao parar de digitar.
      </p>
    </div>
  )
}
