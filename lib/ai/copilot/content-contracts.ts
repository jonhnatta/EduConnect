import { z } from "zod"

const boundedText = (max: number) => z.string().trim().min(1).max(max)
const optionalBoundedText = (max: number) => z.string().trim().max(max).default("")
const sourceIdsSchema = z.array(z.string().uuid()).max(20).default([])

const contentCitationBaseSchema = z.object({
  id: boundedText(160),
  title: boundedText(300),
  retrievedAt: z.string().trim().max(64).datetime(),
  excerpt: boundedText(2_000),
})

export const contentCitationSchema = z.discriminatedUnion("kind", [
  contentCitationBaseSchema.extend({
    kind: z.literal("internal"),
    url: z.string().trim().min(1).max(2_048).regex(/^\/(?!\/)[^\s\\]*$/, "Internal citation URL must be a same-origin path"),
  }).strict(),
  contentCitationBaseSchema.extend({
    kind: z.literal("web"),
    url: z.string().trim().min(1).max(2_048).url().startsWith("https://"),
  }).strict(),
])

export const contentUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().max(2_000_000),
  outputTokens: z.number().int().nonnegative().max(200_000),
}).strict()

export const contentSafetySchema = z.object({
  decision: z.enum([
    "approved",
    "approved_with_warning",
    "regenerate",
    "abstain",
    "blocked",
    "human_review_required",
  ]),
  policyVersion: boundedText(100),
  reasonCode: z.string().trim().min(1).max(100).optional(),
}).strict()

export const contentModuleSchema = z.enum([
  "article",
  "exercise",
  "assessment",
  "simulado",
  "tip",
  "review",
  "performance",
  "classroom",
])

export const contentGenerationModuleSchema = contentModuleSchema.exclude([
  "review",
])

export const editableContentModuleSchema = z.enum([
  "article",
  "exercise",
  "assessment",
  "simulado",
  "tip",
])

const sourceBoundRequestSchema = z.object({
  topic: boundedText(240),
  audience: optionalBoundedText(160),
  objective: boundedText(500),
  sourceIds: sourceIdsSchema,
})

const questionBaseSchema = z.object({
  id: boundedText(120),
  order: z.number().int().min(1).max(40),
  prompt: boundedText(4_000),
  points: z.number().positive().max(1_000),
  disciplina: z.string().trim().min(1).max(120).optional(),
})

export const teacherQuestionSchema = z.discriminatedUnion("type", [
  questionBaseSchema.extend({
    type: z.literal("mcq"),
    options: z.array(boundedText(1_000)).min(2).max(10),
    teacherAnswer: z.object({
      correctIndex: z.number().int().nonnegative().max(9),
      rationale: boundedText(2_000),
    }).strict(),
  }).strict(),
  questionBaseSchema.extend({
    type: z.literal("open"),
    teacherAnswer: z.object({
      referenceAnswer: boundedText(8_000),
      rubric: z.array(boundedText(1_000)).min(1).max(10),
    }).strict(),
  }).strict(),
]).superRefine((question, context) => {
  if (question.type === "mcq" && question.teacherAnswer.correctIndex >= question.options.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["teacherAnswer", "correctIndex"],
      message: "Correct answer must reference an available option",
    })
  }
})

export const studentQuestionSchema = z.discriminatedUnion("type", [
  questionBaseSchema.extend({
    type: z.literal("mcq"),
    options: z.array(boundedText(1_000)).min(2).max(10),
  }).strict(),
  questionBaseSchema.extend({
    type: z.literal("open"),
  }).strict(),
])

const teacherDocumentDraftSchema = z.object({
  module: z.enum(["article", "tip"]),
  title: boundedText(240),
  bodyHtml: boundedText(30_000),
}).strict()

const teacherAssessmentDraftSchema = z.object({
  module: z.enum(["exercise", "assessment", "simulado"]),
  title: boundedText(240),
  instructions: boundedText(4_000),
  questions: z.array(teacherQuestionSchema).min(1).max(40),
}).strict().superRefine((draft, context) => {
  const ids = new Set<string>()
  const orders = new Set<number>()
  for (const [index, question] of draft.questions.entries()) {
    if (ids.has(question.id)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["questions", index, "id"], message: "Question ids must be unique" })
    }
    if (orders.has(question.order)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["questions", index, "order"], message: "Question orders must be unique" })
    }
    ids.add(question.id)
    orders.add(question.order)
    if (draft.module === "simulado" && !question.disciplina) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["questions", index, "disciplina"], message: "Simulado questions require disciplina" })
    }
  }
})

export const teacherContentDraftSchema = z.union([
  teacherDocumentDraftSchema,
  teacherAssessmentDraftSchema,
])

const studentDocumentDraftSchema = z.object({
  module: z.enum(["article", "tip"]),
  title: boundedText(240),
  bodyHtml: boundedText(30_000),
}).strict()

