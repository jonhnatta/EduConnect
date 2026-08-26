import assert from "node:assert/strict"
import test from "node:test"
import {
  createProposalService,
  ProposalServiceError,
  type ProposalRepository,
  type StoredProposal,
} from "../lib/ai/copilot/proposal-service.ts"

type Payload = { title: string }
type ContentDraft = { title: string }
type ContentItem = { id: string }
type Proposal = StoredProposal & { payload: Payload }

const teacherId = "11111111-1111-4111-8111-111111111111"
const conversationId = "22222222-2222-4222-8222-222222222222"
const proposalId = "33333333-3333-4333-8333-333333333333"
const contentItemId = "44444444-4444-4444-8444-444444444444"

class MemoryProposalRepository implements ProposalRepository<Payload, Proposal, ContentDraft, ContentItem> {
  proposal: Proposal | null = null
  readonly createInputs: Array<Parameters<ProposalRepository<Payload, Proposal, ContentDraft, ContentItem>["createProposal"]>[0]> = []
  saveWithoutContentItemId = false

  async createProposal(input: Parameters<ProposalRepository<Payload, Proposal, ContentDraft, ContentItem>["createProposal"]>[0]) {
    this.createInputs.push(input)
    if (this.proposal?.teacherId === input.teacherId && this.proposal.idempotencyKey === input.idempotencyKey) {
      if (this.proposal.payloadHash !== input.payloadHash) {
        throw new ProposalServiceError("proposal_idempotency_conflict")
      }
      return this.proposal
    }
    this.proposal = {
      id: proposalId,
      teacherId: input.teacherId,
      conversationId: input.conversationId,
      status: input.status,
      payload: input.payload,
      payloadHash: input.payloadHash,
      idempotencyKey: input.idempotencyKey,
      contentItemId: null,
      createdAt: "2026-08-25T12:00:00.000Z",
      updatedAt: "2026-08-25T12:00:00.000Z",
    }
    return this.proposal
  }

  async getProposal(input: { teacherId: string; proposalId: string }) {
    return this.proposal?.teacherId === input.teacherId && this.proposal.id === input.proposalId
      ? this.proposal
      : null
  }

  async rejectProposal(input: { teacherId: string; proposalId: string }) {
    const proposal = await this.getProposal(input)
    if (!proposal || proposal.status !== "proposed") return proposal
    this.proposal = { ...proposal, status: "rejected" }
    return this.proposal
  }

  async saveDraft(input: { teacherId: string; proposalId: string; contentDraft: ContentDraft }) {
    const proposal = await this.getProposal(input)
    if (!proposal) return null
    if (proposal.contentItemId) return { proposal, contentItem: { id: proposal.contentItemId } }
    if (proposal.status !== "proposed") return null
    const contentItem = { id: contentItemId }
    this.proposal = {
      ...proposal,
      status: "saved",
      contentItemId: this.saveWithoutContentItemId ? null : contentItem.id,
    }
    return { proposal: this.proposal, contentItem }
  }
}

function createService(repository: MemoryProposalRepository) {
  return createProposalService({
    repository,
    normalizePayload: (payload: Payload) => ({ title: payload.title.trim() }),
  })
}

test("creates a proposed proposal with a normalized, stable payload hash", async () => {
  const repository = new MemoryProposalRepository()
  const proposal = await createService(repository).createProposal({
    teacherId,
    conversationId,
    idempotencyKey: "proposal-key",
    payload: { title: "  Aula de historia  " },
  })

  assert.equal(proposal.status, "proposed")
  assert.equal(proposal.payload.title, "Aula de historia")
  assert.match(proposal.payloadHash, /^[a-f0-9]{64}$/)
})

test("retries the same normalized payload idempotently", async () => {
  const repository = new MemoryProposalRepository()
  const service = createService(repository)
  const first = await service.createProposal({
    teacherId,
    conversationId,
    idempotencyKey: "proposal-key",
    payload: { title: "Aula de historia" },
  })
  const retry = await service.createProposal({
    teacherId,
    conversationId,
    idempotencyKey: "proposal-key",
    payload: { title: "  Aula de historia  " },
  })

  assert.equal(retry.id, first.id)
  assert.equal(repository.createInputs[0]?.payloadHash, repository.createInputs[1]?.payloadHash)
})

test("records blocked and failed proposals as terminal states", async () => {
  for (const status of ["blocked", "failed"] as const) {
    const repository = new MemoryProposalRepository()
    const proposal = await createService(repository).createProposal({
      teacherId,
      conversationId,
      idempotencyKey: `proposal-${status}`,
      status,
      payload: { title: "Aula de historia" },
    })
    assert.equal(proposal.status, status)
  }
})

test("rejects a proposed proposal without attaching content", async () => {
  const repository = new MemoryProposalRepository()
  const service = createService(repository)
  const created = await service.createProposal({
    teacherId,
    conversationId,
    idempotencyKey: "proposal-key",
    payload: { title: "Aula de historia" },
  })

  const rejected = await service.rejectProposal({ teacherId, proposalId: created.id })

  assert.equal(rejected?.status, "rejected")
  assert.equal(rejected?.contentItemId, null)
})

test("marks a proposal saved only when the repository returns its content item id", async () => {
  const repository = new MemoryProposalRepository()
  const service = createService(repository)
  const created = await service.createProposal({
    teacherId,
    conversationId,
    idempotencyKey: "proposal-key",
    payload: { title: "Aula de historia" },
  })

  const saved = await service.saveDraft({
    teacherId,
    proposalId: created.id,
    contentDraft: { title: created.payload.title },
  })

  assert.equal(saved?.proposal.status, "saved")
  assert.equal(saved?.proposal.contentItemId, saved?.contentItem.id)
})

test("rejects a saved result without a content item id", async () => {
  const repository = new MemoryProposalRepository()
  repository.saveWithoutContentItemId = true
  const service = createService(repository)
  const created = await service.createProposal({
    teacherId,
    conversationId,
    idempotencyKey: "proposal-key",
    payload: { title: "Aula de historia" },
  })

  await assert.rejects(
    service.saveDraft({
      teacherId,
      proposalId: created.id,
      contentDraft: { title: created.payload.title },
    }),
    /saved_proposal_requires_content_item/
  )
})
