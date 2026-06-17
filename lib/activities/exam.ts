import type { ActivityAttachment } from "@/lib/activities/attachments"

export const EXAM_VERSION = 1 as const
export const EXAM_MAX_QUESTIONS = 40
export const EXAM_OPEN_TEXT_MAX = 20_000
export const EXAM_MCQ_MIN_OPTIONS = 2
export const EXAM_MCQ_MAX_OPTIONS = 10

export type ExamQuestionMcq = {
  id: string
  order: number
  type: "mcq"
  prompt: string
  options: string[]
  correctIndex: number
  points: number
  /** Simulado multidisciplinar: rotulo da area (ex.: Matematica) */
  disciplina?: string
}

export type ExamQuestionOpen = {
  id: string
  order: number
  type: "open"
  prompt: string
  points: number
  disciplina?: string
}

export type ExamQuestion = ExamQuestionMcq | ExamQuestionOpen

export type ActivityExamDefinition = {
  version: typeof EXAM_VERSION
  questions: ExamQuestion[]
}

export type ExamQuestionPublicMcq = Omit<ExamQuestionMcq, "correctIndex">
export type ExamQuestionPublicOpen = ExamQuestionOpen
export type ExamQuestionPublic = ExamQuestionPublicMcq | ExamQuestionPublicOpen

export type ActivityExamPublic = {
  version: typeof EXAM_VERSION
  questions: ExamQuestionPublic[]
}

/** Respostas do aluno: id da questão -> payload */
export type StudentExamAnswers = Record<
  string,
  | { type: "mcq"; choiceIndex: number }
  | { type: "open"; text: string }
>

export function parseExamFromSettings(
  settings: Record<string, unknown> | null | undefined
): ActivityExamDefinition | null {
  const raw = settings?.exam
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  if (o.version !== EXAM_VERSION) return null
  if (!Array.isArray(o.questions)) return null
  const questions: ExamQuestion[] = []
  for (const item of o.questions) {
    if (!item || typeof item !== "object") continue
    const q = item as Record<string, unknown>
    const id = typeof q.id === "string" ? q.id : ""
    const order = typeof q.order === "number" ? q.order : 0
    const type = q.type === "mcq" || q.type === "open" ? q.type : null
    if (!id || !type) continue
    const prompt = typeof q.prompt === "string" ? q.prompt.trim() : ""
    const points = typeof q.points === "number" && q.points > 0 ? q.points : 0
    if (!prompt || points <= 0) continue
    const rawDisc = q.disciplina
    const disciplina =
      typeof rawDisc === "string" && rawDisc.trim()
        ? rawDisc.trim()
        : undefined
    if (type === "mcq") {
      const options = Array.isArray(q.options)
        ? q.options.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        : []
      const correctIndex =
        typeof q.correctIndex === "number" ? Math.floor(q.correctIndex) : -1
      questions.push({
        id,
        order,
        type: "mcq",
        prompt,
        options,
        correctIndex,
        points,
        ...(disciplina ? { disciplina } : {}),
      })
    } else {
      questions.push({
        id,
        order,
        type: "open",
        prompt,
        points,
        ...(disciplina ? { disciplina } : {}),
      })
    }
  }
  if (questions.length === 0) return null
  questions.sort((a, b) => a.order - b.order)
  return { version: EXAM_VERSION, questions }
}

export function validateExamDefinition(
  exam: ActivityExamDefinition | null
): string | null {
  if (!exam) return null
  if (exam.questions.length > EXAM_MAX_QUESTIONS) {
    return `No maximo ${EXAM_MAX_QUESTIONS} questoes`
  }
  const ids = new Set<string>()
  for (const q of exam.questions) {
    if (ids.has(q.id)) return "IDs de questao duplicados"
    ids.add(q.id)
    if (q.type === "mcq") {
      if (q.options.length < EXAM_MCQ_MIN_OPTIONS) {
        return "Cada questao de multipla escolha precisa de pelo menos 2 opcoes"
      }
      if (q.options.length > EXAM_MCQ_MAX_OPTIONS) {
        return `No maximo ${EXAM_MCQ_MAX_OPTIONS} opcoes por questao`
      }
      if (q.correctIndex < 0 || q.correctIndex >= q.options.length) {
        return "Indice da resposta correta invalido"
      }
    }
  }
  return null
}

