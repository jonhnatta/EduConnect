import assert from "node:assert/strict"
import test from "node:test"
import {
  CopilotServiceError,
  createCopilotService,
  type CopilotRepository,
} from "../lib/ai/copilot/service.ts"
import type {
  CopilotActor,
  CopilotConversation,
  CopilotProvider,
} from "../lib/ai/copilot/types.ts"

const professor: CopilotActor = {
  userId: "11111111-1111-4111-8111-111111111111",
  userType: "professor",
}
const student: CopilotActor = {
  userId: "22222222-2222-4222-8222-222222222222",
  userType: "aluno",
}
const conversationId = "44444444-4444-4444-8444-444444444444"

function repositoryFor(conversation: CopilotConversation | null): CopilotRepository {
  return {
    createConversation: async () => {
      throw new Error("createConversation should not be called")
    },
    listConversations: async () => [],
    getConversation: async (teacherId, requestedConversationId) =>
      conversation?.teacherId === teacherId && conversation.id === requestedConversationId
        ? conversation
        : null,
    listMessages: async () => [],
    appendMessage: async (input) => ({
      id: "55555555-5555-4555-8555-555555555555",
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      status: input.status,
      createdAt: "2026-08-24T12:00:00.000Z",
      completedAt: "2026-08-24T12:00:00.000Z",
    }),
    saveCitations: async () => {},
    saveFeedback: async () => {},
    listAllowedClassroomIds: async () => [],
    recordRun: async () => {},
  }
}

function providerCountingCalls(counter: { value: number }): CopilotProvider {
  return {
    generate: async () => {
      counter.value += 1
      return {
        text: "Resposta",
        citations: [],
        usage: { inputTokens: 1, outputTokens: 1 },
        safety: { decision: "blocked", policyVersion: "test-v1" },
      }
    },
  }
}

function activeConversation(teacherId = professor.userId): CopilotConversation {
  return {
    id: conversationId,
    teacherId,
    title: "Planejamento",
    classroomId: null,
    status: "active",
    createdAt: "2026-08-24T12:00:00.000Z",
    updatedAt: "2026-08-24T12:00:00.000Z",
  }
}

function isCopilotError(code: string) {
  return (error: unknown) =>
    error instanceof CopilotServiceError && error.code === code
}

test("allows only a professor actor to use the Copilot", async () => {
  const providerCalls = { value: 0 }
  const service = createCopilotService({
    repository: repositoryFor(activeConversation()),
    quota: { reserve: async () => ({ ok: true }) },
    provider: providerCountingCalls(providerCalls),
    retrieveContext: async () => [],
  })

  await assert.rejects(
    () => service.listConversations({ actor: student }),
    isCopilotError("professor_required")
  )
  await assert.rejects(
    () => service.listConversations({ actor: null }),
    isCopilotError("professor_required")
  )
  assert.equal(providerCalls.value, 0)
})

test("does not reveal or use a conversation owned by another professor", async () => {
  const providerCalls = { value: 0 }
  let quotaCalls = 0
  const service = createCopilotService({
    repository: repositoryFor(activeConversation("33333333-3333-4333-8333-333333333333")),
    quota: {
      reserve: async () => {
        quotaCalls += 1
        return { ok: true }
      },
    },
    provider: providerCountingCalls(providerCalls),
    retrieveContext: async () => [],
  })

  await assert.rejects(
    () => service.sendMessage({ actor: professor, conversationId, content: "Ajude" }),
    isCopilotError("conversation_not_found")
  )
  assert.equal(quotaCalls, 0)
  assert.equal(providerCalls.value, 0)
})

test("checks quota before calling the provider", async () => {
  const order: string[] = []
  const service = createCopilotService({
    repository: repositoryFor(activeConversation()),
    quota: {
      reserve: async () => {
        order.push("quota")
        return { ok: false, code: "daily_quota_exceeded" }
      },
    },
    provider: {
      generate: async () => {
        order.push("provider")
        return {
          text: "Resposta",
          citations: [],
          usage: { inputTokens: 1, outputTokens: 1 },
          safety: { decision: "blocked", policyVersion: "test-v1" },
        }
      },
    },
    retrieveContext: async () => [
      { sourceId: "material-1", title: "Material", excerpt: "Conteúdo autorizado" },
    ],
  })

  await assert.rejects(
    () => service.sendMessage({ actor: professor, conversationId, content: "Ajude" }),
    isCopilotError("daily_quota_exceeded")
  )
  assert.deepEqual(order, ["quota"])
})
