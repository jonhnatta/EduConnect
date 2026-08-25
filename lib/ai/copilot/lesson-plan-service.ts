import { createHash } from "node:crypto"
import { sanitizeActivityHtml } from "../../sanitize-activity-html.ts"
import type { Citation } from "../contracts.ts"
import { copilotResponseSchema, usageSchema } from "../contracts.ts"
import { NoopTelemetry, type Telemetry } from "../telemetry/langfuse.ts"
import { evaluateCopilotInput } from "./guardrail.ts"
import {
  lessonPlanDraftSchema,
  lessonPlanInputSchema,
  lessonPlanProposalSchema,
  type LessonPlanDraft,
  type LessonPlanInput,
  type LessonPlanProposal,
  type LessonPlanStatus,
} from "./lesson-plan.ts"
import {
  CopilotServiceError,
  type CopilotQuota,
  type CopilotRepository,
} from "./service.ts"
import type {
  CopilotActor,
  CopilotCitation,
  CopilotContextRequest,
  CopilotProvider,
  CopilotRun,
  CopilotSafetyAudit,
} from "./types.ts"

const PROPOSAL_ID_PLACEHOLDER = "00000000-0000-4000-8000-000000000000"
const LESSON_PLAN_FEATURE = "teacher_lesson_plan"
const LESSON_PLAN_PROMPT_VERSION = "lesson-plan-v1"
const LESSON_PLAN_RESERVED_TOKENS = 40_000
const LESSON_PLAN_MAX_OUTPUT_TOKENS = 4_000
const LESSON_PLAN_SYSTEM_PROMPT = [
  "Voce e o Copilot do Professor e deve criar um plano de aula estruturado.",
  "Use somente o contexto interno autorizado.",
  "Retorne JSON valido no contrato solicitado e cite ao menos uma fonte interna autorizada.",
].join(" ")

export type LessonPlanProposalPayload = Pick<
  LessonPlanProposal,
  "draft" | "citations" | "model" | "usage" | "safety"
>

export type StoredLessonPlanProposal = LessonPlanProposal & {
  teacherId: string
  payloadHash: string
  idempotencyKey: string
  createdAt: string
  updatedAt: string
}

export type LessonPlanContentDraft = {
  title: string
  bodyHtml: string
  status: "draft"
  visibility: "private"
  settings: {
    source: "copilot"
    conversationId: string
    proposalId: string
    model: string
    citations: LessonPlanDraft["citations"]
    lessonPlan: LessonPlanDraft
  }
}

export type LessonPlanSavedContentItem = {
  id: string
  authorId: string
  title: string
  bodyHtml: string
  status: string
  visibility: string
  settings: Record<string, unknown>
}

export type LessonPlanSaveDraftResult = {
  proposal: StoredLessonPlanProposal
  contentItem: LessonPlanSavedContentItem
}

export type LessonPlanProposalRepository = {
  createProposal(input: {
    teacherId: string
    conversationId: string
    status: LessonPlanStatus
    payload: LessonPlanProposalPayload
    payloadHash: string
    idempotencyKey: string
    safetyDecision: string
    model: string
  }): Promise<StoredLessonPlanProposal>
  getProposal(input: {
    teacherId: string
    proposalId: string
  }): Promise<StoredLessonPlanProposal | null>
  rejectProposal(input: {
    teacherId: string
    proposalId: string
  }): Promise<StoredLessonPlanProposal | null>
  saveDraft(input: {
    teacherId: string
    proposalId: string
    contentDraft: LessonPlanContentDraft
  }): Promise<LessonPlanSaveDraftResult | null>
}

export type LessonPlanContextRequest = CopilotContextRequest & {
  contentIds: readonly string[]
}

export type LessonPlanContextRetriever = (
  input: LessonPlanContextRequest
) => Promise<readonly CopilotCitation[]>

type LessonPlanCopilotRepository = Pick<
  CopilotRepository,
  | "getConversation"
  | "listMessages"
  | "listAllowedClassroomIds"
  | "recordRun"
>

export type LessonPlanGenerationDependencies = {
  copilotRepository?: LessonPlanCopilotRepository
  quota?: CopilotQuota
  provider?: CopilotProvider
  retrieveContext?: LessonPlanContextRetriever
  telemetry?: Telemetry
}

