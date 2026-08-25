import { createHash } from "node:crypto"
import {
  lessonPlanDraftSchema,
  lessonPlanProposalSchema,
  type LessonPlanDraft,
  type LessonPlanProposal,
  type LessonPlanStatus,
} from "./lesson-plan.ts"

const PROPOSAL_ID_PLACEHOLDER = "00000000-0000-4000-8000-000000000000"

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
  const draft = lessonPlanDraftSchema.parse(input.draft)
  const steps = draft.steps
    .map(
      (step) =>
        `<li><strong>${escapeHtml(step.title)}</strong> (${step.minutes} min): ${escapeHtml(step.description)}</li>`
    )
    .join("")

  return {
    title: draft.title,
    status: "draft",
    visibility: "private",
    bodyHtml: [
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
    ].join(""),
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
}: {
  repository: LessonPlanProposalRepository
}) {
  return {
    async createProposal(input: {
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