const studentAssessmentDraftSchema = z.object({
  module: z.enum(["exercise", "assessment", "simulado"]),
  title: boundedText(240),
  instructions: boundedText(4_000),
  questions: z.array(studentQuestionSchema).min(1).max(40),
}).strict()

export const studentContentDraftSchema = z.union([
  studentDocumentDraftSchema,
  studentAssessmentDraftSchema,
])

export function toStudentContentDraft(input: unknown): StudentContentDraft {
  const draft = teacherContentDraftSchema.parse(input)
  if (!("questions" in draft)) return studentContentDraftSchema.parse(draft)

  return studentContentDraftSchema.parse({
    ...draft,
    questions: draft.questions.map((question) => {
      const { teacherAnswer: _teacherAnswer, ...studentQuestion } = question
      return studentQuestion
    }),
  })
}

const articleGenerationSchema = sourceBoundRequestSchema.extend({
  module: z.literal("article"),
}).strict()

const assessmentGenerationSchema = sourceBoundRequestSchema.extend({
  module: z.enum(["exercise", "assessment", "simulado"]),
  questionCount: z.number().int().min(1).max(40),
}).strict()

const tipGenerationSchema = sourceBoundRequestSchema.extend({
  module: z.literal("tip"),
}).strict()

const performanceGenerationSchema = z.object({
  module: z.literal("performance"),
  classroomId: z.string().uuid(),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  objective: boundedText(500),
}).strict().superRefine((input, context) => {
  if (input.periodStart > input.periodEnd) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["periodEnd"], message: "Period end must not precede period start" })
  }
})

const classroomGenerationSchema = sourceBoundRequestSchema.extend({
  module: z.literal("classroom"),
  classroomId: z.string().uuid(),
}).strict()

export const contentGenerationInputSchema = z.union([
  articleGenerationSchema,
  assessmentGenerationSchema,
  tipGenerationSchema,
  performanceGenerationSchema,
  classroomGenerationSchema,
])

export const contentReviewInputSchema = z.object({
  module: z.literal("review"),
  targetModule: editableContentModuleSchema,
  objective: boundedText(500),
  notes: optionalBoundedText(2_000),
  sourceIds: sourceIdsSchema,
  originalContent: teacherContentDraftSchema,
}).strict().superRefine((input, context) => {
  if (input.originalContent.module !== input.targetModule) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["originalContent", "module"],
      message: "Original content must match the target module",
    })
  }
})

const performanceDraftSchema = z.object({
  module: z.literal("performance"),
  overview: boundedText(4_000),
  findings: z.array(boundedText(1_000)).min(1).max(12),
  recommendations: z.array(boundedText(1_000)).min(1).max(12),
}).strict()

const classroomDraftSchema = z.object({
  module: z.literal("classroom"),
  title: boundedText(240),
  activity: boundedText(8_000),
  rationale: boundedText(2_000),
}).strict()

export const contentProposalDraftSchema = z.union([
  teacherContentDraftSchema,
  performanceDraftSchema,
  classroomDraftSchema,
])

export const contentProposalSchema = z.object({
  module: contentModuleSchema,
  mode: z.enum(["generate", "review"]),
  draft: contentProposalDraftSchema.nullable(),
  changeSummary: boundedText(1_200),
  warnings: z.array(boundedText(500)).max(12),
  citations: z.array(contentCitationSchema).max(20),
  model: boundedText(160),
  usage: contentUsageSchema,
  safety: contentSafetySchema,
}).strict().superRefine((proposal, context) => {
  const requiresCitation = proposal.safety.decision === "approved" || proposal.safety.decision === "approved_with_warning"
  if (requiresCitation && proposal.citations.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["citations"], message: "Approved proposals require at least one citation" })
  }
  if (requiresCitation && proposal.draft === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["draft"], message: "Approved proposals require a generated draft" })
  }
  if (!requiresCitation && proposal.draft !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["draft"], message: "Non-approved proposals must not expose a factual draft" })
  }
  if (proposal.mode === "generate" && proposal.draft !== null && proposal.module !== proposal.draft.module) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["draft", "module"], message: "Generated proposal draft must match its module" })
  }
  if (proposal.mode === "review" && proposal.module !== "review") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["module"], message: "Review proposals must use the review module" })
  }
})

export type ContentModule = z.infer<typeof contentModuleSchema>
export type ContentGenerationInput = z.infer<typeof contentGenerationInputSchema>
export type ContentReviewInput = z.infer<typeof contentReviewInputSchema>
export type TeacherQuestion = z.infer<typeof teacherQuestionSchema>
export type StudentQuestion = z.infer<typeof studentQuestionSchema>
export type TeacherContentDraft = z.infer<typeof teacherContentDraftSchema>
export type StudentContentDraft = z.infer<typeof studentContentDraftSchema>
export type ContentProposal = z.infer<typeof contentProposalSchema>
