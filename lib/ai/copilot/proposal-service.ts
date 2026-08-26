import { createHash } from "node:crypto"

export const proposalStatuses = [
  "proposed",
  "rejected",
  "saved",
  "blocked",
  "failed",
] as const

export type ProposalStatus = (typeof proposalStatuses)[number]

export type StoredProposal = {
  id: string
  teacherId: string
  conversationId: string
  status: ProposalStatus
  payloadHash: string
  idempotencyKey: string
  contentItemId?: string | null
  createdAt: string
  updatedAt: string
}

export type ProposalRepository<Payload, Proposal extends StoredProposal, ContentDraft, ContentItem extends { id: string }> = {
  createProposal(input: {
    teacherId: string
    conversationId: string
    status: Exclude<ProposalStatus, "saved">
    payload: Payload
    payloadHash: string
    idempotencyKey: string
  }): Promise<Proposal>
  getProposal(input: { teacherId: string; proposalId: string }): Promise<Proposal | null>
  rejectProposal(input: { teacherId: string; proposalId: string }): Promise<Proposal | null>
  saveDraft(input: {
    teacherId: string
    proposalId: string
    contentDraft: ContentDraft
  }): Promise<{ proposal: Proposal; contentItem: ContentItem } | null>
}

export class ProposalServiceError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = "ProposalServiceError"
    this.code = code
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>
    return `{${Object.keys(objectValue)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

export function proposalPayloadHash(input: {
  conversationId: string
  status: Exclude<ProposalStatus, "saved">
  payload: unknown
}): string {
  return createHash("sha256")
    .update(stableStringify(input))
    .digest("hex")
}

function assertProposalLifecycle(proposal: StoredProposal) {
  const hasContentItem = proposal.contentItemId !== null && proposal.contentItemId !== undefined && proposal.contentItemId.trim() !== ""
  if (proposal.status === "saved" && !hasContentItem) {
    throw new ProposalServiceError("saved_proposal_requires_content_item")
  }
  if (proposal.status !== "saved" && hasContentItem) {
    throw new ProposalServiceError("only_saved_proposals_may_reference_content_item")
  }
}

export function createProposalService<
  Payload,
  Proposal extends StoredProposal,
  ContentDraft,
  ContentItem extends { id: string },
>(input: {
  repository: ProposalRepository<Payload, Proposal, ContentDraft, ContentItem>
  normalizePayload: (payload: Payload, status: Exclude<ProposalStatus, "saved">) => Payload
}) {
  const { repository, normalizePayload } = input

  return {
    async createProposal(input: {
      teacherId: string
      conversationId: string
      idempotencyKey: string
      payload: Payload
      status?: Exclude<ProposalStatus, "saved">
    }) {
      const status = input.status ?? "proposed"
      const payload = normalizePayload(input.payload, status)
      const proposal = await repository.createProposal({
        teacherId: input.teacherId,
        conversationId: input.conversationId,
        idempotencyKey: input.idempotencyKey,
        status,
        payload,
        payloadHash: proposalPayloadHash({
          conversationId: input.conversationId,
          status,
          payload,
        }),
      })
      assertProposalLifecycle(proposal)
      return proposal
    },

    async getProposal(input: { teacherId: string; proposalId: string }) {
      const proposal = await repository.getProposal(input)
      if (proposal) assertProposalLifecycle(proposal)
      return proposal
    },

    async rejectProposal(input: { teacherId: string; proposalId: string }) {
      const proposal = await repository.rejectProposal(input)
      if (proposal) assertProposalLifecycle(proposal)
      return proposal
    },

    async saveDraft(input: {
      teacherId: string
      proposalId: string
      contentDraft: ContentDraft
    }) {
      const proposal = await repository.getProposal(input)
      if (!proposal) return null
      assertProposalLifecycle(proposal)
      if (proposal.status !== "proposed" && proposal.status !== "saved") return null

      const result = await repository.saveDraft(input)
      if (!result) return null
      assertProposalLifecycle(result.proposal)
      if (result.proposal.contentItemId !== result.contentItem.id) {
        throw new ProposalServiceError("saved_proposal_content_item_mismatch")
      }
      return result
    },
  }
}