export class LessonPlanServiceError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = "LessonPlanServiceError"
    this.code = code
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`
  }
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>
    return `{${Object.keys(objectValue)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex")
}

function canonicalPayload(
  payload: LessonPlanProposalPayload,
  status: LessonPlanStatus
): LessonPlanProposalPayload {
  const parsedDraft = lessonPlanDraftSchema.safeParse(payload.draft)
  if (!parsedDraft.success) {
    throw new LessonPlanServiceError("invalid_lesson_plan_proposal")
  }

  const proposal = lessonPlanProposalSchema.safeParse({
    id: PROPOSAL_ID_PLACEHOLDER,
    conversationId: PROPOSAL_ID_PLACEHOLDER,
    status,
    draft: parsedDraft.data,
    citations: payload.citations,
    model: payload.model,
    usage: payload.usage,
    safety: payload.safety,
    contentItemId: null,
  })
  if (!proposal.success) {
    throw new LessonPlanServiceError("invalid_lesson_plan_proposal")
  }

  const canonical = stableStringify(proposal.data.citations) === stableStringify(proposal.data.draft.citations)
  if (!canonical) {
    throw new LessonPlanServiceError("invalid_lesson_plan_proposal")
  }

  return {
    draft: proposal.data.draft,
    citations: proposal.data.citations,
    model: proposal.data.model,
    usage: proposal.data.usage,
    safety: proposal.data.safety,
  }
}

function proposalCreationHash(input: {
  conversationId: string
  status: LessonPlanStatus
  payload: LessonPlanProposalPayload
}) {
  return stableHash({
    conversationId: input.conversationId,
    status: input.status,
    payload: input.payload,
  })
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function sanitizeGeneratedText(value: string): string {
  return value
    .replace(/<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function sanitizeGeneratedDraft(value: unknown): LessonPlanDraft | null {
  const parsed = lessonPlanDraftSchema.safeParse(value)
  if (!parsed.success) return null

  const sanitized = {
    ...parsed.data,
    title: sanitizeGeneratedText(parsed.data.title),
    objectives: parsed.data.objectives.map(sanitizeGeneratedText),
    prerequisites: parsed.data.prerequisites.map(sanitizeGeneratedText),
    steps: parsed.data.steps.map((step) => ({
      ...step,
      title: sanitizeGeneratedText(step.title),
      description: sanitizeGeneratedText(step.description),
    })),
    materials: parsed.data.materials.map(sanitizeGeneratedText),
    activity: sanitizeGeneratedText(parsed.data.activity),
    assessment: sanitizeGeneratedText(parsed.data.assessment),
    adaptations: parsed.data.adaptations.map(sanitizeGeneratedText),
  }

  const validated = lessonPlanDraftSchema.safeParse(sanitized)
  return validated.success ? validated.data : null
}

function safeBlockedDraft(
  input: LessonPlanInput,
  citations: readonly Citation[] = []
): LessonPlanDraft {
  return lessonPlanDraftSchema.parse({
    title: "Plano de aula indisponivel",
    objectives: ["Revisar os materiais autorizados antes de gerar uma nova proposta."],
    prerequisites: [],
    durationMinutes: input.durationMinutes,
    steps: [{
      title: "Revisao necessaria",
      minutes: input.durationMinutes,
      description: "A proposta nao foi gerada com seguranca a partir do contexto disponivel.",
    }],
    materials: [],
    activity: "Revise o pedido e selecione materiais internos autorizados.",
    assessment: "Nenhuma avaliacao foi gerada.",
    adaptations: [],
    citations,
  })
}

function promptText(input: LessonPlanInput): string {
  return [input.topic, input.audience, input.objective, input.notes].join("\n")
}

function providerUserPrompt(input: LessonPlanInput): string {
  return JSON.stringify({
    task: "generate_lesson_plan",
    input,
    output: {
      fields: [
        "title",
        "objectives",
        "prerequisites",
        "durationMinutes",
        "steps",
        "materials",
        "activity",
        "assessment",
        "adaptations",
        "citations",
      ],
    },
  })
}

function normalizedEvidence(
  evidence: readonly CopilotCitation[],
  requestedContentIds: readonly string[]
): CopilotCitation[] {
  const requested = new Set(requestedContentIds)
  const filtered = evidence.filter((citation) => {
    if (citation.sourceKind !== "internal") return false
    if (requested.size > 0 && !requested.has(citation.sourceId)) return false
    return [
      citation.sourceId,
      citation.title,
      citation.excerpt,
      citation.url,
      citation.retrievedAt,
    ].every((value) => value.trim() !== "")
  })

  const seen = new Set<string>()
  return filtered.filter((citation) => {
    if (seen.has(citation.sourceId)) return false
    seen.add(citation.sourceId)
    return true
  })
}

function formatEvidence(evidence: readonly CopilotCitation[]): string {
  return evidence
    .map((citation, index) =>
      `[${index + 1}] ${citation.title}\nFonte: ${citation.sourceId}\n${citation.excerpt}`
    )
    .join("\n\n")
}

function canonicalCitations(
  citations: readonly Citation[],
  evidence: readonly CopilotCitation[]
): Citation[] {
  const authorized = new Map(evidence.map((citation) => [citation.sourceId, citation]))
  const seen = new Set<string>()

  return citations.flatMap((citation) => {
    if (citation.kind !== "internal" || seen.has(citation.id)) return []
    const source = authorized.get(citation.id)
    if (!source || source.sourceKind !== "internal") return []
    seen.add(citation.id)
    return [{
      id: source.sourceId,
      kind: "internal" as const,
      title: source.title,
      excerpt: source.excerpt,
      url: source.url,
      retrievedAt: source.retrievedAt,
    }]
  })
}

function paragraphList(items: readonly string[]): string {
  if (items.length === 0) return ""
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
}

export function lessonPlanDraftToContentDraft(input: {
  conversationId: string
  proposalId: string
  model: string
  draft: LessonPlanDraft
}): LessonPlanContentDraft {
  const draft = sanitizeGeneratedDraft(input.draft)
  if (!draft) throw new LessonPlanServiceError("invalid_lesson_plan_proposal")
  const steps = draft.steps
    .map(
      (step) =>
        `<li><strong>${escapeHtml(step.title)}</strong> (${step.minutes} min): ${escapeHtml(step.description)}</li>`
    )
    .join("")

  const bodyHtml = [
    `<h2>${escapeHtml(draft.title)}</h2>`,
    "<h3>Objetivos</h3>",
    paragraphList(draft.objectives),
    "<h3>Etapas</h3>",
    `<ol>${steps}</ol>`,
    "<h3>Materiais</h3>",
    paragraphList(draft.materials),
    "<h3>Atividade</h3>",
    `<p>${escapeHtml(draft.activity)}</p>`,
    "<h3>Avaliacao</h3>",
    `<p>${escapeHtml(draft.assessment)}</p>`,
    draft.adaptations.length ? "<h3>Adaptacoes</h3>" : "",
    paragraphList(draft.adaptations),
  ].join("")

  return {
    title: draft.title,
    status: "draft",
    visibility: "private",
    bodyHtml: sanitizeActivityHtml(bodyHtml),
    settings: {
      source: "copilot",
      conversationId: input.conversationId,
      proposalId: input.proposalId,
      model: input.model,
      citations: draft.citations,
      lessonPlan: draft,
    },
  }
}

export function createLessonPlanService({
  repository,
  copilotRepository,
  quota,
  provider,
  retrieveContext,
  telemetry = new NoopTelemetry(),
}: {
  repository: LessonPlanProposalRepository
} & LessonPlanGenerationDependencies) {
  async function createProposal(input: {
    teacherId: string
    conversationId: string
    idempotencyKey: string
    payload: LessonPlanProposalPayload
    status?: LessonPlanStatus
  }) {
    const status = input.status ?? "proposed"
    const payload = canonicalPayload(input.payload, status)
    return repository.createProposal({
      teacherId: input.teacherId,
      conversationId: input.conversationId,
      idempotencyKey: input.idempotencyKey,
      status,
      payload,
      payloadHash: proposalCreationHash({
        conversationId: input.conversationId,
        status,
        payload,
      }),
      safetyDecision: payload.safety.decision,
      model: payload.model,
    })
  }

  function requireGenerationDependencies() {
    if (!copilotRepository || !quota || !provider || !retrieveContext) {
      throw new TypeError("Lesson plan generation dependencies are required")
    }
    const providerName = provider.name.trim()
    const providerModel = provider.model.trim()
    if (!providerName || !providerModel) {
      throw new TypeError("Lesson plan provider audit metadata is required")
    }
    return {
      copilotRepository,
      quota,
      provider,
      retrieveContext,
      providerName,
      providerModel,
    }
  }

  return {
    createProposal,

    async generateProposal(input: {
      actor: CopilotActor | null | undefined
      conversationId: string
      idempotencyKey: string
      request: LessonPlanInput
    }) {
      const dependencies = requireGenerationDependencies()
      const actor = input.actor
      if (!actor || actor.userType !== "professor" || actor.userId.trim() === "") {
        throw new CopilotServiceError("professor_required")
      }

      const request = lessonPlanInputSchema.parse(input.request)
      const access = await dependencies.quota.checkAccess({ teacherId: actor.userId })
      if (!access.ok) throw new CopilotServiceError(access.code)

      const conversation = await dependencies.copilotRepository.getConversation(
        actor.userId,
        input.conversationId
      )
      if (!conversation || conversation.status !== "active") {
        throw new CopilotServiceError("conversation_not_found")
      }

      const startedAt = Date.now()
      const correlationId = crypto.randomUUID()
      const audit = async (auditInput: {
        safety: CopilotSafetyAudit
        status: CopilotRun["status"]
        inputTokens: number
        outputTokens: number
        errorCode: string | null
      }) => {
        await dependencies.copilotRepository.recordRun({
          teacherId: actor.userId,
          conversationId: conversation.id,
          messageId: null,
          feature: LESSON_PLAN_FEATURE,
          provider: dependencies.providerName,
          model: dependencies.providerModel,
          promptVersion: LESSON_PLAN_PROMPT_VERSION,
          correlationId,
          latencyMs: Math.max(0, Date.now() - startedAt),
          ...auditInput,
        })
      }

      const persistBlocked = async (blockedInput: {
        safety: CopilotSafetyAudit
        errorCode: string
        usage?: { inputTokens: number; outputTokens: number }
      }) => {
        const usage = blockedInput.usage ?? { inputTokens: 0, outputTokens: 0 }
        const proposal = await createProposal({
          teacherId: actor.userId,
          conversationId: conversation.id,
          idempotencyKey: input.idempotencyKey,
          status: "blocked",
          payload: {
            draft: safeBlockedDraft(request),
            citations: [],
            model: dependencies.providerModel,
            usage,
            safety: blockedInput.safety,
          },
        })
        await audit({
          safety: blockedInput.safety,
          status: "blocked",
          ...usage,
          errorCode: blockedInput.errorCode,
        })
        return proposal
      }

      const inputGuardrail = evaluateCopilotInput(promptText(request))
      if (!inputGuardrail.ok) {
        return persistBlocked({
          safety: inputGuardrail.safety,
          errorCode: "prompt_injection",
        })
      }

      const reservation = await dependencies.quota.reserve({
        teacherId: actor.userId,
        estimatedTokens: LESSON_PLAN_RESERVED_TOKENS,
      })
      if (!reservation.ok) throw new CopilotServiceError(reservation.code)

      let settlementUsage = { inputTokens: 0, outputTokens: 0 }
      let lastSafety: CopilotSafetyAudit = {
        decision: "blocked",
        policyVersion: LESSON_PLAN_PROMPT_VERSION,
        reasonCode: "generation_failed",
      }
      let failureCode = "generation_failed"

      try {
        return await telemetry.trace({
          name: "lesson_plan.execution",
          metadata: {
            teacherId: actor.userId,
            conversationId: conversation.id,
            correlationId,
            provider: dependencies.providerName,
            model: dependencies.providerModel,
          },
        }, async () => {
          const [allowedClassroomIds, history] = await Promise.all([
            dependencies.copilotRepository.listAllowedClassroomIds(actor.userId),
            dependencies.copilotRepository.listMessages(actor.userId, conversation.id, 12),
          ])
          const evidence = normalizedEvidence(
            await dependencies.retrieveContext({
              teacherId: actor.userId,
              query: promptText(request),
              classroomId: conversation.classroomId,
              allowedClassroomIds,
              contentIds: request.contentIds,
            }),
            request.contentIds
          )

          if (evidence.length === 0) {
            lastSafety = {
              decision: "abstain",
              policyVersion: LESSON_PLAN_PROMPT_VERSION,
              reasonCode: "insufficient_context",
            }
            return persistBlocked({
              safety: lastSafety,
              errorCode: "insufficient_context",
            })
          }

          failureCode = "provider_failed"
          settlementUsage = {
            inputTokens: reservation.reservedTokens,
            outputTokens: 0,
          }
          const providerOutput = await telemetry.wrap({
            name: "lesson_plan.generate",
            metadata: {
              teacherId: actor.userId,
              conversationId: conversation.id,
              correlationId,
              provider: dependencies.providerName,
              model: dependencies.providerModel,
            },
          }, () => dependencies.provider.generate({
            system: LESSON_PLAN_SYSTEM_PROMPT,
            user: [
              history
                .filter((message) => message.status === "completed")
                .map((message) => `${message.role}: ${message.content}`)
                .join("\n"),
              providerUserPrompt(request),
            ].filter(Boolean).join("\n"),
            context: formatEvidence(evidence),
            maxOutputTokens: LESSON_PLAN_MAX_OUTPUT_TOKENS,
          }))

          const reportedUsage = usageSchema.safeParse(providerOutput.usage)
          if (
            reportedUsage.success &&
            reportedUsage.data.inputTokens + reportedUsage.data.outputTokens <=
              reservation.reservedTokens
          ) {
            settlementUsage = reportedUsage.data
          }

          const parsedOutput = copilotResponseSchema.safeParse(providerOutput)
          if (!parsedOutput.success) {
            lastSafety = {
              decision: "blocked",
              policyVersion: LESSON_PLAN_PROMPT_VERSION,
              reasonCode: "invalid_provider_output",
            }
            return persistBlocked({
              safety: lastSafety,
              errorCode: "invalid_provider_output",
              usage: settlementUsage,
            })
          }

          const output = parsedOutput.data
          lastSafety = output.safety
          const approved =
            output.safety.decision === "approved" ||
            output.safety.decision === "approved_with_warning"
          const citations = canonicalCitations(output.citations, evidence)
          let parsedJson: unknown
          try {
            parsedJson = JSON.parse(output.text)
          } catch {
            parsedJson = null
          }
          const generatedDraft = sanitizeGeneratedDraft(parsedJson)

          if (!approved || citations.length === 0 || !generatedDraft) {
            const errorCode = approved ? "invalid_provider_output" :
              output.safety.reasonCode ?? output.safety.decision
            const safety = approved
              ? {
                  decision: "blocked" as const,
                  policyVersion: LESSON_PLAN_PROMPT_VERSION,
                  reasonCode: "invalid_provider_output",
                }
              : output.safety
            lastSafety = safety
            return persistBlocked({
              safety,
              errorCode,
              usage: settlementUsage,
            })
          }

          const draft = lessonPlanDraftSchema.parse({
            ...generatedDraft,
            citations,
          })
          const proposal = await createProposal({
            teacherId: actor.userId,
            conversationId: conversation.id,
            idempotencyKey: input.idempotencyKey,
            payload: {
              draft,
              citations,
              model: dependencies.providerModel,
              usage: output.usage,
              safety: output.safety,
            },
          })
          await audit({
            safety: output.safety,
            status: "completed",
            inputTokens: output.usage.inputTokens,
            outputTokens: output.usage.outputTokens,
            errorCode: null,
          })
          return proposal
        })
      } catch (error) {
        await audit({
          safety: lastSafety,
          status: "failed",
          inputTokens: settlementUsage.inputTokens,
          outputTokens: settlementUsage.outputTokens,
          errorCode: error instanceof CopilotServiceError ? error.code : failureCode,
        })
        throw error
      } finally {
        await dependencies.quota.settle({
          teacherId: actor.userId,
          reservedTokens: reservation.reservedTokens,
          usageDate: reservation.usageDate,
          ...settlementUsage,
        })
      }
    },

    getProposal(input: { teacherId: string; proposalId: string }) {
      return repository.getProposal(input)
    },

    rejectProposal(input: { teacherId: string; proposalId: string }) {
      return repository.rejectProposal(input)
    },

    async saveDraft(input: {
      teacherId: string
      proposalId: string
      draft?: LessonPlanDraft
      authorId?: string
      status?: string
    }) {
      const proposal = await repository.getProposal(input)
      if (!proposal) return null
      if (proposal.status !== "proposed" && proposal.status !== "saved") return null

      const draft = input.draft ?? proposal.draft
      if (stableStringify(draft.citations) !== stableStringify(proposal.citations)) {
        throw new LessonPlanServiceError("invalid_lesson_plan_proposal")
      }

      return repository.saveDraft({
        teacherId: input.teacherId,
        proposalId: input.proposalId,
        contentDraft: lessonPlanDraftToContentDraft({
          conversationId: proposal.conversationId,
          proposalId: proposal.id,
          model: proposal.model,
          draft,
        }),
      })
    },
  }
}