/** Publicacao de simulado: toda questao deve ter disciplina preenchida. */
export function validateExamQuestionDisciplinas(
  exam: ActivityExamDefinition | null
): string | null {
  if (!exam) return null
  for (const q of exam.questions) {
    const d = q.disciplina?.trim()
    if (!d) return "Defina a disciplina de cada questao no simulado"
  }
  return null
}

export function toPublicExam(exam: ActivityExamDefinition): ActivityExamPublic {
  const questions: ExamQuestionPublic[] = exam.questions.map((q) => {
    if (q.type === "mcq") {
      const { correctIndex: _c, ...rest } = q
      return rest
    }
    return q
  })
  return { version: EXAM_VERSION, questions }
}

export function totalExamPoints(exam: ActivityExamDefinition): number {
  return exam.questions.reduce((s, q) => s + q.points, 0)
}

export function computeMcqScore(
  exam: ActivityExamDefinition,
  answers: StudentExamAnswers
): number {
  let score = 0
  for (const q of exam.questions) {
    if (q.type !== "mcq") continue
    const a = answers[q.id]
    if (!a || a.type !== "mcq") continue
    if (a.choiceIndex === q.correctIndex) score += q.points
  }
  return score
}

export function sumOpenScores(
  exam: ActivityExamDefinition,
  openScores: Record<string, number>
): number {
  let s = 0
  for (const q of exam.questions) {
    if (q.type !== "open") continue
    const v = openScores[q.id]
    if (typeof v === "number" && !Number.isNaN(v) && v >= 0) s += v
  }
  return s
}

/** Quantidade de questões abertas ainda sem nota atribuída (correção manual pendente). */
export function ungradedOpenCount(
  exam: ActivityExamDefinition,
  openScores: Record<string, number>
): number {
  let n = 0
  for (const q of exam.questions) {
    if (q.type !== "open") continue
    const v = openScores[q.id]
    if (typeof v !== "number" || Number.isNaN(v)) n++
  }
  return n
}

export function sanitizeOpenText(text: string): string {
  const t = text.trim().slice(0, EXAM_OPEN_TEXT_MAX)
  return t.replace(/\u0000/g, "")
}

export function validateAnswersForSubmit(
  exam: ActivityExamDefinition,
  answers: StudentExamAnswers
): string | null {
  for (const q of exam.questions) {
    const a = answers[q.id]
    if (!a) return "Responda todas as questoes"
    if (a.type !== q.type) return "Tipo de resposta invalido"
    if (q.type === "mcq") {
      if (a.type !== "mcq") return "Resposta invalida"
      if (
        !Number.isInteger(a.choiceIndex) ||
        a.choiceIndex < 0 ||
        a.choiceIndex >= q.options.length
      ) {
        return "Opcao invalida em questao de multipla escolha"
      }
    } else {
      if (a.type !== "open") return "Resposta invalida"
      const t = sanitizeOpenText(a.text)
      if (!t.length) return "Questoes abertas nao podem ficar vazias"
    }
  }
  return null
}

export function newQuestionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

export function mergeActivitySettings(
  current: Record<string, unknown> | undefined,
  patch: {
    attachments?: ActivityAttachment[]
    exam?: ActivityExamDefinition | null
    /** Configuração de entrega de trabalho (settings.submission); null remove. */
    submission?: { mode: string; maxFiles: number } | null
  }
): Record<string, unknown> {
  const base: Record<string, unknown> = { ...(current ?? {}) }
  if (patch.attachments !== undefined) {
    base.attachments = patch.attachments
  }
  if (patch.exam !== undefined) {
    if (
      patch.exam === null ||
      !patch.exam.questions ||
      patch.exam.questions.length === 0
    ) {
      delete base.exam
    } else {
      base.exam = patch.exam
      // Exclusividade: uma atividade com exame não tem entrega de trabalho.
      delete base.submission
    }
  }
  if (patch.submission !== undefined) {
    if (patch.submission === null) {
      delete base.submission
    } else {
      base.submission = patch.submission
      // Exclusividade: uma atividade com entrega de trabalho não tem exame.
      delete base.exam
    }
  }
  return base
}
