import assert from "node:assert/strict"
import test from "node:test"
import type { Citation } from "../lib/ai/contracts.ts"
import { createCopilotService, type CopilotRepository } from "../lib/ai/copilot/service.ts"
import type {
  CopilotActor,
  CopilotCitation,
  CopilotConversation,
  CopilotMessage,
  CopilotMessageCitation,
} from "../lib/ai/copilot/types.ts"

const actor: CopilotActor = {
  userId: "11111111-1111-4111-8111-111111111111",
  userType: "professor",
}
const conversationId = "44444444-4444-4444-8444-444444444444"
const classroomId = "77777777-7777-4777-8777-777777777777"

class MemoryRepository implements CopilotRepository {
  readonly conversations = new Map<string, CopilotConversation>()
  readonly messages: CopilotMessage[] = []
  readonly citations: CopilotMessageCitation[] = []
  readonly runs: unknown[] = []
  feedback: unknown
  listMessagesLimit: number | null = null

  constructor() {
    this.conversations.set(conversationId, {
      id: conversationId,
      teacherId: actor.userId,
      title: "Planejamento",
      status: "active",
      classroomId,
      createdAt: "2026-08-24T12:00:00.000Z",
      updatedAt: "2026-08-24T12:00:00.000Z",
    })
  }

  async createConversation(input: { teacherId: string; title: string }) {
    const conversation = {
      id: "99999999-9999-4999-8999-999999999999",
      teacherId: input.teacherId,
      title: input.title,
      status: "active" as const,
      classroomId: null,
      createdAt: "2026-08-24T12:00:00.000Z",
      updatedAt: "2026-08-24T12:00:00.000Z",
    }
    this.conversations.set(conversation.id, conversation)
    return conversation
  }

  async listConversations(teacherId: string) {
    return [...this.conversations.values()].filter(
      (conversation) => conversation.teacherId === teacherId
    )
  }

  async getConversation(teacherId: string, id: string) {
    const conversation = this.conversations.get(id)
    return conversation?.teacherId === teacherId ? conversation : null
  }

  async listMessages(_teacherId: string, _conversationId: string, limit: number) {
    this.listMessagesLimit = limit
    return this.messages.slice(-limit)
  }

  async appendMessage(input: Parameters<CopilotRepository["appendMessage"]>[0]) {
    const message = {
      id: `message-${this.messages.length + 1}`,
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      status: input.status,
      createdAt: "2026-08-24T12:00:00.000Z",
      completedAt: input.status === "completed" || input.status === "blocked"
        ? "2026-08-24T12:00:00.000Z"
        : null,
    }
    this.messages.push(message)
    return message
  }

  async saveCitations(input: {
    messageId: string
    citations: readonly CopilotMessageCitation[]
  }) {
    this.citations.push(...input.citations)
  }

  async saveFeedback(input: Parameters<CopilotRepository["saveFeedback"]>[0]) {
    this.feedback = input
  }

  async listAllowedClassroomIds() {
    return [classroomId]
  }

  async recordRun(input: unknown) {
    this.runs.push(input)
  }
}

function setup(options: {
  evidence?: readonly CopilotCitation[]
  providerCitations?: readonly Citation[]
} = {}) {
  const repository = new MemoryRepository()
  let providerInput: { system: string; user: string; context: string } | null = null
  let retrievalInput: Parameters<NonNullable<Parameters<typeof createCopilotService>[0]["retrieveContext"]>>[0] | null = null
  const service = createCopilotService({
    repository,
    quota: { reserve: async () => ({ ok: true }) },
    provider: {
      generate: async (input) => {
        providerInput = input
        return {
          text: "Combine exemplos resolvidos com prática guiada.",
          citations: [...(options.providerCitations ?? [
            {
              id: "material-1",
              kind: "internal" as const,
              title: "Sequência didática",
              url: "/materiais/material-1",
              retrievedAt: "2026-08-24T12:00:00.000Z",
              excerpt: "Prática guiada ajuda a consolidar o conteúdo.",
            },
          ])],
          usage: { inputTokens: 31, outputTokens: 17 },
          safety: { decision: "approved" as const, policyVersion: "test-v1" },
        }
      },
    },
    retrieveContext: async (input) => {
      retrievalInput = input
      return options.evidence ?? [
        {
          sourceId: "material-1",
          title: "Sequência didática",
          excerpt: "Prática guiada ajuda a consolidar o conteúdo.",
        },
      ]
    },
  })

  return {
    repository,
    service,
    providerInput: () => providerInput,
    retrievalInput: () => retrievalInput,
  }
}

test("creates and lists professor conversations through teacher ownership", async () => {
  const { service } = setup()

  const created = await service.createConversation({
    actor,
    title: "  Aula de matemática  ",
  })
  const conversations = await service.listConversations({ actor })

  assert.equal(created.teacherId, actor.userId)
  assert.equal(created.title, "Aula de matemática")
  assert.equal(conversations.some((conversation) => conversation.id === created.id), true)
})

