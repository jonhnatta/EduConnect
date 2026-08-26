import assert from "node:assert/strict"
import test from "node:test"
import { createContentApiHandlers } from "../lib/ai/copilot/content-http.ts"
import type { ContentProposal } from "../lib/ai/copilot/content-contracts.ts"
import type { ContentProposalRepository, StoredContentProposal } from "../lib/ai/copilot/postgres-repository.ts"
import type { CopilotActor } from "../lib/ai/copilot/types.ts"

const teacher: CopilotActor = { userId: "11111111-1111-4111-8111-111111111111", userType: "professor" }
const conversationId = "33333333-3333-4333-8333-333333333333"
const proposalId = "44444444-4444-4444-8444-444444444444"

function proposal(): ContentProposal {
  return {
    module: "review",
    mode: "review",
    draft: {
      module: "assessment",
      title: "Avaliação de fotossíntese",
      instructions: "Responda às questões.",
      questions: [{
        id: "questao-1",
        order: 1,
        type: "mcq",
        prompt: "Qual processo produz glicose?",
        points: 1,
        disciplina: null,
        options: ["Fotossíntese", "Respiração"],
        teacherAnswer: { correctIndex: 0, rationale: "A fotossíntese produz glicose." },
      }],
    },
    changeSummary: "Revisa uma avaliação introdutória.",
    warnings: [],
    citations: [],
    model: "test-model",
    usage: { inputTokens: 100, outputTokens: 80 },
    safety: { decision: "abstain", policyVersion: "content-test-v1", reasonCode: "not_enough_evidence" },
  }
}

function stored(): StoredContentProposal {
  const originalContent = {
    module: "assessment" as const,
    title: "Avaliação de fotossíntese",
    instructions: "Responda às questões.",
    questions: [{
      id: "questao-1",
      order: 1,
      type: "mcq" as const,
      prompt: "Qual processo produz glicose?",
      points: 1,
      disciplina: null,
      options: ["Fotossíntese", "Respiração"],
      teacherAnswer: { correctIndex: 0, rationale: "A fotossíntese produz glicose." },
    }],
  }
  const payload = proposal()
  return {
    id: proposalId,
    teacherId: teacher.userId,
    conversationId,
    module: "review",
    mode: "review",
    originalContent,
    payload,
    changeSummary: payload.changeSummary,
    provider: "openai",
    model: payload.model,
    status: "blocked",
    contentItemId: null,
    payloadHash: "hash",
    idempotencyKey: "content-key",
    createdAt: "2026-08-25T12:00:00.000Z",
    updatedAt: "2026-08-25T12:00:00.000Z",
  }
}

function assertTeacherAnswersHidden(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(assertTeacherAnswersHidden)
  if (!value || typeof value !== "object") return
  for (const [key, nested] of Object.entries(value)) {
    assert.notEqual(key, "teacherAnswer")
    assertTeacherAnswersHidden(nested)
  }
}

test("does not expose teacher answers stored in original review content", async () => {
  const storedProposal = stored()
  const repository: ContentProposalRepository = {
    async createContentProposal() { return storedProposal },
    async getContentProposal() { return storedProposal },
    async rejectContentProposal() { return storedProposal },
    async saveContentDraft() { return null },
    async listContentProposals() { return { items: [storedProposal], nextCursor: null } },
  }
  const handlers = createContentApiHandlers({
    resolveActor: async () => teacher,
    service: {
      async generateContent() { return proposal() },
      async reviewContent() { return proposal() },
    },
    repository,
    provider: "openai",
  })

  const response = await handlers.get(new Request("https://educonnect.test/api/copilot/content/" + proposalId), { params: { proposalId } })

  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.proposal.originalContent.questions[0].teacherAnswer, undefined)
  assertTeacherAnswersHidden(body)
})
