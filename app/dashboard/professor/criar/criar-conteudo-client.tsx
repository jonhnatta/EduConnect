"use client"

import {
  closeContentAssessment,
  createArticleDraft,
  createAssessmentDraft,
  createDicaDraft,
  createExerciseDraft,
  createSimuladoDraft,
  listMyClassroomsForArticle,
  loadProfessorContentForEdit,
  publishArticle,
  publishAssessment,
  publishDica,
  publishExercise,
  publishSimulado,
  saveAssessmentDraft,
  saveDicaDraft,
  saveExerciseDraft,
  saveSimuladoDraft,
} from "@/app/actions/content-items"
import {
  getMyContentReview,
  professorDecideAfterReview,
} from "@/app/actions/content-review"
import { ContentReviewDialog } from "@/components/dashboard/content-review-dialog"
import type { ContentReviewResult } from "@/lib/content/types"
import { ActivityExamEditor } from "@/components/dashboard/activity-exam-editor"
import { uploadArticleBlobViaApi } from "@/lib/article-upload-client"
import { ArticleCoverMedia } from "@/components/dashboard/article-cover-media"
import { TrixArticleBody } from "@/components/dashboard/trix-article-body"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DICA_MAX_IMAGES, type ContentVisibility, type ContentAudience } from "@/lib/content/types"
import {
  parseExamFromSettings,
  totalExamPoints,
  type ActivityExamDefinition,
} from "@/lib/activities/exam"
import { datetimeLocalToIso, isoToDatetimeLocal } from "@/lib/datetime-local"
import { cn } from "@/lib/utils"
import {
  AlertTriangle,
  ArrowLeft,
  BarChart,
  Bot,
  CheckCircle2,
  ClipboardList,
  FileText,
  LayoutGrid,
  Image as ImageIcon,
  Lightbulb,
  ListChecks,
  Loader2,
  Plus,
  Upload,
  Video,
  X,
  XCircle,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

const tiposConteudo = [
  { id: "artigo", label: "Artigo", icon: FileText, description: "Texto rico com formatacao, imagens e links" },
  { id: "exercicios", label: "Exercicios", icon: ListChecks, description: "Lista de questoes com alternativas" },
  { id: "avaliacao", label: "Avaliacao", icon: ClipboardList, description: "Prova com prazo e pontuacao" },
  { id: "simulado", label: "Simulado", icon: BarChart, description: "Questoes de multiplas disciplinas" },
  { id: "dica", label: "Dica Rapida", icon: Lightbulb, description: "Post curto educacional" },
]

const disciplinas = [
  "Matematica",
  "Portugues",
  "Historia",
  "Geografia",
  "Fisica",
  "Quimica",
  "Biologia",
  "Ingles",
]

const niveis = [
  "Fundamental I",
  "Fundamental II",
  "Ensino Medio",
  "Pre-vestibular",
  "Graduacao",
]

interface AIReview {
  originalidade: { score: number; status: "ok" | "warning" | "error"; message: string }
  precisao: { score: number; status: "ok" | "warning" | "error"; message: string }
  qualidade: { score: number; status: "ok" | "warning" | "error"; message: string }
  sugestoes: string[]
  statusFinal: "APROVADO" | "APROVADO_COM_RESSALVAS" | "REPROVADO"
}

type ClassroomOpt = { id: string; name: string; subject: string }

/** Dedupes createArticleDraft across React Strict Mode remounts (same tab). */
let articleDraftCreationPromise: Promise<string> | null = null

function resetArticleDraftCreation() {
  articleDraftCreationPromise = null
}

function getOrCreateArticleDraftId(): Promise<string> {
  if (!articleDraftCreationPromise) {
    articleDraftCreationPromise = createArticleDraft().then((res) => {
      if (!res.ok) {
        resetArticleDraftCreation()
        throw new Error(res.error)
      }
      return res.id
    })
  }
  return articleDraftCreationPromise
}

let exerciseDraftCreationPromise: Promise<string> | null = null

function resetExerciseDraftCreation() {
  exerciseDraftCreationPromise = null
}

function getOrCreateExerciseDraftId(): Promise<string> {
  if (!exerciseDraftCreationPromise) {
    exerciseDraftCreationPromise = createExerciseDraft().then((res) => {
      if (!res.ok) {
        resetExerciseDraftCreation()
        throw new Error(res.error)
      }
      return res.id
    })
  }
  return exerciseDraftCreationPromise
}

let assessmentDraftCreationPromise: Promise<string> | null = null

function resetAssessmentDraftCreation() {
  assessmentDraftCreationPromise = null
}

function getOrCreateAssessmentDraftId(): Promise<string> {
  if (!assessmentDraftCreationPromise) {
    assessmentDraftCreationPromise = createAssessmentDraft().then((res) => {
      if (!res.ok) {
        resetAssessmentDraftCreation()
        throw new Error(res.error)
      }
      return res.id
    })
  }
  return assessmentDraftCreationPromise
}

let simuladoDraftCreationPromise: Promise<string> | null = null

function resetSimuladoDraftCreation() {
  simuladoDraftCreationPromise = null
}

function getOrCreateSimuladoDraftId(): Promise<string> {
  if (!simuladoDraftCreationPromise) {
    simuladoDraftCreationPromise = createSimuladoDraft().then((res) => {
      if (!res.ok) {
        resetSimuladoDraftCreation()
        throw new Error(res.error)
      }
      return res.id
    })
  }
  return simuladoDraftCreationPromise
}

function htmlToPlainDicaDesc(html: string | null | undefined): string {
  if (!html?.trim()) return ""
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .trim()
}

let dicaDraftCreationPromise: Promise<string> | null = null

function resetDicaDraftCreation() {
  dicaDraftCreationPromise = null
}

function getOrCreateDicaDraftId(): Promise<string> {
  if (!dicaDraftCreationPromise) {
    dicaDraftCreationPromise = createDicaDraft().then((res) => {
      if (!res.ok) {
        resetDicaDraftCreation()
        throw new Error(res.error)
      }
      return res.id
    })
  }
  return dicaDraftCreationPromise
}

export function CriarConteudoClient({
  initialEditId,
}: {
  initialEditId: string | null
}) {
  const router = useRouter()
  const [step, setStep] = useState<"tipo" | "editor">(() =>
    initialEditId ? "editor" : "tipo"
  )
  const [tipoSelecionado, setTipoSelecionado] = useState<string | null>(() =>
    initialEditId ? null : null
  )
  const [isReviewing, setIsReviewing] = useState(false)
  const [showReviewDialog, setShowReviewDialog] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")

  const [formData, setFormData] = useState({
    titulo: "",
    disciplina: "",
    nivel: "",
    conteudo: "",
  })

  const [aiReview, setAiReview] = useState<AIReview | null>(null)
  const [reviewResult, setReviewResult] = useState<ContentReviewResult | null>(null)
  const [showEditorReviewDialog, setShowEditorReviewDialog] = useState(false)

  const [articleDraftId, setArticleDraftId] = useState<string | null>(null)
  const [articleBodyHtml, setArticleBodyHtml] = useState("")
  const [visibility, setVisibility] = useState<ContentVisibility>("public")
  const [audience, setAudience] = useState<ContentAudience>("all")
  const [classrooms, setClassrooms] = useState<ClassroomOpt[]>([])
  const [selectedClassroomIds, setSelectedClassroomIds] = useState<string[]>([])
  const [publishing, setPublishing] = useState(false)
  const [loadingEdit, setLoadingEdit] = useState(!!initialEditId)
  const [loadedArticleStatus, setLoadedArticleStatus] = useState<
    "draft" | "published" | "verificando" | "revisao" | "aguardando_decisao" | null
  >(null)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [coverVideoUrl, setCoverVideoUrl] = useState<string | null>(null)
  const [coverUploading, setCoverUploading] = useState(false)

  const [exerciseDraftId, setExerciseDraftId] = useState<string | null>(null)
  const [assessmentDraftId, setAssessmentDraftId] = useState<string | null>(null)
  const [examDef, setExamDef] = useState<ActivityExamDefinition | null>(null)
  const [exerciseIntroHtml, setExerciseIntroHtml] = useState("")
  const [assessmentIntroHtml, setAssessmentIntroHtml] = useState("")
  const [simuladoDraftId, setSimuladoDraftId] = useState<string | null>(null)
  const [simuladoIntroHtml, setSimuladoIntroHtml] = useState("")
  const [startsAtLocal, setStartsAtLocal] = useState("")
  const [dueAtLocal, setDueAtLocal] = useState("")
  const [assessmentClosed, setAssessmentClosed] = useState(false)
  const [closingAssessment, setClosingAssessment] = useState(false)

  const [dicaDraftId, setDicaDraftId] = useState<string | null>(null)
  const [dicaBodyText, setDicaBodyText] = useState("")
  const [dicaVideoUrl, setDicaVideoUrl] = useState<string | null>(null)
  const [dicaImageUrls, setDicaImageUrls] = useState<string[]>([])

  const ensureArticleDraftId = useCallback(async () => {
    if (articleDraftId) return articleDraftId
    const id = await getOrCreateArticleDraftId()
    setArticleDraftId(id)
    return id
  }, [articleDraftId])

  const ensureExerciseDraftId = useCallback(async () => {
    if (exerciseDraftId) return exerciseDraftId
    const id = await getOrCreateExerciseDraftId()
    setExerciseDraftId(id)
    return id
  }, [exerciseDraftId])

  const ensureAssessmentDraftId = useCallback(async () => {
    if (assessmentDraftId) return assessmentDraftId
    const id = await getOrCreateAssessmentDraftId()
    setAssessmentDraftId(id)
    return id
  }, [assessmentDraftId])

  const ensureSimuladoDraftId = useCallback(async () => {
    if (simuladoDraftId) return simuladoDraftId
    const id = await getOrCreateSimuladoDraftId()
    setSimuladoDraftId(id)
    return id
  }, [simuladoDraftId])

  useEffect(() => {
    if (!initialEditId) {
      setLoadingEdit(false)
      return
    }
    let cancelled = false
    setLoadingEdit(true)
    void listMyClassroomsForArticle().then(setClassrooms)
    void loadProfessorContentForEdit(initialEditId).then((res) => {
      if (cancelled) return
      if (!res.ok) {
        toast.error(res.error)
        setLoadingEdit(false)
        router.replace("/dashboard/professor/criar")
        return
      }
      if (res.kind === "article") {
        const a = res.article
        setTipoSelecionado("artigo")
        setArticleDraftId(a.id)
        setArticleBodyHtml(a.body_html ?? "")
        setFormData({
          titulo: a.title,
          disciplina: a.settings.disciplina ?? "",
          nivel: a.settings.nivel ?? "",
          conteudo: "",
        })
        setTags(a.settings.tags ?? [])
        setVisibility(a.visibility)
        setAudience(a.audience ?? "all")
        setSelectedClassroomIds(a.classroomIds)
        setLoadedArticleStatus(a.status)
        setCoverUrl(a.settings.coverUrl ?? null)
        setCoverVideoUrl(a.settings.coverVideoUrl ?? null)
        if (a.status === "revisao" || a.status === "aguardando_decisao") {
          void getMyContentReview(a.id).then((r) => {
            if (!cancelled) setReviewResult(r)
          })
        }
      } else if (res.kind === "dica") {
        const d = res.dica
        setTipoSelecionado("dica")
        setDicaDraftId(d.id)
        setDicaBodyText(htmlToPlainDicaDesc(d.body_html))
        const ds = d.settings
        setDicaVideoUrl(ds.dicaVideoUrl?.trim() || null)
        setDicaImageUrls(
          Array.isArray(ds.dicaImageUrls)
            ? ds.dicaImageUrls.filter(
                (x): x is string => typeof x === "string" && x.trim().length > 0
              )
            : []
        )
        setFormData({
          titulo: d.title,
          disciplina: d.settings.disciplina ?? "",
          nivel: d.settings.nivel ?? "",
          conteudo: "",
        })
        setTags(d.settings.tags ?? [])
        setVisibility(d.visibility)
        setAudience(d.audience ?? "all")
        setSelectedClassroomIds(d.classroomIds)
        setLoadedArticleStatus(d.status)
        setCoverUrl(null)
        setCoverVideoUrl(null)
      } else if (res.kind === "exercise") {
        const e = res.exercise
        setTipoSelecionado("exercicios")
        setExerciseDraftId(e.id)
        setExerciseIntroHtml(e.body_html ?? "")
        setFormData({
          titulo: e.title,
          disciplina: e.settings.disciplina ?? "",
          nivel: e.settings.nivel ?? "",
          conteudo: "",
        })
        setTags(e.settings.tags ?? [])
        setVisibility(e.visibility)
        setAudience(e.audience ?? "all")
        setSelectedClassroomIds(e.classroomIds)
        setLoadedArticleStatus(e.status)
        setCoverUrl(e.settings.coverUrl ?? null)
        setCoverVideoUrl(null)
        setExamDef(parseExamFromSettings(e.settings as Record<string, unknown>))
      } else if (res.kind === "simulado") {
        const e = res.simulado
        setTipoSelecionado("simulado")
        setSimuladoDraftId(e.id)
        setSimuladoIntroHtml(e.body_html ?? "")
        setStartsAtLocal(isoToDatetimeLocal(e.startsAt))
        setDueAtLocal(isoToDatetimeLocal(e.dueAt))
        setAssessmentClosed(e.assessmentClosed)
        setFormData({
          titulo: e.title,
          disciplina: e.settings.disciplina ?? "",
          nivel: e.settings.nivel ?? "",
          conteudo: "",
        })
        setTags(e.settings.tags ?? [])
        setVisibility(e.visibility)
        setAudience(e.audience ?? "all")
        setSelectedClassroomIds(e.classroomIds)
        setLoadedArticleStatus(e.status)
        setCoverUrl(e.settings.coverUrl ?? null)
        setCoverVideoUrl(null)
        setExamDef(parseExamFromSettings(e.settings as Record<string, unknown>))
      } else {
        const e = res.assessment
        setTipoSelecionado("avaliacao")
        setAssessmentDraftId(e.id)
        setAssessmentIntroHtml(e.body_html ?? "")
        setStartsAtLocal(isoToDatetimeLocal(e.startsAt))
        setDueAtLocal(isoToDatetimeLocal(e.dueAt))
        setAssessmentClosed(e.assessmentClosed)
        setFormData({
          titulo: e.title,
          disciplina: e.settings.disciplina ?? "",
          nivel: e.settings.nivel ?? "",
          conteudo: "",
        })
        setTags(e.settings.tags ?? [])
        setVisibility(e.visibility)
        setAudience(e.audience ?? "all")
        setSelectedClassroomIds(e.classroomIds)
        setLoadedArticleStatus(e.status)
        setCoverUrl(e.settings.coverUrl ?? null)
        setCoverVideoUrl(null)
        setExamDef(parseExamFromSettings(e.settings as Record<string, unknown>))
      }
      setLoadingEdit(false)
    })
    return () => {
      cancelled = true
    }
  }, [initialEditId, router])

  const handleTipoSelect = (tipo: string) => {
    setTipoSelecionado(tipo)
    setStep("editor")
    if (tipo !== "artigo") {
      setArticleDraftId(null)
      setArticleBodyHtml("")
      setCoverUrl(null)
      setCoverVideoUrl(null)
      resetArticleDraftCreation()
    }
    if (tipo !== "exercicios") {
      setExerciseDraftId(null)
      setExamDef(null)
      setExerciseIntroHtml("")
      resetExerciseDraftCreation()
    }
    if (tipo !== "avaliacao") {
      setAssessmentDraftId(null)
      setAssessmentIntroHtml("")
      setStartsAtLocal("")
      setDueAtLocal("")
      setAssessmentClosed(false)
      resetAssessmentDraftCreation()
    }
    if (tipo !== "simulado") {
      setSimuladoDraftId(null)
      setSimuladoIntroHtml("")
      setStartsAtLocal("")
      setDueAtLocal("")
      setAssessmentClosed(false)
      resetSimuladoDraftCreation()
    }
    if (tipo !== "dica") {
      setDicaDraftId(null)
      setDicaBodyText("")
      setDicaVideoUrl(null)
      setDicaImageUrls([])
      resetDicaDraftCreation()
    }
  }

  useEffect(() => {
    if (initialEditId) return
    if (step !== "editor") return
    if (
      tipoSelecionado !== "artigo" &&
      tipoSelecionado !== "dica" &&
      tipoSelecionado !== "exercicios" &&
      tipoSelecionado !== "avaliacao" &&
      tipoSelecionado !== "simulado"
    )
      return
    void listMyClassroomsForArticle().then(setClassrooms)
  }, [step, tipoSelecionado, initialEditId])

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()])
      setTagInput("")
    }
  }

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }

  const toggleClassroom = (id: string) => {
    setSelectedClassroomIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleRevisao = async () => {
    if (tipoSelecionado === "artigo" && !initialEditId) {
      try {
        await ensureArticleDraftId()
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Erro ao preparar rascunho para revisao"
        )
        return
      }
    }
    setIsReviewing(true)
    setTimeout(() => {
      setAiReview({
        originalidade: {
          score: 95,
          status: "ok",
          message: "Nenhum plagio detectado",
        },
        precisao: {
          score: 88,
          status: "warning",
          message:
            "Possivel imprecisao no trecho sobre formula de Bhaskara - verifique os sinais",
        },
        qualidade: {
          score: 92,
          status: "ok",
          message: "Conteudo bem estruturado e claro",
        },
        sugestoes: [
          "Adicione mais exemplos praticos para facilitar o entendimento",
          "Considere incluir uma imagem ilustrativa da parabola",
          "O ultimo paragrafo poderia ter uma conclusao mais clara",
        ],
        statusFinal: "APROVADO_COM_RESSALVAS",
      })
      setIsReviewing(false)
      setShowReviewDialog(true)
    }, 3000)
  }

  const handlePublishArticle = async () => {
    const title = formData.titulo.trim()
    if (!title) {
      toast.error("Informe o titulo")
      return
    }
    if (visibility === "classrooms" && selectedClassroomIds.length === 0) {
      toast.error("Selecione ao menos uma turma")
      return
    }
    let contentId = articleDraftId
    if (!contentId) {
      if (initialEditId) {
        toast.error("Aguarde o editor carregar")
        return
      }
      try {
        contentId = await getOrCreateArticleDraftId()
        setArticleDraftId(contentId)
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Erro ao criar rascunho para publicar"
        )
        return
      }
    }
    setPublishing(true)
    const res = await publishArticle({
      id: contentId,
      title,
      bodyHtml: articleBodyHtml,
      visibility,
      audience: visibility === "public" ? audience : "all",
      classroomIds: visibility === "classrooms" ? selectedClassroomIds : undefined,
      settings: {
        tags,
        disciplina: formData.disciplina.trim() || undefined,
        nivel: formData.nivel.trim() || undefined,
        coverUrl: coverUrl ?? null,
        coverVideoUrl: coverVideoUrl ?? null,
      },
    })
    setPublishing(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    resetArticleDraftCreation()
    toast.success("Artigo enviado para revisao da IA")
    router.push("/dashboard/professor/conteudos")
  }

  const handleSaveExerciseDraft = async () => {
    const title = formData.titulo.trim()
    if (!title) {
      toast.error("Informe o titulo")
      return
    }
    let cid = exerciseDraftId
    if (!cid) {
      if (initialEditId) {
        toast.error("Aguarde o editor carregar")
        return
      }
      try {
        cid = await getOrCreateExerciseDraftId()
        setExerciseDraftId(cid)
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Erro ao criar rascunho"
        )
        return
      }
    }
    const res = await saveExerciseDraft({
      id: cid,
      title,
      bodyHtml: exerciseIntroHtml,
      settings: {
        tags,
        disciplina: formData.disciplina.trim() || undefined,
        nivel: formData.nivel.trim() || undefined,
        coverUrl: coverUrl ?? null,
        coverVideoUrl: null,
      },
      exam: examDef,
    })
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("Rascunho salvo")
  }

  const handlePublishExercise = async () => {
    const title = formData.titulo.trim()
    if (!title) {
      toast.error("Informe o titulo")
      return
    }
    if (visibility === "classrooms" && selectedClassroomIds.length === 0) {
      toast.error("Selecione ao menos uma turma")
      return
    }
    if (!examDef || examDef.questions.length === 0) {
      toast.error("Adicione ao menos uma questao")
      return
    }
    if (!coverUrl?.trim()) {
      toast.message("Dica: adicione uma imagem de capa para destacar o exercicio no feed")
    }
    let cid = exerciseDraftId
    if (!cid) {
      if (initialEditId) {
        toast.error("Aguarde o editor carregar")
        return
      }
      try {
        cid = await getOrCreateExerciseDraftId()
        setExerciseDraftId(cid)
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Erro ao criar rascunho para publicar"
        )
        return
      }
    }
    setPublishing(true)
    const saveRes = await saveExerciseDraft({
      id: cid,
      title,
      bodyHtml: exerciseIntroHtml,
      settings: {
        tags,
        disciplina: formData.disciplina.trim() || undefined,
        nivel: formData.nivel.trim() || undefined,
        coverUrl: coverUrl ?? null,
        coverVideoUrl: null,
      },
      exam: examDef,
    })
    if (!saveRes.ok) {
      setPublishing(false)
      toast.error(saveRes.error)
      return
    }
    const res = await publishExercise({
      id: cid,
      title,
      bodyHtml: exerciseIntroHtml,
      visibility,
      audience: visibility === "public" ? audience : "all",
      classroomIds: visibility === "classrooms" ? selectedClassroomIds : undefined,
      settings: {
        tags,
        disciplina: formData.disciplina.trim() || undefined,
        nivel: formData.nivel.trim() || undefined,
        coverUrl: coverUrl ?? null,
        coverVideoUrl: null,
        exam: examDef,
      },
    })
    setPublishing(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    resetExerciseDraftCreation()
    if (loadedArticleStatus === "published") {
      toast.success("Alteracoes salvas")
      router.push("/dashboard/professor/conteudos")
    } else {
      toast.success("Exercicio publicado")
      router.push(`/conteudo/${cid}`)
    }
  }

  const handleSaveAssessmentDraft = async () => {
    const title = formData.titulo.trim()
    if (!title) {
      toast.error("Informe o titulo")
      return
    }
    let cid = assessmentDraftId
    if (!cid) {
      if (initialEditId) {
        toast.error("Aguarde o editor carregar")
        return
      }
      try {
        cid = await getOrCreateAssessmentDraftId()
        setAssessmentDraftId(cid)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao criar rascunho")
        return
      }
    }
    const dueIso = datetimeLocalToIso(dueAtLocal)
    const startsIso = datetimeLocalToIso(startsAtLocal)
    const res = await saveAssessmentDraft({
      id: cid,
      title,
      bodyHtml: assessmentIntroHtml,
      settings: {
        tags,
        disciplina: formData.disciplina.trim() || undefined,
        nivel: formData.nivel.trim() || undefined,
        coverUrl: coverUrl ?? null,
        coverVideoUrl: null,
      },
      exam: examDef,
      dueAt: dueIso,
      startsAt: startsIso,
    })
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("Rascunho salvo")
  }

  const handlePublishAssessment = async () => {
    const title = formData.titulo.trim()
    if (!title) {
      toast.error("Informe o titulo")
      return
    }
    if (visibility === "classrooms" && selectedClassroomIds.length === 0) {
      toast.error("Selecione ao menos uma turma")
      return
    }
    if (!examDef || examDef.questions.length === 0) {
      toast.error("Adicione ao menos uma questao")
      return
    }
    const dueIso = datetimeLocalToIso(dueAtLocal)
    if (!dueIso) {
      toast.error("Informe a data e hora limite de entrega")
      return
    }
    if (!coverUrl?.trim()) {
      toast.message("Dica: adicione uma imagem de capa para destacar no feed")
    }
    let cid = assessmentDraftId
    if (!cid) {
      if (initialEditId) {
        toast.error("Aguarde o editor carregar")
        return
      }
      try {
        cid = await getOrCreateAssessmentDraftId()
        setAssessmentDraftId(cid)
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Erro ao criar rascunho para publicar"
        )
        return
      }
    }
    setPublishing(true)
    const startsIso = datetimeLocalToIso(startsAtLocal)
    const saveRes = await saveAssessmentDraft({
      id: cid,
      title,
      bodyHtml: assessmentIntroHtml,
      settings: {
        tags,
        disciplina: formData.disciplina.trim() || undefined,
        nivel: formData.nivel.trim() || undefined,
        coverUrl: coverUrl ?? null,
        coverVideoUrl: null,
      },
      exam: examDef,
      dueAt: dueIso,
      startsAt: startsIso,
    })
    if (!saveRes.ok) {
      setPublishing(false)
      toast.error(saveRes.error)
      return
    }
    const res = await publishAssessment({
      id: cid,
      title,
      bodyHtml: assessmentIntroHtml,
      visibility,
      audience: visibility === "public" ? audience : "all",
      classroomIds: visibility === "classrooms" ? selectedClassroomIds : undefined,
      settings: {
        tags,
        disciplina: formData.disciplina.trim() || undefined,
        nivel: formData.nivel.trim() || undefined,
        coverUrl: coverUrl ?? null,
        coverVideoUrl: null,
        exam: examDef,
      },
      dueAt: dueIso,
      startsAt: startsIso,
    })
    setPublishing(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    resetAssessmentDraftCreation()
    if (loadedArticleStatus === "published") {
      toast.success("Alteracoes salvas")
      router.push("/dashboard/professor/conteudos")
    } else {
      toast.success("Avaliacao publicada")
      router.push(`/conteudo/${cid}`)
    }
  }

  const handleSaveSimuladoDraft = async () => {
    const title = formData.titulo.trim()
    if (!title) {
      toast.error("Informe o titulo")
      return
    }
    let cid = simuladoDraftId
    if (!cid) {
      if (initialEditId) {
        toast.error("Aguarde o editor carregar")
        return
      }
      try {
        cid = await getOrCreateSimuladoDraftId()
        setSimuladoDraftId(cid)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao criar rascunho")
        return
      }
    }
    const dueIso = datetimeLocalToIso(dueAtLocal)
    const startsIso = datetimeLocalToIso(startsAtLocal)
    const res = await saveSimuladoDraft({
      id: cid,
      title,
      bodyHtml: simuladoIntroHtml,
      settings: {
        tags,
        disciplina: formData.disciplina.trim() || undefined,
        nivel: formData.nivel.trim() || undefined,
        coverUrl: coverUrl ?? null,
        coverVideoUrl: null,
      },
      exam: examDef,
      dueAt: dueIso,
      startsAt: startsIso,
    })
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("Rascunho salvo")
  }

  const handlePublishSimulado = async () => {
    const title = formData.titulo.trim()
    if (!title) {
      toast.error("Informe o titulo")
      return
    }
    if (visibility === "classrooms" && selectedClassroomIds.length === 0) {
      toast.error("Selecione ao menos uma turma")
      return
    }
    if (!examDef || examDef.questions.length === 0) {
      toast.error("Adicione ao menos uma questao")
      return
    }
    const dueIso = datetimeLocalToIso(dueAtLocal)
    if (!dueIso) {
      toast.error("Informe a data e hora limite de entrega")
      return
    }
    if (!coverUrl?.trim()) {
      toast.message("Dica: adicione uma imagem de capa para destacar no feed")
    }
    let cid = simuladoDraftId
    if (!cid) {
      if (initialEditId) {
        toast.error("Aguarde o editor carregar")
        return
      }
      try {
        cid = await getOrCreateSimuladoDraftId()
        setSimuladoDraftId(cid)
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Erro ao criar rascunho para publicar"
        )
        return
      }
    }
    setPublishing(true)
    const startsIso = datetimeLocalToIso(startsAtLocal)
    const saveRes = await saveSimuladoDraft({
      id: cid,
      title,
      bodyHtml: simuladoIntroHtml,
      settings: {
        tags,
        disciplina: formData.disciplina.trim() || undefined,
        nivel: formData.nivel.trim() || undefined,
        coverUrl: coverUrl ?? null,
        coverVideoUrl: null,
      },
      exam: examDef,
      dueAt: dueIso,
      startsAt: startsIso,
    })
    if (!saveRes.ok) {
      setPublishing(false)
      toast.error(saveRes.error)
      return
    }
    const res = await publishSimulado({
      id: cid,
      title,
      bodyHtml: simuladoIntroHtml,
      visibility,
      audience: visibility === "public" ? audience : "all",
      classroomIds: visibility === "classrooms" ? selectedClassroomIds : undefined,
      settings: {
        tags,
        disciplina: formData.disciplina.trim() || undefined,
        nivel: formData.nivel.trim() || undefined,
        coverUrl: coverUrl ?? null,
        coverVideoUrl: null,
        exam: examDef,
      },
      dueAt: dueIso,
      startsAt: startsIso,
    })
    setPublishing(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    resetSimuladoDraftCreation()
    if (loadedArticleStatus === "published") {
      toast.success("Alteracoes salvas")
      router.push("/dashboard/professor/conteudos")
    } else {
      toast.success("Simulado publicado")
      router.push(`/conteudo/${cid}`)
    }
  }

  const handleSaveDicaDraft = async () => {
    const title = formData.titulo.trim()
    if (!title) {
      toast.error("Informe o titulo")
      return
    }
    let cid = dicaDraftId ?? initialEditId
    if (!cid) {
      try {
        cid = await getOrCreateDicaDraftId()
        setDicaDraftId(cid)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao criar rascunho")
        return
      }
    }
    const res = await saveDicaDraft({
      id: cid,
      title,
      bodyHtml: dicaBodyText,
      settings: {
        tags,
        disciplina: formData.disciplina.trim() || undefined,
        nivel: formData.nivel.trim() || undefined,
        dicaVideoUrl: dicaVideoUrl ?? null,
        dicaImageUrls: dicaImageUrls.length > 0 ? dicaImageUrls : null,
      },
    })
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("Rascunho salvo")
  }

  const handlePublishDica = async () => {
    const title = formData.titulo.trim()
    if (!title) {
      toast.error("Informe o titulo")
      return
    }
    if (visibility === "classrooms" && selectedClassroomIds.length === 0) {
      toast.error("Selecione ao menos uma turma")
      return
    }
    let contentId = dicaDraftId ?? initialEditId
    if (!contentId) {
      try {
        contentId = await getOrCreateDicaDraftId()
        setDicaDraftId(contentId)
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Erro ao criar rascunho para publicar"
        )
        return
      }
    }
    setPublishing(true)
    const res = await publishDica({
      id: contentId,
      title,
      bodyHtml: dicaBodyText,
      visibility,
      audience: visibility === "public" ? audience : "all",
      classroomIds: visibility === "classrooms" ? selectedClassroomIds : undefined,
      settings: {
        tags,
        disciplina: formData.disciplina.trim() || undefined,
        nivel: formData.nivel.trim() || undefined,
        dicaVideoUrl: dicaVideoUrl ?? null,
        dicaImageUrls: dicaImageUrls.length > 0 ? dicaImageUrls : null,
      },
    })
    setPublishing(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    resetDicaDraftCreation()
    if (loadedArticleStatus === "published") {
      toast.success("Alteracoes salvas")
      router.push("/dashboard/professor/conteudos")
    } else {
      toast.success("Dica publicada")
      router.push(`/conteudo/${contentId}`)
    }
  }

  const handleDicaVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      e.target.value = ""
      return
    }
    setCoverUploading(true)
    try {
      let cid = dicaDraftId ?? initialEditId
      if (!cid) {
        cid = await getOrCreateDicaDraftId()
        setDicaDraftId(cid)
      }
      const res = await uploadArticleBlobViaApi("cover-video", cid, file)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setDicaVideoUrl(res.displayUrl)
      setDicaImageUrls([])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro no upload do video")
    } finally {
      setCoverUploading(false)
      e.target.value = ""
    }
  }

  const handleDicaImagesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) {
      e.target.value = ""
      return
    }
    const file = files[0]
    if (!file) {
      e.target.value = ""
      return
    }
    setCoverUploading(true)
    try {
      let cid = dicaDraftId ?? initialEditId
      if (!cid) {
        cid = await getOrCreateDicaDraftId()
        setDicaDraftId(cid)
      }
      const res = await uploadArticleBlobViaApi("dica-image", cid, file)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setDicaImageUrls([res.displayUrl])
      setDicaVideoUrl(null)
      toast.success("Imagem enviada com sucesso")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro no upload")
    } finally {
      setCoverUploading(false)
      e.target.value = ""
    }
  }

  const handleCloseAssessment = async () => {
    const cid = assessmentDraftId ?? initialEditId
    if (!cid) return
    setClosingAssessment(true)
    const res = await closeContentAssessment(cid)
    setClosingAssessment(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setAssessmentClosed(true)
    toast.success("Avaliacao encerrada para novas respostas")
    router.refresh()
  }

  const handleCloseSimulado = async () => {
    const cid = simuladoDraftId ?? initialEditId
    if (!cid) return
    setClosingAssessment(true)
    const res = await closeContentAssessment(cid)
    setClosingAssessment(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setAssessmentClosed(true)
    toast.success("Simulado encerrado para novas respostas")
    router.refresh()
  }

  const goBackFromEditor = () => {
    if (initialEditId) {
      router.push("/dashboard/professor/conteudos")
      return
    }
    setStep("tipo")
    setTipoSelecionado(null)
    setArticleDraftId(null)
    setArticleBodyHtml("")
    setExerciseDraftId(null)
    setExamDef(null)
    setExerciseIntroHtml("")
    setAssessmentDraftId(null)
    setAssessmentIntroHtml("")
    setSimuladoDraftId(null)
    setSimuladoIntroHtml("")
    setStartsAtLocal("")
    setDueAtLocal("")
    setAssessmentClosed(false)
    setCoverUrl(null)
    setCoverVideoUrl(null)
    resetArticleDraftCreation()
    resetExerciseDraftCreation()
    resetAssessmentDraftCreation()
    resetSimuladoDraftCreation()
    setDicaDraftId(null)
    setDicaBodyText("")
    setDicaVideoUrl(null)
    setDicaImageUrls([])
    resetDicaDraftCreation()
  }

  const clearCoverMedia = () => {
    setCoverUrl(null)
    setCoverVideoUrl(null)
  }

  const handleCoverImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      e.target.value = ""
      return
    }
    setCoverUploading(true)
    try {
      const isExercise = tipoSelecionado === "exercicios"
      const isAssessment = tipoSelecionado === "avaliacao"
      const isSimulado = tipoSelecionado === "simulado"
      let cid = isExercise
        ? exerciseDraftId
        : isAssessment
          ? assessmentDraftId
          : isSimulado
            ? simuladoDraftId
            : articleDraftId
      if (!cid) {
        if (initialEditId) {
          toast.error("Aguarde o editor carregar")
          return
        }
        if (isExercise) {
          cid = await getOrCreateExerciseDraftId()
          setExerciseDraftId(cid)
        } else if (isAssessment) {
          cid = await getOrCreateAssessmentDraftId()
          setAssessmentDraftId(cid)
        } else if (isSimulado) {
          cid = await getOrCreateSimuladoDraftId()
          setSimuladoDraftId(cid)
        } else {
          cid = await getOrCreateArticleDraftId()
          setArticleDraftId(cid)
        }
      }
      const res = await uploadArticleBlobViaApi("cover-image", cid, file)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setCoverUrl(res.displayUrl)
      setCoverVideoUrl(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro no upload da capa")
    } finally {
      setCoverUploading(false)
      e.target.value = ""
    }
  }

  const handleCoverVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      e.target.value = ""
      return
    }
    setCoverUploading(true)
    try {
      let cid = articleDraftId
      if (!cid) {
        if (initialEditId) {
          toast.error("Aguarde o artigo carregar")
          return
        }
        cid = await getOrCreateArticleDraftId()
        setArticleDraftId(cid)
      }
      const res = await uploadArticleBlobViaApi("cover-video", cid, file)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setCoverVideoUrl(res.displayUrl)
      setCoverUrl(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro no upload do video")
    } finally {
      setCoverUploading(false)
      e.target.value = ""
    }
  }

  if (loadingEdit && initialEditId) {
    return (
      <div className="max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[45vh] gap-3 pb-20">
        <Loader2 className="h-10 w-10 animate-spin text-[#1D4ED8]" />
        <p className="text-sm text-gray-600">Carregando conteudo...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto pb-20 lg:pb-0">
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 mt-0.5"
            onClick={() => (step === "editor" ? goBackFromEditor() : router.back())}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl font-bold text-gray-900">
              {step === "tipo"
                ? "Criar Conteudo"
                : initialEditId && tipoSelecionado === "artigo"
                  ? "Editar artigo"
                  : initialEditId && tipoSelecionado === "exercicios"
                    ? "Editar exercicio"
                    : initialEditId && tipoSelecionado === "avaliacao"
                      ? "Editar avaliacao"
                      : initialEditId && tipoSelecionado === "simulado"
                        ? "Editar simulado"
                        : initialEditId && tipoSelecionado === "dica"
                          ? "Editar dica"
                          : `Novo ${tiposConteudo.find((t) => t.id === tipoSelecionado)?.label}`}
            </h1>
            <p className="text-gray-600">
              {step === "tipo"
                ? "Escolha o tipo de conteudo que deseja criar"
                : "Preencha os detalhes do seu conteudo"}
            </p>
          </div>
        </div>
        {step === "tipo" && (
          <Button
            asChild
            variant="outline"
            size="sm"
            className="w-full shrink-0 gap-2 border-[#1D4ED8] text-[#1D4ED8] hover:bg-blue-50 sm:w-auto sm:self-center"
          >
            <Link href="/dashboard/professor/conteudos">
              <LayoutGrid className="h-4 w-4" />
              Meu feed
            </Link>
          </Button>
        )}
      </div>

      {step === "tipo" && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tiposConteudo.map((tipo) => (
            <button
              key={tipo.id}
              type="button"
              onClick={() => handleTipoSelect(tipo.id)}
              className="p-6 rounded-xl border-2 border-gray-200 bg-white text-left transition-all hover:border-[#1D4ED8] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:ring-offset-2"
            >
              <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
                <tipo.icon className="h-6 w-6 text-[#1D4ED8]" />
              </div>
              <h3 className="font-display font-semibold text-gray-900 mb-1">{tipo.label}</h3>
              <p className="text-sm text-gray-600">{tipo.description}</p>
            </button>
          ))}
        </div>
      )}

      {step === "editor" && (
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
            {/* Banners de status de revisão — artigos only */}
            {tipoSelecionado === "artigo" && loadedArticleStatus === "verificando" && (
              <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-blue-800">Artigo em análise pela IA</p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    O agente está verificando fatos, originalidade e qualidade. Você será notificado assim que concluir.
                  </p>
                </div>
              </div>
            )}
            {tipoSelecionado === "artigo" && loadedArticleStatus === "revisao" && (
              <div className="flex items-start justify-between gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-800">Revisão necessária</p>
                    <p className="text-xs text-red-600 mt-0.5">
                      Score abaixo de 50. Corrija os problemas apontados e reenvie para revisão.
                    </p>
                  </div>
                </div>
                {reviewResult && (
                  <button
                    type="button"
                    className="text-xs font-semibold text-red-700 underline underline-offset-2 shrink-0"
                    onClick={() => setShowEditorReviewDialog(true)}
                  >
                    Ver resultado
                  </button>
                )}
              </div>
            )}
            {tipoSelecionado === "artigo" && loadedArticleStatus === "aguardando_decisao" && (
              <div className="flex items-start justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Aguarda sua decisão</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Score entre 50 e 80. Você pode publicar assim mesmo ou revisar o artigo.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="text-xs font-semibold text-amber-700 underline underline-offset-2 shrink-0"
                  onClick={() => setShowEditorReviewDialog(true)}
                >
                  Decidir
                </button>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="titulo">Titulo</Label>
              <Input
                id="titulo"
                placeholder="Digite o titulo do seu conteudo"
                className="h-12"
                value={formData.titulo}
                onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="disciplina">Disciplina</Label>
                <select
                  id="disciplina"
                  className="w-full h-12 px-3 rounded-md border border-input bg-background"
                  value={formData.disciplina}
                  onChange={(e) => setFormData({ ...formData, disciplina: e.target.value })}
                >
                  <option value="">Selecione</option>
                  {disciplinas.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nivel">Nivel de Ensino</Label>
                <select
                  id="nivel"
                  className="w-full h-12 px-3 rounded-md border border-input bg-background"
                  value={formData.nivel}
                  onChange={(e) => setFormData({ ...formData, nivel: e.target.value })}
                >
                  <option value="">Selecione</option>
                  {niveis.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Adicione uma tag"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                />
                <Button type="button" variant="outline" onClick={addTag}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {tipoSelecionado === "artigo" && (
              <>
                <div className="space-y-2">
                  <Label>Capa do artigo (opcional)</Label>
                  <p className="text-xs text-muted-foreground">
                    Escolha uma imagem ou um video (nao os dois). Imagem: JPEG, PNG, GIF ou WebP ate 5
                    MB. Video: MP4, WebM ou MOV ate 80 MB. Aparece no feed e no topo do artigo
                    publico.
                  </p>
                  {coverUrl || coverVideoUrl ? (
                    <div className="relative rounded-lg border border-input overflow-hidden aspect-video max-h-52 bg-muted">
                      <ArticleCoverMedia
                        imageUrl={coverUrl}
                        videoUrl={coverVideoUrl}
                        className="w-full h-full object-cover"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={clearCoverMedia}
                      >
                        Remover
                      </Button>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2 flex-wrap">
                    <label
                      className={cn(
                        "inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background h-10 px-4 cursor-pointer hover:bg-muted/50",
                        (coverUploading || (!!initialEditId && !articleDraftId)) &&
                          "pointer-events-none cursor-not-allowed opacity-50"
                      )}
                      aria-disabled={
                        coverUploading || (!!initialEditId && !articleDraftId) || undefined
                      }
                    >
                      <ImageIcon className="h-4 w-4 mr-2" />
                      {coverUploading ? "Enviando..." : "Imagem"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
                        className="sr-only"
                        disabled={coverUploading || (!!initialEditId && !articleDraftId)}
                        onChange={(e) => void handleCoverImageChange(e)}
                      />
                    </label>
                    <label
                      className={cn(
                        "inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background h-10 px-4 cursor-pointer hover:bg-muted/50",
                        (coverUploading || (!!initialEditId && !articleDraftId)) &&
                          "pointer-events-none cursor-not-allowed opacity-50"
                      )}
                      aria-disabled={
                        coverUploading || (!!initialEditId && !articleDraftId) || undefined
                      }
                    >
                      <Video className="h-4 w-4 mr-2" />
                      {coverUploading ? "Enviando..." : "Video"}
                      <input
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v"
                        className="sr-only"
                        disabled={coverUploading || (!!initialEditId && !articleDraftId)}
                        onChange={(e) => void handleCoverVideoChange(e)}
                      />
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Conteudo</Label>
                  <TrixArticleBody
                    key={initialEditId ?? "novo-artigo"}
                    contentItemId={articleDraftId}
                    initialHtml={articleBodyHtml}
                    onHtmlChange={setArticleBodyHtml}
                    ensureContentItemId={initialEditId ? undefined : ensureArticleDraftId}
                  />
                </div>

                <div className="space-y-3 rounded-lg border border-gray-100 p-4 bg-gray-50/80">
                  <Label className="text-base">Quem pode ver este artigo</Label>
                  <div className="space-y-2">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="vis"
                        className="mt-1"
                        checked={visibility === "public"}
                        onChange={() => setVisibility("public")}
                      />
                      <span>
                        <span className="font-medium text-gray-900">Publico</span>
                        <span className="block text-sm text-gray-600">
                          Qualquer pessoa com o link ou no feed explorar
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="vis"
                        className="mt-1"
                        checked={visibility === "classrooms"}
                        onChange={() => setVisibility("classrooms")}
                      />
                      <span>
                        <span className="font-medium text-gray-900">Turmas selecionadas</span>
                        <span className="block text-sm text-gray-600">
                          Apenas alunos matriculados nas turmas que voce marcar
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="vis"
                        className="mt-1"
                        checked={visibility === "private"}
                        onChange={() => setVisibility("private")}
                      />
                      <span>
                        <span className="font-medium text-gray-900">Privado</span>
                        <span className="block text-sm text-gray-600">
                          Somente voce (rascunho visivel na sua conta)
                        </span>
                      </span>
                    </label>
                  </div>

                  {visibility === "public" && (
                    <div className="pt-3 space-y-2 border-t border-gray-200 mt-2">
                      <Label className="text-sm">Para quem publicar</Label>
                      <div className="grid sm:grid-cols-3 gap-2">
                        {[
                          { key: "all", label: "Todos", desc: "Alunos e professores" },
                          { key: "students", label: "So alunos", desc: "Aparece no feed dos alunos" },
                          { key: "teachers", label: "So professores", desc: "Comunidade de professores" },
                        ].map((opt) => (
                          <label
                            key={opt.key}
                            className={`flex flex-col gap-0.5 rounded-lg border p-3 cursor-pointer transition-colors ${
                              audience === opt.key
                                ? "border-[#1D4ED8] bg-blue-50"
                                : "border-gray-200 hover:bg-gray-50"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="audience"
                                checked={audience === opt.key}
                                onChange={() => setAudience(opt.key as ContentAudience)}
                              />
                              <span className="font-medium text-sm text-gray-900">{opt.label}</span>
                            </span>
                            <span className="text-xs text-gray-500 pl-6">{opt.desc}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {visibility === "classrooms" && (
                    <div className="pt-2 space-y-2 border-t border-gray-200 mt-2">
                      <p className="text-sm text-gray-600">Selecione as turmas</p>
                      {classrooms.length === 0 ? (
                        <p className="text-sm text-amber-700">
                          Voce ainda nao tem turmas ativas. Crie uma em Minhas Salas.
                        </p>
                      ) : (
                        <ul className="space-y-2 max-h-40 overflow-y-auto">
                          {classrooms.map((c) => (
                            <li key={c.id}>
                              <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedClassroomIds.includes(c.id)}
                                  onChange={() => toggleClassroom(c.id)}
                                />
                                <span>
                                  {c.name}{" "}
                                  <span className="text-gray-500">({c.subject})</span>
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {tipoSelecionado === "dica" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="dica-desc">Descricao</Label>
                  <Textarea
                    id="dica-desc"
                    placeholder="Legenda da sua dica (paragrafos e quebras de linha)"
                    className="min-h-[120px]"
                    value={dicaBodyText}
                    onChange={(e) => setDicaBodyText(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Midia (video ou 1 imagem)</Label>
                  <p className="text-xs text-muted-foreground">
                    Escolha um video ou uma imagem (nao os dois). Imagem: JPEG, PNG, GIF ou WebP ate 5
                    MB. Video: MP4, WebM ou MOV ate 80 MB.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="dica-video-upload" className="text-xs text-muted-foreground">
                        Video
                      </Label>
                      <Input
                        id="dica-video-upload"
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v"
                        disabled={coverUploading}
                        onChange={(e) => void handleDicaVideoChange(e)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="dica-image-upload" className="text-xs text-muted-foreground">
                        Imagem
                      </Label>
                      <Input
                        id="dica-image-upload"
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
                        disabled={coverUploading}
                        onChange={(e) => void handleDicaImagesChange(e)}
                      />
                    </div>
                    {coverUploading ? (
                      <p className="text-xs text-muted-foreground sm:col-span-2">Enviando arquivo...</p>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      {dicaImageUrls.length}/{DICA_MAX_IMAGES} imagem
                    </span>
                  </div>
                  {dicaVideoUrl ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setDicaVideoUrl(null)}
                    >
                      Remover video
                    </Button>
                  ) : null}
                  {dicaImageUrls.length > 0 ? (
                    <ul className="flex flex-wrap gap-2">
                      {dicaImageUrls.map((url, idx) => (
                        <li
                          key={`${url}-${idx}`}
                          className="relative h-16 w-16 rounded border overflow-hidden shrink-0"
                        >
                          <img src={url} alt="" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white"
                            onClick={() =>
                              setDicaImageUrls((prev) => prev.filter((_, i) => i !== idx))
                            }
                            aria-label="Remover imagem"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {dicaImageUrls.length > 0 ? (
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-2 space-y-1">
                      <p className="text-xs font-medium text-gray-700">
                        Imagem enviada
                      </p>
                      {dicaImageUrls.map((url, idx) => (
                        <div
                          key={`${url}-item-${idx}`}
                          className="text-xs text-gray-600 flex items-center justify-between gap-2"
                        >
                          <span className="truncate">Imagem {idx + 1} enviada</span>
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#1D4ED8] hover:underline shrink-0"
                          >
                            abrir
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3 rounded-lg border border-gray-100 p-4 bg-gray-50/80">
                  <Label className="text-base">Quem pode ver esta dica</Label>
                  <div className="space-y-2">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="vis-dica"
                        className="mt-1"
                        checked={visibility === "public"}
                        onChange={() => setVisibility("public")}
                      />
                      <span>
                        <span className="font-medium text-gray-900">Publico</span>
                        <span className="block text-sm text-gray-600">
                          Qualquer pessoa com o link ou no feed explorar
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="vis-dica"
                        className="mt-1"
                        checked={visibility === "classrooms"}
                        onChange={() => setVisibility("classrooms")}
                      />
                      <span>
                        <span className="font-medium text-gray-900">Turmas selecionadas</span>
                        <span className="block text-sm text-gray-600">
                          Apenas alunos matriculados nas turmas que voce marcar
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="vis-dica"
                        className="mt-1"
                        checked={visibility === "private"}
                        onChange={() => setVisibility("private")}
                      />
                      <span>
                        <span className="font-medium text-gray-900">Privado</span>
                        <span className="block text-sm text-gray-600">
                          Somente voce (rascunho visivel na sua conta)
                        </span>
                      </span>
                    </label>
                  </div>

                  {visibility === "public" && (
                    <div className="pt-3 space-y-2 border-t border-gray-200 mt-2">
                      <Label className="text-sm">Para quem publicar</Label>
                      <div className="grid sm:grid-cols-3 gap-2">
                        {[
                          { key: "all", label: "Todos", desc: "Alunos e professores" },
                          { key: "students", label: "So alunos", desc: "Aparece no feed dos alunos" },
                          { key: "teachers", label: "So professores", desc: "Comunidade de professores" },
                        ].map((opt) => (
                          <label
                            key={opt.key}
                            className={`flex flex-col gap-0.5 rounded-lg border p-3 cursor-pointer transition-colors ${
                              audience === opt.key
                                ? "border-[#1D4ED8] bg-blue-50"
                                : "border-gray-200 hover:bg-gray-50"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="audience"
                                checked={audience === opt.key}
                                onChange={() => setAudience(opt.key as ContentAudience)}
                              />
                              <span className="font-medium text-sm text-gray-900">{opt.label}</span>
                            </span>
                            <span className="text-xs text-gray-500 pl-6">{opt.desc}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {visibility === "classrooms" && (
                    <div className="pt-2 space-y-2 border-t border-gray-200 mt-2">
                      <p className="text-sm text-gray-600">Selecione as turmas</p>
                      {classrooms.length === 0 ? (
                        <p className="text-sm text-amber-700">
                          Voce ainda nao tem turmas ativas. Crie uma em Minhas Salas.
                        </p>
                      ) : (
                        <ul className="space-y-2 max-h-40 overflow-y-auto">
                          {classrooms.map((c) => (
                            <li key={c.id}>
                              <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedClassroomIds.includes(c.id)}
                                  onChange={() => toggleClassroom(c.id)}
                                />
                                <span>
                                  {c.name}{" "}
                                  <span className="text-gray-500">({c.subject})</span>
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {tipoSelecionado === "avaliacao" && (
              <>
                <div className="space-y-2">
                  <Label>Capa (imagem)</Label>
                  <p className="text-xs text-muted-foreground">
                    Apenas imagem (JPEG, PNG, GIF ou WebP ate 5 MB). Video nao e permitido em
                    avaliacoes.
                  </p>
                  {coverUrl ? (
                    <div className="relative rounded-lg border border-input overflow-hidden aspect-video max-h-52 bg-muted">
                      <ArticleCoverMedia
                        imageUrl={coverUrl}
                        videoUrl={null}
                        className="w-full h-full object-cover"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => {
                          setCoverUrl(null)
                          setCoverVideoUrl(null)
                        }}
                      >
                        Remover
                      </Button>
                    </div>
                  ) : null}
                  <label
                    className={cn(
                      "inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background h-10 px-4 cursor-pointer hover:bg-muted/50",
                      (coverUploading || (!!initialEditId && !assessmentDraftId)) &&
                        "pointer-events-none cursor-not-allowed opacity-50"
                    )}
                    aria-disabled={
                      coverUploading || (!!initialEditId && !assessmentDraftId) || undefined
                    }
                  >
                    <ImageIcon className="h-4 w-4 mr-2" />
                    {coverUploading ? "Enviando..." : "Enviar imagem de capa"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
                      className="sr-only"
                      disabled={coverUploading || (!!initialEditId && !assessmentDraftId)}
                      onChange={(e) => void handleCoverImageChange(e)}
                    />
                  </label>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="assessment-starts">Abertura (opcional)</Label>
                    <Input
                      id="assessment-starts"
                      type="datetime-local"
                      className="h-12"
                      value={startsAtLocal}
                      onChange={(e) => setStartsAtLocal(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Se vazio, os alunos podem responder apos a publicacao.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="assessment-due">Entrega limite</Label>
                    <Input
                      id="assessment-due"
                      type="datetime-local"
                      className="h-12"
                      value={dueAtLocal}
                      onChange={(e) => setDueAtLocal(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Obrigatorio ao publicar. Bloqueia rascunho e envio apos esse horario.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Texto introdutorio (opcional)</Label>
                  <TrixArticleBody
                    key={initialEditId ? `as-edit-${initialEditId}` : "novo-avaliacao"}
                    contentItemId={assessmentDraftId}
                    initialHtml={assessmentIntroHtml}
                    onHtmlChange={setAssessmentIntroHtml}
                    ensureContentItemId={initialEditId ? undefined : ensureAssessmentDraftId}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Label>Questoes</Label>
                    {examDef ? (
                      <span className="text-xs text-gray-500">
                        Total: {totalExamPoints(examDef)} pts
                      </span>
                    ) : null}
                  </div>
                  <ActivityExamEditor value={examDef} onChange={setExamDef} />
                </div>

                <div className="space-y-3 rounded-lg border border-gray-100 p-4 bg-gray-50/80">
                  <Label className="text-base">Quem pode ver esta avaliacao</Label>
                  <div className="space-y-2">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="vis-as"
                        className="mt-1"
                        checked={visibility === "public"}
                        onChange={() => setVisibility("public")}
                      />
                      <span>
                        <span className="font-medium text-gray-900">Publico</span>
                        <span className="block text-sm text-gray-600">
                          Qualquer pessoa com o link ou no feed explorar
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="vis-as"
                        className="mt-1"
                        checked={visibility === "classrooms"}
                        onChange={() => setVisibility("classrooms")}
                      />
                      <span>
                        <span className="font-medium text-gray-900">Turmas selecionadas</span>
                        <span className="block text-sm text-gray-600">
                          Apenas alunos matriculados nas turmas que voce marcar
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="vis-as"
                        className="mt-1"
                        checked={visibility === "private"}
                        onChange={() => setVisibility("private")}
                      />
                      <span>
                        <span className="font-medium text-gray-900">Privado</span>
                        <span className="block text-sm text-gray-600">
                          Somente voce (rascunho visivel na sua conta)
                        </span>
                      </span>
                    </label>
                  </div>

                  {visibility === "public" && (
                    <div className="pt-3 space-y-2 border-t border-gray-200 mt-2">
                      <Label className="text-sm">Para quem publicar</Label>
                      <div className="grid sm:grid-cols-3 gap-2">
                        {[
                          { key: "all", label: "Todos", desc: "Alunos e professores" },
                          { key: "students", label: "So alunos", desc: "Aparece no feed dos alunos" },
                          { key: "teachers", label: "So professores", desc: "Comunidade de professores" },
                        ].map((opt) => (
                          <label
                            key={opt.key}
                            className={`flex flex-col gap-0.5 rounded-lg border p-3 cursor-pointer transition-colors ${
                              audience === opt.key
                                ? "border-[#1D4ED8] bg-blue-50"
                                : "border-gray-200 hover:bg-gray-50"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="audience"
                                checked={audience === opt.key}
                                onChange={() => setAudience(opt.key as ContentAudience)}
                              />
                              <span className="font-medium text-sm text-gray-900">{opt.label}</span>
                            </span>
                            <span className="text-xs text-gray-500 pl-6">{opt.desc}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {visibility === "classrooms" && (
                    <div className="pt-2 space-y-2 border-t border-gray-200 mt-2">
                      <p className="text-sm text-gray-600">Selecione as turmas</p>
                      {classrooms.length === 0 ? (
                        <p className="text-sm text-amber-700">
                          Voce ainda nao tem turmas ativas. Crie uma em Minhas Salas.
                        </p>
                      ) : (
                        <ul className="space-y-2 max-h-40 overflow-y-auto">
                          {classrooms.map((c) => (
                            <li key={c.id}>
                              <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedClassroomIds.includes(c.id)}
                                  onChange={() => toggleClassroom(c.id)}
                                />
                                <span>
                                  {c.name}{" "}
                                  <span className="text-gray-500">({c.subject})</span>
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {loadedArticleStatus === "published" && !assessmentClosed ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={closingAssessment}
                      onClick={() => void handleCloseAssessment()}
                    >
                      {closingAssessment ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      Encerrar avaliacao
                    </Button>
                    <p className="text-xs text-muted-foreground self-center">
                      Alunos deixam de enviar ou alterar rascunho; voce ainda pode corrigir
                      dissertativas.
                    </p>
                  </div>
                ) : null}
              </>
            )}

            {tipoSelecionado === "simulado" && (
              <>
                <div className="space-y-2">
                  <Label>Capa (imagem)</Label>
                  <p className="text-xs text-muted-foreground">
                    Apenas imagem (JPEG, PNG, GIF ou WebP ate 5 MB). Video nao e permitido em
                    simulados.
                  </p>
                  {coverUrl ? (
                    <div className="relative rounded-lg border border-input overflow-hidden aspect-video max-h-52 bg-muted">
                      <ArticleCoverMedia
                        imageUrl={coverUrl}
                        videoUrl={null}
                        className="w-full h-full object-cover"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => {
                          setCoverUrl(null)
                          setCoverVideoUrl(null)
                        }}
                      >
                        Remover
                      </Button>
                    </div>
                  ) : null}
                  <label
                    className={cn(
                      "inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background h-10 px-4 cursor-pointer hover:bg-muted/50",
                      (coverUploading || (!!initialEditId && !simuladoDraftId)) &&
                        "pointer-events-none cursor-not-allowed opacity-50"
                    )}
                    aria-disabled={
                      coverUploading || (!!initialEditId && !simuladoDraftId) || undefined
                    }
                  >
                    <ImageIcon className="h-4 w-4 mr-2" />
                    {coverUploading ? "Enviando..." : "Enviar imagem de capa"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
                      className="sr-only"
                      disabled={coverUploading || (!!initialEditId && !simuladoDraftId)}
                      onChange={(e) => void handleCoverImageChange(e)}
                    />
                  </label>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="simulado-starts">Abertura (opcional)</Label>
                    <Input
                      id="simulado-starts"
                      type="datetime-local"
                      className="h-12"
                      value={startsAtLocal}
                      onChange={(e) => setStartsAtLocal(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Se vazio, os alunos podem responder apos a publicacao.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="simulado-due">Entrega limite</Label>
                    <Input
                      id="simulado-due"
                      type="datetime-local"
                      className="h-12"
                      value={dueAtLocal}
                      onChange={(e) => setDueAtLocal(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Obrigatorio ao publicar. Bloqueia rascunho e envio apos esse horario.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Texto introdutorio (opcional)</Label>
                  <TrixArticleBody
                    key={initialEditId ? `sim-edit-${initialEditId}` : "novo-simulado"}
                    contentItemId={simuladoDraftId}
                    initialHtml={simuladoIntroHtml}
                    onHtmlChange={setSimuladoIntroHtml}
                    ensureContentItemId={initialEditId ? undefined : ensureSimuladoDraftId}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Label>Questoes (disciplina por questao)</Label>
                    {examDef ? (
                      <span className="text-xs text-gray-500">
                        Total: {totalExamPoints(examDef)} pts
                      </span>
                    ) : null}
                  </div>
                  <ActivityExamEditor
                    value={examDef}
                    onChange={setExamDef}
                    showDisciplinaPerQuestion
                    disciplinaOptions={disciplinas}
                  />
                </div>

                <div className="space-y-3 rounded-lg border border-gray-100 p-4 bg-gray-50/80">
                  <Label className="text-base">Quem pode ver este simulado</Label>
                  <div className="space-y-2">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="vis-sim"
                        className="mt-1"
                        checked={visibility === "public"}
                        onChange={() => setVisibility("public")}
                      />
                      <span>
                        <span className="font-medium text-gray-900">Publico</span>
                        <span className="block text-sm text-gray-600">
                          Qualquer pessoa com o link ou no feed explorar
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="vis-sim"
                        className="mt-1"
                        checked={visibility === "classrooms"}
                        onChange={() => setVisibility("classrooms")}
                      />
                      <span>
                        <span className="font-medium text-gray-900">Turmas selecionadas</span>
                        <span className="block text-sm text-gray-600">
                          Apenas alunos matriculados nas turmas que voce marcar
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="vis-sim"
                        className="mt-1"
                        checked={visibility === "private"}
                        onChange={() => setVisibility("private")}
                      />
                      <span>
                        <span className="font-medium text-gray-900">Privado</span>
                        <span className="block text-sm text-gray-600">
                          Somente voce (rascunho visivel na sua conta)
                        </span>
                      </span>
                    </label>
                  </div>

                  {visibility === "public" && (
                    <div className="pt-3 space-y-2 border-t border-gray-200 mt-2">
                      <Label className="text-sm">Para quem publicar</Label>
                      <div className="grid sm:grid-cols-3 gap-2">
                        {[
                          { key: "all", label: "Todos", desc: "Alunos e professores" },
                          { key: "students", label: "So alunos", desc: "Aparece no feed dos alunos" },
                          { key: "teachers", label: "So professores", desc: "Comunidade de professores" },
                        ].map((opt) => (
                          <label
                            key={opt.key}
                            className={`flex flex-col gap-0.5 rounded-lg border p-3 cursor-pointer transition-colors ${
                              audience === opt.key
                                ? "border-[#1D4ED8] bg-blue-50"
                                : "border-gray-200 hover:bg-gray-50"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="audience"
                                checked={audience === opt.key}
                                onChange={() => setAudience(opt.key as ContentAudience)}
                              />
                              <span className="font-medium text-sm text-gray-900">{opt.label}</span>
                            </span>
                            <span className="text-xs text-gray-500 pl-6">{opt.desc}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {visibility === "classrooms" && (
                    <div className="pt-2 space-y-2 border-t border-gray-200 mt-2">
                      <p className="text-sm text-gray-600">Selecione as turmas</p>
                      {classrooms.length === 0 ? (
                        <p className="text-sm text-amber-700">
                          Voce ainda nao tem turmas ativas. Crie uma em Minhas Salas.
                        </p>
                      ) : (
                        <ul className="space-y-2 max-h-40 overflow-y-auto">
                          {classrooms.map((c) => (
                            <li key={c.id}>
                              <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedClassroomIds.includes(c.id)}
                                  onChange={() => toggleClassroom(c.id)}
                                />
                                <span>
                                  {c.name}{" "}
                                  <span className="text-gray-500">({c.subject})</span>
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {loadedArticleStatus === "published" && !assessmentClosed ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={closingAssessment}
                      onClick={() => void handleCloseSimulado()}
                    >
                      {closingAssessment ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      Encerrar simulado
                    </Button>
                    <p className="text-xs text-muted-foreground self-center">
                      Alunos deixam de enviar ou alterar rascunho; voce ainda pode corrigir
                      dissertativas.
                    </p>
                  </div>
                ) : null}
              </>
            )}

            {tipoSelecionado === "exercicios" && (
              <>
                    <div className="space-y-2">
                      <Label>Capa do exercicio (imagem)</Label>
                      <p className="text-xs text-muted-foreground">
                        Apenas imagem (JPEG, PNG, GIF ou WebP ate 5 MB). Recomendado para o feed e pagina
                        publica. Video nao e permitido em exercicios.
                      </p>
                      {coverUrl ? (
                        <div className="relative rounded-lg border border-input overflow-hidden aspect-video max-h-52 bg-muted">
                          <ArticleCoverMedia
                            imageUrl={coverUrl}
                            videoUrl={null}
                            className="w-full h-full object-cover"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="absolute top-2 right-2"
                            onClick={() => {
                              setCoverUrl(null)
                              setCoverVideoUrl(null)
                            }}
                          >
                            Remover
                          </Button>
                        </div>
                      ) : null}
                      <label
                        className={cn(
                          "inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background h-10 px-4 cursor-pointer hover:bg-muted/50",
                          (coverUploading || (!!initialEditId && !exerciseDraftId)) &&
                            "pointer-events-none cursor-not-allowed opacity-50"
                        )}
                        aria-disabled={
                          coverUploading || (!!initialEditId && !exerciseDraftId) || undefined
                        }
                      >
                        <ImageIcon className="h-4 w-4 mr-2" />
                        {coverUploading ? "Enviando..." : "Enviar imagem de capa"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
                          className="sr-only"
                          disabled={coverUploading || (!!initialEditId && !exerciseDraftId)}
                          onChange={(e) => void handleCoverImageChange(e)}
                        />
                      </label>
                    </div>

                    <div className="space-y-2">
                      <Label>Texto introdutorio (opcional)</Label>
                      <TrixArticleBody
                        key={initialEditId ? `ex-edit-${initialEditId}` : "novo-exercicio"}
                        contentItemId={exerciseDraftId}
                        initialHtml={exerciseIntroHtml}
                        onHtmlChange={setExerciseIntroHtml}
                        ensureContentItemId={initialEditId ? undefined : ensureExerciseDraftId}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Label>Questoes</Label>
                        {examDef ? (
                          <span className="text-xs text-gray-500">
                            Total: {totalExamPoints(examDef)} pts
                          </span>
                        ) : null}
                      </div>
                      <ActivityExamEditor value={examDef} onChange={setExamDef} />
                    </div>

                    <div className="space-y-3 rounded-lg border border-gray-100 p-4 bg-gray-50/80">
                      <Label className="text-base">Quem pode ver este exercicio</Label>
                      <div className="space-y-2">
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="radio"
                            name="vis-ex"
                            className="mt-1"
                            checked={visibility === "public"}
                            onChange={() => setVisibility("public")}
                          />
                          <span>
                            <span className="font-medium text-gray-900">Publico</span>
                            <span className="block text-sm text-gray-600">
                              Qualquer pessoa com o link ou no feed explorar
                            </span>
                          </span>
                        </label>
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="radio"
                            name="vis-ex"
                            className="mt-1"
                            checked={visibility === "classrooms"}
                            onChange={() => setVisibility("classrooms")}
                          />
                          <span>
                            <span className="font-medium text-gray-900">Turmas selecionadas</span>
                            <span className="block text-sm text-gray-600">
                              Apenas alunos matriculados nas turmas que voce marcar
                            </span>
                          </span>
                        </label>
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="radio"
                            name="vis-ex"
                            className="mt-1"
                            checked={visibility === "private"}
                            onChange={() => setVisibility("private")}
                          />
                          <span>
                            <span className="font-medium text-gray-900">Privado</span>
                            <span className="block text-sm text-gray-600">
                              Somente voce (rascunho visivel na sua conta)
                            </span>
                          </span>
                        </label>
                      </div>

                      {visibility === "classrooms" && (
                        <div className="pt-2 space-y-2 border-t border-gray-200 mt-2">
                          <p className="text-sm text-gray-600">Selecione as turmas</p>
                          {classrooms.length === 0 ? (
                            <p className="text-sm text-amber-700">
                              Voce ainda nao tem turmas ativas. Crie uma em Minhas Salas.
                            </p>
                          ) : (
                            <ul className="space-y-2 max-h-40 overflow-y-auto">
                              {classrooms.map((c) => (
                                <li key={c.id}>
                                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={selectedClassroomIds.includes(c.id)}
                                      onChange={() => toggleClassroom(c.id)}
                                    />
                                    <span>
                                      {c.name}{" "}
                                      <span className="text-gray-500">({c.subject})</span>
                                    </span>
                                  </label>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
              </>
            )}

            {tipoSelecionado !== "artigo" &&
              tipoSelecionado !== "dica" &&
              tipoSelecionado !== "exercicios" &&
              tipoSelecionado !== "avaliacao" &&
              tipoSelecionado !== "simulado" &&
              tipoSelecionado !== undefined && (
                <div className="space-y-2">
                  <Label htmlFor="conteudo">Conteudo</Label>
                  <Textarea
                    id="conteudo"
                    placeholder="Escreva seu conteudo aqui..."
                    className="min-h-[300px] font-mono text-sm"
                    value={formData.conteudo}
                    onChange={(e) => setFormData({ ...formData, conteudo: e.target.value })}
                  />
                </div>
              )}

            {tipoSelecionado !== "artigo" &&
              tipoSelecionado !== "dica" &&
              tipoSelecionado !== "exercicios" &&
              tipoSelecionado !== "avaliacao" &&
              tipoSelecionado !== "simulado" &&
              tipoSelecionado !== undefined && (
                <div className="space-y-2">
                  <Label>Imagem de Capa (opcional)</Label>
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
                    <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Arraste uma imagem ou clique para enviar</p>
                  </div>
                </div>
              )}

            <div className="flex gap-4 pt-4 flex-wrap">
              <Button type="button" variant="outline" className="flex-1 min-w-[120px]" onClick={goBackFromEditor}>
                Cancelar
              </Button>
              {tipoSelecionado === "artigo" ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 min-w-[120px] gap-2"
                    onClick={() => void handleRevisao()}
                    disabled={!formData.titulo.trim()}
                  >
                    <Bot className="h-4 w-4" />
                    Revisao IA (opcional)
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 min-w-[140px] bg-[#1D4ED8] hover:bg-[#1E3A8A] gap-2"
                    onClick={() => void handlePublishArticle()}
                    disabled={
                      publishing ||
                      loadedArticleStatus === "verificando" ||
                      loadedArticleStatus === "aguardando_decisao" ||
                      !formData.titulo.trim() ||
                      (visibility === "classrooms" && selectedClassroomIds.length === 0)
                    }
                  >
                    {publishing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {loadedArticleStatus === "verificando"
                      ? "Em analise..."
                      : loadedArticleStatus === "aguardando_decisao"
                        ? "Aguardando decisao"
                        : loadedArticleStatus === "revisao"
                          ? "Corrigir e Reenviar"
                          : loadedArticleStatus === "published"
                            ? "Salvar alteracoes"
                            : "Publicar"}
                  </Button>
                </>
              ) : tipoSelecionado === "exercicios" ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 min-w-[120px]"
                    onClick={() => void handleSaveExerciseDraft()}
                    disabled={publishing || !formData.titulo.trim()}
                  >
                    Salvar rascunho
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 min-w-[140px] bg-[#1D4ED8] hover:bg-[#1E3A8A] gap-2"
                    onClick={() => void handlePublishExercise()}
                    disabled={
                      publishing ||
                      !formData.titulo.trim() ||
                      (visibility === "classrooms" && selectedClassroomIds.length === 0)
                    }
                  >
                    {publishing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {loadedArticleStatus === "published" ? "Salvar alteracoes" : "Publicar"}
                  </Button>
                </>
              ) : tipoSelecionado === "avaliacao" ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 min-w-[120px]"
                    onClick={() => void handleSaveAssessmentDraft()}
                    disabled={publishing || !formData.titulo.trim()}
                  >
                    Salvar rascunho
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 min-w-[140px] bg-[#1D4ED8] hover:bg-[#1E3A8A] gap-2"
                    onClick={() => void handlePublishAssessment()}
                    disabled={
                      publishing ||
                      !formData.titulo.trim() ||
                      (visibility === "classrooms" && selectedClassroomIds.length === 0)
                    }
                  >
                    {publishing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {loadedArticleStatus === "published" ? "Salvar alteracoes" : "Publicar"}
                  </Button>
                </>
              ) : tipoSelecionado === "simulado" ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 min-w-[120px]"
                    onClick={() => void handleSaveSimuladoDraft()}
                    disabled={publishing || !formData.titulo.trim()}
                  >
                    Salvar rascunho
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 min-w-[140px] bg-[#1D4ED8] hover:bg-[#1E3A8A] gap-2"
                    onClick={() => void handlePublishSimulado()}
                    disabled={
                      publishing ||
                      !formData.titulo.trim() ||
                      (visibility === "classrooms" && selectedClassroomIds.length === 0)
                    }
                  >
                    {publishing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {loadedArticleStatus === "published" ? "Salvar alteracoes" : "Publicar"}
                  </Button>
                </>
              ) : tipoSelecionado === "dica" ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 min-w-[120px]"
                    onClick={() => void handleSaveDicaDraft()}
                    disabled={publishing || !formData.titulo.trim()}
                  >
                    Salvar rascunho
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 min-w-[140px] bg-[#1D4ED8] hover:bg-[#1E3A8A] gap-2"
                    onClick={() => void handlePublishDica()}
                    disabled={
                      publishing ||
                      !formData.titulo.trim() ||
                      (visibility === "classrooms" && selectedClassroomIds.length === 0)
                    }
                  >
                    {publishing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {loadedArticleStatus === "published" ? "Salvar alteracoes" : "Publicar"}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  className="flex-1 bg-[#1D4ED8] hover:bg-[#1E3A8A] gap-2"
                  onClick={handleRevisao}
                  disabled={!formData.titulo || !formData.disciplina}
                >
                  <Bot className="h-4 w-4" />
                  Enviar para Revisao da IA
                </Button>
              )}
            </div>
          </form>
        </div>
      )}

      <ContentReviewDialog
        contentItemId={articleDraftId}
        status={
          loadedArticleStatus === "revisao" || loadedArticleStatus === "aguardando_decisao"
            ? loadedArticleStatus
            : null
        }
        open={showEditorReviewDialog}
        onOpenChange={(o) => {
          setShowEditorReviewDialog(o)
          if (!o) router.refresh()
        }}
      />

      <Dialog open={isReviewing} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md">
          <div className="text-center py-8">
            <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4 relative">
              <Bot className="h-8 w-8 text-[#1D4ED8]" />
              <div className="absolute inset-0 rounded-full border-4 border-blue-200 border-t-[#1D4ED8] animate-spin" />
            </div>
            <h3 className="font-display text-lg font-semibold text-gray-900 mb-2">
              A IA esta analisando seu conteudo...
            </h3>
            <p className="text-sm text-gray-600">Verificando originalidade, precisao e qualidade</p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Relatorio de Revisao da IA</DialogTitle>
            <DialogDescription>Veja o resultado da analise do seu conteudo</DialogDescription>
          </DialogHeader>

          {aiReview && (
            <div className="space-y-6">
              <div
                className={`p-4 rounded-lg ${
                  aiReview.statusFinal === "APROVADO"
                    ? "bg-green-50 border border-green-200"
                    : aiReview.statusFinal === "APROVADO_COM_RESSALVAS"
                      ? "bg-amber-50 border border-amber-200"
                      : "bg-red-50 border border-red-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  {aiReview.statusFinal === "APROVADO" ? (
                    <CheckCircle2 className="h-6 w-6 text-[#10B981]" />
                  ) : aiReview.statusFinal === "APROVADO_COM_RESSALVAS" ? (
                    <AlertTriangle className="h-6 w-6 text-amber-500" />
                  ) : (
                    <X className="h-6 w-6 text-red-500" />
                  )}
                  <div>
                    <div className="font-semibold text-gray-900">
                      {aiReview.statusFinal === "APROVADO"
                        ? "Aprovado"
                        : aiReview.statusFinal === "APROVADO_COM_RESSALVAS"
                          ? "Aprovado com Ressalvas"
                          : "Reprovado"}
                    </div>
                    <div className="text-sm text-gray-600">
                      {aiReview.statusFinal === "APROVADO"
                        ? "Seu conteudo esta pronto para publicar!"
                        : aiReview.statusFinal === "APROVADO_COM_RESSALVAS"
                          ? "Revise os pontos abaixo antes de publicar"
                          : "Corrija os problemas encontrados"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { label: "Originalidade", data: aiReview.originalidade },
                  { label: "Precisao Conceitual", data: aiReview.precisao },
                  { label: "Qualidade Geral", data: aiReview.qualidade },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700">{item.label}</span>
                        <span
                          className={`text-sm font-semibold ${
                            item.data.status === "ok"
                              ? "text-[#10B981]"
                              : item.data.status === "warning"
                                ? "text-amber-500"
                                : "text-red-500"
                          }`}
                        >
                          {item.data.score}%
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            item.data.status === "ok"
                              ? "bg-[#10B981]"
                              : item.data.status === "warning"
                                ? "bg-amber-500"
                                : "bg-red-500"
                          }`}
                          style={{ width: `${item.data.score}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{item.data.message}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-2">Sugestoes de Melhoria</h4>
                <ul className="space-y-2">
                  {aiReview.sugestoes.map((sugestao, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                      <Lightbulb className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      {sugestao}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1" onClick={() => setShowReviewDialog(false)}>
                  Editar e Reenviar
                </Button>
                <Button
                  className="flex-1 bg-[#10B981] hover:bg-[#059669]"
                  onClick={() => {
                    setShowReviewDialog(false)
                    if (tipoSelecionado === "artigo") void handlePublishArticle()
                    else if (tipoSelecionado === "exercicios") void handlePublishExercise()
                    else if (tipoSelecionado === "avaliacao") void handlePublishAssessment()
                    else if (tipoSelecionado === "simulado") void handlePublishSimulado()
                    else if (tipoSelecionado === "dica") void handlePublishDica()
                    else router.push("/dashboard/professor?published=true")
                  }}
                >
                  Publicar Assim Mesmo
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
