import { sanitizeActivityHtml } from "../../sanitize-activity-html.ts"
import type { Citation } from "../contracts.ts"
import { NoopTelemetry, type Telemetry } from "../telemetry/langfuse.ts"
import {
  areCitationsAuthorized,
  contentCitationSchema,
  contentGenerationInputSchema,
  contentProposalSchema,
  contentReviewInputSchema,
  type ContentCitation,
  type ContentGenerationInput,
  type ContentProposal,
  type ContentReviewInput,
  type TeacherContentDraft,
} from "./content-contracts.ts"
import {
  CONTENT_PROMPT_VERSION,
  buildContentGenerationPrompt,
  buildContentReviewPrompt,
} from "./content-prompts.ts"
import { evaluateCopilotInput } from "./guardrail.ts"
import { CopilotServiceError, type CopilotQuota } from "./service.ts"
import type {
  CopilotActor,
  CopilotCitation,
  CopilotContextRequest,
  CopilotRun,
  CopilotSafetyAudit,
} from "./types.ts"

const CONTENT_FEATURE = "teacher_content_copilot"
const CONTENT_RESERVED_TOKENS = 40_000
const CONTENT_MAX_OUTPUT_TOKENS = 4_000
const BLOCKED_SUMMARY = "Não foi possível gerar uma proposta segura com o contexto autorizado."
const INDIVIDUAL_DIAGNOSIS_PATTERNS = [
  /\b(?:desempenho|performance)\s+(?:individual|por\s+alun[oa]|de\s+(?:um[ae]?\s+)?(?:alun[oa]|estudante|student))\b/i,
  /\b(?:avaliar|analisar|diagnosticar|diagn[oó]stico)\b[\s\S]{0,80}\b(?:desempenho|performance)\b[\s\S]{0,80}\b(?:individual|por\s+alun[oa]|de\s+[A-ZÀ-ÖØ-Þ][\p{L}'’-]{1,}(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’-]{1,}){0,3})\b/iu,
  /\b(?:cpf|e-?mail)\b/i,
]

export class ContentServiceError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = "ContentServiceError"
    this.code = code
  }
}

export type ContentProvider = {
  readonly name: string
  readonly model: string
  generate(input: {
    system: string
    user: string
    maxOutputTokens: number
    authorizedEvidence: readonly ContentCitation[]
  }): Promise<unknown>
}

export type ContentContextRequest = CopilotContextRequest & {
  sourceIds: readonly string[]
}

export type ContentServiceRepository = {
  ownsContent(input: { teacherId: string; contentIds: readonly string[] }): Promise<boolean>
  ownsClassroom(input: { teacherId: string; classroomId: string }): Promise<boolean>
  getPerformanceSummary(input: {
    teacherId: string
    classroomId: string
    periodStart: string
    periodEnd: string
  }): Promise<Record<string, number | null> | null>
  recordRun(input: CopilotRun): Promise<void>
}

export type ContentServiceDependencies = {
  repository: ContentServiceRepository
  quota: CopilotQuota
  provider: ContentProvider
  retrieveContext: (input: ContentContextRequest) => Promise<readonly CopilotCitation[]>
  telemetry?: Telemetry
}

function requireProfessor(actor: CopilotActor | null | undefined): CopilotActor {
  if (!actor || actor.userType !== "professor" || actor.userId.trim() === "") {
    throw new ContentServiceError("professor_required")
  }
  return actor
}

function isApproved(proposal: ContentProposal): boolean {
  return proposal.safety.decision === "approved" || proposal.safety.decision === "approved_with_warning"
}

function toAuditSafety(safety: ContentProposal["safety"]): CopilotSafetyAudit {
  return safety.reasonCode === null
    ? { decision: safety.decision, policyVersion: safety.policyVersion }
    : { decision: safety.decision, policyVersion: safety.policyVersion, reasonCode: safety.reasonCode }
}