test("sends a message with authorized context, bounded history and structured citations", async () => {
  const { repository, service, providerInput, retrievalInput } = setup()
  repository.messages.push({
    id: "old-message",
    conversationId,
    role: "user",
    content: "Mensagem anterior",
    status: "completed",
    createdAt: "2026-08-24T11:00:00.000Z",
    completedAt: "2026-08-24T11:00:00.000Z",
  })

  const result = await service.sendMessage({
    actor,
    conversationId,
    content: "Como revisar equações?",
  })

  assert.equal(repository.listMessagesLimit, 12)
  assert.deepEqual(retrievalInput(), {
    teacherId: actor.userId,
    query: "Como revisar equações?",
    classroomId,
    allowedClassroomIds: [classroomId],
  })
  assert.match(providerInput()?.system ?? "", /Copilot do Professor/)
  assert.match(providerInput()?.user ?? "", /Mensagem anterior/)
  assert.match(providerInput()?.context ?? "", /Prática guiada/)
  assert.equal(result.assistantMessage.status, "completed")
  assert.equal(result.citations[0].sourceId, "material-1")
  assert.equal(repository.citations[0].sourceKind, "internal")
  assert.equal(repository.citations[0].sourceId, "material-1")
  assert.equal(repository.runs.length, 1)
})

test("persists a blocked response and skips the provider when retrieval has no evidence", async () => {
  const { repository, service, providerInput } = setup({ evidence: [] })

  const result = await service.sendMessage({
    actor,
    conversationId,
    content: "O que cai na prova externa?",
  })

  assert.equal(providerInput(), null)
  assert.equal(result.assistantMessage.status, "blocked")
  assert.equal(result.citations.length, 0)
  assert.match(result.assistantMessage.content, /nao encontrei evidencias suficientes/i)
  assert.equal(repository.runs.length, 1)
})

test("does not persist a completed response when the provider returns no citations", async () => {
  const { repository, service } = setup({ providerCitations: [] })

  const result = await service.sendMessage({
    actor,
    conversationId,
    content: "Como revisar equações?",
  })

  assert.equal(result.assistantMessage.status, "blocked")
  assert.equal(result.citations.length, 0)
  assert.equal(
    repository.messages.some(
      (message) => message.role === "assistant" && message.status === "completed"
    ),
    false
  )
  assert.deepEqual(repository.runs.at(-1), {
    teacherId: actor.userId,
    conversationId,
    status: "blocked",
    inputTokens: 0,
    outputTokens: 0,
    errorCode: "invalid_provider_output",
  })
})

async function assertProviderCitationsAreBlocked(
  providerCitations: readonly Citation[]
) {
  const { repository, service } = setup({ providerCitations })

  const result = await service.sendMessage({
    actor,
    conversationId,
    content: "Como revisar equações?",
  })

  assert.equal(result.assistantMessage.status, "blocked")
  assert.equal(result.citations.length, 0)
  assert.notEqual(
    result.assistantMessage.content,
    "Combine exemplos resolvidos com prática guiada."
  )
  assert.equal(
    repository.messages.some(
      (message) => message.role === "assistant" && message.status === "completed"
    ),
    false
  )
}

test("blocks a provider response with a malformed contract citation", async () => {
  await assertProviderCitationsAreBlocked([
    {
      id: "material-1",
      kind: "internal",
      title: "Sequência didática",
      url: "https://externo.test/material-1",
      retrievedAt: "not-a-date",
      excerpt: "Prática guiada ajuda a consolidar o conteúdo.",
    } as unknown as Citation,
  ])
})

test("blocks a provider response that cites a web source", async () => {
  await assertProviderCitationsAreBlocked([
    {
      id: "material-1",
      kind: "web",
      title: "Fonte externa",
      url: "https://example.com/material-1",
      retrievedAt: "2026-08-24T12:00:00.000Z",
      excerpt: "Conteúdo externo não autorizado para este fluxo.",
    },
  ])
})

test("blocks an internal citation absent from the authorized evidence", async () => {
  await assertProviderCitationsAreBlocked([
    {
      id: "material-de-outro-professor",
      kind: "internal",
      title: "Material não autorizado",
      url: "/materiais/material-de-outro-professor",
      retrievedAt: "2026-08-24T12:00:00.000Z",
      excerpt: "Este conteúdo não pertence ao conjunto recuperado.",
    },
  ])
})

test("saves feedback only after verifying the professor owns the conversation", async () => {
  const { repository, service } = setup()
  repository.messages.push({
    id: "assistant-message",
    conversationId,
    role: "assistant",
    content: "Resposta",
    status: "completed",
    createdAt: "2026-08-24T12:00:00.000Z",
    completedAt: "2026-08-24T12:00:00.000Z",
  })

  await service.saveFeedback({
    actor,
    conversationId,
    messageId: "assistant-message",
    rating: "positive",
    comment: "  útil  ",
  })

  assert.deepEqual(repository.feedback, {
    teacherId: actor.userId,
    conversationId,
    messageId: "assistant-message",
    rating: "positive",
    comment: "útil",
  })
})