function safeUsage(value: unknown): { inputTokens: number; outputTokens: number } {
  if (!value || typeof value !== "object") return { inputTokens: 0, outputTokens: 0 }
  const usage = value as Record<string, unknown>
  const inputTokens = typeof usage.inputTokens === "number" && Number.isInteger(usage.inputTokens) && usage.inputTokens >= 0
    ? usage.inputTokens : 0
  const outputTokens = typeof usage.outputTokens === "number" && Number.isInteger(usage.outputTokens) && usage.outputTokens >= 0
    ? usage.outputTokens : 0
  return { inputTokens, outputTokens }
}

function boundedSettlementUsage(value: unknown, reservedTokens: number) {
  const usage = safeUsage(value)
  return usage.inputTokens + usage.outputTokens <= reservedTokens
    ? usage
    : { inputTokens: reservedTokens, outputTokens: 0 }
}

function usageExceedsReservation(usage: { inputTokens: number; outputTokens: number }, reservedTokens: number): boolean {
  return usage.inputTokens + usage.outputTokens > reservedTokens
}

function sanitizeText(value: string): string {
  return value
    .replace(/<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function sanitizeDraft(draft: ContentProposal["draft"]): ContentProposal["draft"] {
  if (!draft) return null
  if (draft.module === "article" || draft.module === "tip") {
    return {
      ...draft,
      title: sanitizeText(draft.title),
      bodyHtml: sanitizeActivityHtml(draft.bodyHtml),
    }
  }
  if (draft.module === "exercise" || draft.module === "assessment" || draft.module === "simulado") {
    return {
      ...draft,
      title: sanitizeText(draft.title),
      instructions: sanitizeText(draft.instructions),
      questions: draft.questions.map((question) => question.type === "mcq"
        ? {
            ...question,
            prompt: sanitizeText(question.prompt),
            options: question.options.map(sanitizeText),
            disciplina: question.disciplina ? sanitizeText(question.disciplina) : null,
            teacherAnswer: {
              ...question.teacherAnswer,
              rationale: sanitizeText(question.teacherAnswer.rationale),
            },
          }
        : {
            ...question,
            prompt: sanitizeText(question.prompt),
            disciplina: question.disciplina ? sanitizeText(question.disciplina) : null,
            teacherAnswer: {
              referenceAnswer: sanitizeText(question.teacherAnswer.referenceAnswer),
              rubric: question.teacherAnswer.rubric.map(sanitizeText),
            },
          }),
    }
  }
  if (draft.module === "performance") {
    return {
      ...draft,
      overview: sanitizeText(draft.overview),
      findings: draft.findings.map(sanitizeText),
      recommendations: draft.recommendations.map(sanitizeText),
    }
  }
  if (draft.module === "classroom") {
    return {
      ...draft,
      title: sanitizeText(draft.title),
      activity: sanitizeText(draft.activity),
      rationale: sanitizeText(draft.rationale),
    }
  }
  return draft
}

function normalizedEvidence(
  evidence: readonly CopilotCitation[],
  requestedSourceIds: readonly string[]
): ContentCitation[] {
  const requested = new Set(requestedSourceIds)
  const seen = new Set<string>()
  return evidence.flatMap((item) => {
    const contentSourceId = item.contentSourceId ?? item.sourceId
    if (requested.size > 0 && !requested.has(contentSourceId)) return []
    if (seen.has(item.sourceId)) return []
    const citation = {
      kind: item.sourceKind,
      id: item.sourceId.trim(),
      title: item.title.trim(),
      url: item.url.trim(),
      retrievedAt: item.retrievedAt.trim(),
      excerpt: item.excerpt.trim(),
    }
    const parsed = contentCitationSchema.safeParse(citation)
    if (!parsed.success) return []
    seen.add(item.sourceId)
    return [parsed.data]
  })
}

function blockedProposal(input: {
  module: ContentProposal["module"]
  mode: ContentProposal["mode"]
  model: string
  safety: ContentProposal["safety"]
  usage?: { inputTokens: number; outputTokens: number }
}): ContentProposal {
  return contentProposalSchema.parse({
    module: input.module,
    mode: input.mode,
    draft: null,
    changeSummary: BLOCKED_SUMMARY,
    warnings: ["Revise o pedido e os materiais autorizados antes de tentar novamente."],
    citations: [],
    model: input.model,
    usage: input.usage ?? { inputTokens: 0, outputTokens: 0 },
    safety: input.safety,
  })
}

function promptText(input: ContentGenerationInput | ContentReviewInput): string {
  if (input.module === "review") return [input.objective, input.notes, input.originalContent.title].join("\n")
  if (input.module === "performance") return input.objective
  return [input.topic, input.audience, input.objective].join("\n")
}

function guardrailText(input: ContentGenerationInput | ContentReviewInput): string {
  return JSON.stringify(input)
}

function assertAggregatePerformanceObjective(input: ContentGenerationInput) {
  if (input.module === "performance" && INDIVIDUAL_DIAGNOSIS_PATTERNS.some((pattern) => pattern.test(input.objective))) {
    throw new ContentServiceError("individual_diagnosis_not_allowed")
  }
}

function providerInput(input: {
  request: ContentGenerationInput | ContentReviewInput
  evidence: readonly ContentCitation[]
  performanceSummary?: Record<string, number | null>
}) {
  const basePrompt = input.request.module === "review"
    ? buildContentReviewPrompt({ input: input.request, evidence: input.evidence })
    : buildContentGenerationPrompt({ input: input.request, evidence: input.evidence })
  const aggregate = input.performanceSummary
    ? `\nDados agregados autorizados: ${JSON.stringify(input.performanceSummary)}`
    : ""
  return { system: basePrompt.system, user: `${basePrompt.user}${aggregate}` }
}

export function createContentService({
  repository,
  quota,
  provider,
  retrieveContext,
  telemetry = new NoopTelemetry(),
}: ContentServiceDependencies) {
  const providerName = provider.name.trim()
  const providerModel = provider.model.trim()
  if (!providerName || !providerModel) throw new TypeError("Content provider audit metadata is required")

  async function execute(input: {
    actor: CopilotActor | null | undefined
    request: ContentGenerationInput | ContentReviewInput
  }): Promise<ContentProposal> {
    const actor = requireProfessor(input.actor)
    const request = input.request
    assertAggregatePerformanceObjective(request as ContentGenerationInput)
    const access = await quota.checkAccess({ teacherId: actor.userId })
    if (!access.ok) throw new ContentServiceError(access.code)

    const sourceIds = request.module === "performance" ? [] : request.sourceIds
    if (sourceIds.length > 0 && !await repository.ownsContent({ teacherId: actor.userId, contentIds: sourceIds })) {
      throw new ContentServiceError("content_not_found")
    }
    const classroomId = request.module === "performance" || request.module === "classroom"
      ? request.classroomId
      : null
    if (classroomId && !await repository.ownsClassroom({ teacherId: actor.userId, classroomId })) {
      throw new ContentServiceError("classroom_not_found")
    }

    const mode = request.module === "review" ? "review" as const : "generate" as const
    const inputGuardrail = evaluateCopilotInput(guardrailText(request))
    if (!inputGuardrail.ok) {
      const proposal = blockedProposal({
        module: request.module,
        mode,
        model: providerModel,
        safety: { ...inputGuardrail.safety, reasonCode: inputGuardrail.safety.reasonCode ?? null },
      })
      await repository.recordRun({
        teacherId: actor.userId, conversationId: "", messageId: null, feature: CONTENT_FEATURE,
        provider: providerName, model: providerModel, promptVersion: CONTENT_PROMPT_VERSION,
        correlationId: crypto.randomUUID(), latencyMs: 0, safety: toAuditSafety(proposal.safety),
        status: "blocked", inputTokens: 0, outputTokens: 0, errorCode: "prompt_injection",
      })
      return proposal
    }

    const reservation = await quota.reserve({ teacherId: actor.userId, estimatedTokens: CONTENT_RESERVED_TOKENS })
    if (!reservation.ok) throw new ContentServiceError(reservation.code)
    const startedAt = Date.now()
    const correlationId = crypto.randomUUID()
    let settlementUsage = { inputTokens: 0, outputTokens: 0 }
    let lastSafety: CopilotSafetyAudit = { decision: "blocked", policyVersion: CONTENT_PROMPT_VERSION, reasonCode: "generation_failed" }
    let failureCode = "generation_failed"
    const audit = async (proposal: ContentProposal, status: CopilotRun["status"], errorCode: string | null) => {
      await repository.recordRun({
        teacherId: actor.userId, conversationId: "", messageId: null, feature: CONTENT_FEATURE,
        provider: providerName, model: providerModel, promptVersion: CONTENT_PROMPT_VERSION,
        correlationId, latencyMs: Math.max(0, Date.now() - startedAt), safety: toAuditSafety(proposal.safety),
        status, inputTokens: proposal.usage.inputTokens, outputTokens: proposal.usage.outputTokens, errorCode,
      })
    }

    try {
      return await telemetry.trace({
        name: "content_copilot.execution",
        metadata: { teacherId: actor.userId, classroomId, correlationId, provider: providerName, model: providerModel },
      }, async () => {
        const allowedClassroomIds = classroomId ? [classroomId] : []
        const [rawEvidence, performanceSummary] = await Promise.all([
          retrieveContext({
            teacherId: actor.userId,
            query: promptText(request),
            classroomId,
            allowedClassroomIds,
            sourceIds,
          }),
          request.module === "performance"
            ? repository.getPerformanceSummary({ teacherId: actor.userId, classroomId: request.classroomId, periodStart: request.periodStart, periodEnd: request.periodEnd })
            : Promise.resolve(undefined),
        ])
        const evidence = normalizedEvidence(rawEvidence, sourceIds)
        if (request.module === "performance" && !performanceSummary) throw new ContentServiceError("classroom_not_found")
        if (evidence.length === 0) {
          const proposal = blockedProposal({
            module: request.module, mode, model: providerModel,
            safety: { decision: "abstain", policyVersion: CONTENT_PROMPT_VERSION, reasonCode: "insufficient_context" },
          })
          lastSafety = toAuditSafety(proposal.safety)
          await audit(proposal, "blocked", "insufficient_context")
          return proposal
        }
        failureCode = "provider_failed"
        settlementUsage = { inputTokens: reservation.reservedTokens, outputTokens: 0 }
        const prompt = providerInput({ request, evidence, performanceSummary: performanceSummary ?? undefined })
        const rawProposal = await telemetry.wrap({
          name: "content_copilot.generate",
          metadata: { teacherId: actor.userId, classroomId, correlationId, provider: providerName, model: providerModel },
        }, () => provider.generate({ ...prompt, maxOutputTokens: CONTENT_MAX_OUTPUT_TOKENS, authorizedEvidence: evidence }))
        const reportedUsage = safeUsage(
          rawProposal && typeof rawProposal === "object" ? (rawProposal as { usage?: unknown }).usage : undefined,
        )
        settlementUsage = boundedSettlementUsage(reportedUsage, reservation.reservedTokens)
        const parsed = contentProposalSchema.safeParse(rawProposal)
        if (!parsed.success) {
          const proposal = blockedProposal({
            module: request.module, mode, model: providerModel, usage: settlementUsage,
            safety: { decision: "blocked", policyVersion: CONTENT_PROMPT_VERSION, reasonCode: "invalid_provider_output" },
          })
          lastSafety = toAuditSafety(proposal.safety)
          await audit(proposal, "blocked", "invalid_provider_output")
          return proposal
        }
        const output = parsed.data
        if (usageExceedsReservation(reportedUsage, reservation.reservedTokens)) {
          const proposal = blockedProposal({
            module: request.module, mode, model: providerModel, usage: reportedUsage,
            safety: { decision: "blocked", policyVersion: CONTENT_PROMPT_VERSION, reasonCode: "usage_exceeds_reservation" },
          })
          lastSafety = toAuditSafety(proposal.safety)
          await audit(proposal, "blocked", "usage_exceeds_reservation")
          return proposal
        }
        if (reportedUsage.outputTokens > CONTENT_MAX_OUTPUT_TOKENS) {
          const proposal = blockedProposal({
            module: request.module, mode, model: providerModel, usage: reportedUsage,
            safety: { decision: "blocked", policyVersion: CONTENT_PROMPT_VERSION, reasonCode: "output_token_limit_exceeded" },
          })
          lastSafety = toAuditSafety(proposal.safety)
          await audit(proposal, "blocked", "output_token_limit_exceeded")
          return proposal
        }
        const mismatchedReviewDraft = request.module === "review" && output.draft !== null && output.draft.module !== request.targetModule
        if (mismatchedReviewDraft) {
          const proposal = blockedProposal({
            module: request.module, mode, model: providerModel, usage: reportedUsage,
            safety: { decision: "blocked", policyVersion: CONTENT_PROMPT_VERSION, reasonCode: "invalid_provider_output" },
          })
          lastSafety = toAuditSafety(proposal.safety)
          await audit(proposal, "blocked", "invalid_provider_output")
          return proposal
        }
        if (output.module !== request.module || output.mode !== mode || !areCitationsAuthorized(output.citations, evidence)) {
          const proposal = blockedProposal({
            module: request.module, mode, model: providerModel, usage: reportedUsage,
            safety: { decision: "blocked", policyVersion: CONTENT_PROMPT_VERSION, reasonCode: "unauthorized_citations" },
          })
          lastSafety = toAuditSafety(proposal.safety)
          await audit(proposal, "blocked", "unauthorized_citations")
          return proposal
        }
        const proposal = contentProposalSchema.safeParse({
          ...output,
          model: providerModel,
          usage: reportedUsage,
          draft: sanitizeDraft(output.draft),
          changeSummary: sanitizeText(output.changeSummary),
          warnings: output.warnings.map(sanitizeText),
        })
        if (!proposal.success) {
          const blocked = blockedProposal({
            module: request.module, mode, model: providerModel, usage: reportedUsage,
            safety: { decision: "blocked", policyVersion: CONTENT_PROMPT_VERSION, reasonCode: "invalid_provider_output" },
          })
          lastSafety = toAuditSafety(blocked.safety)
          await audit(blocked, "blocked", "invalid_provider_output")
          return blocked
        }
        lastSafety = toAuditSafety(proposal.data.safety)
        const status = isApproved(proposal.data) ? "completed" : "blocked"
        await audit(proposal.data, status, status === "completed" ? null : proposal.data.safety.reasonCode ?? proposal.data.safety.decision)
        return proposal.data
      })
    } catch (error) {
      await repository.recordRun({
        teacherId: actor.userId, conversationId: "", messageId: null, feature: CONTENT_FEATURE,
        provider: providerName, model: providerModel, promptVersion: CONTENT_PROMPT_VERSION,
        correlationId, latencyMs: Math.max(0, Date.now() - startedAt), safety: lastSafety,
        status: "failed", inputTokens: settlementUsage.inputTokens, outputTokens: settlementUsage.outputTokens,
        errorCode: error instanceof ContentServiceError ? error.code : failureCode,
      })
      throw error
    } finally {
      await quota.settle({
        teacherId: actor.userId, reservedTokens: reservation.reservedTokens, usageDate: reservation.usageDate, ...settlementUsage,
      })
    }
  }

  return {
    generateContent(input: { actor: CopilotActor | null | undefined; request: unknown }) {
      return execute({ actor: input.actor, request: contentGenerationInputSchema.parse(input.request) })
    },
    reviewContent(input: { actor: CopilotActor | null | undefined; request: unknown }) {
      return execute({ actor: input.actor, request: contentReviewInputSchema.parse(input.request) })
    },
  }
}

export type { Citation, TeacherContentDraft }
