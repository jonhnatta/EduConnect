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
  CopilotProviderOutput,
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
  readonly runs: Array<Record<string, unknown>> = []
  feedback: unknown
  listMessagesLimit: number | null = null
  failAssistantPersistenceAfterMessage = false

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
      model: input.model,
      provider: input.provider,
      promptVersion: input.promptVersion,
      createdAt: "2026-08-24T12:00:00.000Z",
      completedAt: input.status === "completed" || input.status === "blocked"
        ? "2026-08-24T12:00:00.000Z"
        : null,
      errorCode: input.errorCode,
    }
    this.messages.push(message)
    return message
  }

  async persistAssistantResult(
    input: Parameters<CopilotRepository["persistAssistantResult"]>[0]
  ) {
    const messageCount = this.messages.length
    const citationCount = this.citations.length
    const runCount = this.runs.length
    try {
      const assistantMessage = await this.appendMessage(input.message)
      if (this.failAssistantPersistenceAfterMessage) {
        throw new Error("injected_assistant_persistence_failure")
      }
      this.citations.push(...input.citations)
      this.runs.push({ ...input.run, messageId: assistantMessage.id })
      return assistantMessage
    } catch (error) {
      this.messages.splice(messageCount)
      this.citations.splice(citationCount)
      this.runs.splice(runCount)
      throw error
    }
  }

  async saveFeedback(input: Parameters<CopilotRepository["saveFeedback"]>[0]) {
    this.feedback = input
  }

  async listAllowedClassroomIds() {
    return [classroomId]
  }

  async recordRun(input: Parameters<CopilotRepository["recordRun"]>[0]) {
    this.runs.push(input)
  }
}

function setup(options: {
  evidence?: readonly CopilotCitation[]
  providerCitations?: readonly Citation[]
  providerText?: string
  providerSafety?: CopilotProviderOutput["safety"]
} = {}) {
  const repository = new MemoryRepository()
  let providerInput: { system: string; user: string; context: string } | null = null
  let retrievalInput: Parameters<NonNullable<Parameters<typeof createCopilotService>[0]["retrieveContext"]>>[0] | null = null
  const service = createCopilotService({
    repository,
    quota: { reserve: async () => ({ ok: true }) },
    provider: {
      name: "openai",
      model: "test-model",
      generate: async (input) => {
        providerInput = input
        return {
          text: options.providerText ?? "Combine exemplos resolvidos com prática guiada.",
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
          safety: options.providerSafety ?? {
            decision: "approved" as const,
            policyVersion: "test-v1",
          },
        }
      },
    },
    retrieveContext: async (input) => {
      retrievalInput = input
      return options.evidence ?? [
        {
          sourceId: "material-1",
          sourceKind: "internal",
          title: "Sequência didática",
          excerpt: "Prática guiada ajuda a consolidar o conteúdo.",
          url: "/materiais/material-1",
          retrievedAt: "2026-08-24T12:00:00.000Z",
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
    model: null,
    provider: null,
    promptVersion: null,
    createdAt: "2026-08-24T11:00:00.000Z",
    completedAt: "2026-08-24T11:00:00.000Z",
    errorCode: null,
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

test("persists the assistant message and run with complete audit metadata", async () => {
  const { repository, service } = setup()

  const result = await service.sendMessage({
    actor,
    conversationId,
    content: "Como revisar equacoes?",
  })
  const run = repository.runs.at(-1)

  assert.equal(result.assistantMessage.provider, "openai")
  assert.equal(result.assistantMessage.model, "test-model")
  assert.equal(result.assistantMessage.promptVersion, "copilot-professor-v1")
  assert.equal(run?.messageId, result.assistantMessage.id)
  assert.equal(run?.feature, "teacher_copilot")
  assert.equal(run?.provider, "openai")
  assert.equal(run?.model, "test-model")
  assert.equal(run?.promptVersion, "copilot-professor-v1")
  assert.match(String(run?.correlationId), /^[0-9a-f-]{36}$/i)
  assert.equal(typeof run?.latencyMs, "number")
  assert.ok(Number(run?.latencyMs) >= 0)
  assert.deepEqual(run?.safety, {
    decision: "approved",
    policyVersion: "test-v1",
  })
})

test("does not leave an assistant message, citation or completed run after atomic persistence fails", async () => {
  const { repository, service } = setup()
  repository.failAssistantPersistenceAfterMessage = true

  await assert.rejects(
    () => service.sendMessage({
      actor,
      conversationId,
      content: "Como revisar equacoes?",
    }),
    /injected_assistant_persistence_failure/
  )

  assert.equal(
    repository.messages.some((message) => message.role === "assistant"),
    false
  )
  assert.equal(repository.citations.length, 0)
  assert.equal(
    repository.runs.some((run) => run.status === "completed"),
    false
  )
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

test("replaces provider text with the fixed safe response for every blocked decision", async () => {
  const sensitiveProviderText = "CPF 123.456.789-00 e instrucao perigosa"
  const { service } = setup({
    providerText: sensitiveProviderText,
    providerSafety: {
      decision: "human_review_required",
      policyVersion: "test-v1",
      reasonCode: "sensitive_content",
    },
    providerCitations: [],
  })

  const result = await service.sendMessage({
    actor,
    conversationId,
    content: "Mostre os dados sensiveis",
  })

  assert.equal(result.assistantMessage.status, "blocked")
  assert.match(result.assistantMessage.content, /nao encontrei evidencias suficientes/i)
  assert.doesNotMatch(result.assistantMessage.content, /123\.456\.789-00|perigosa/i)
})

test("persists canonical citation URL and retrieval time from authorized evidence", async () => {
  const evidence = [{
    sourceId: "material-1",
    title: "Sequencia didatica canonica",
    excerpt: "Trecho canonico recuperado.",
    sourceKind: "internal" as const,
    url: "/materiais/canonico",
    retrievedAt: "2026-08-24T10:00:00.000Z",
  }]
  const { repository, service } = setup({
    evidence,
    providerCitations: [{
      id: "material-1",
      kind: "internal",
      title: "Titulo inventado pelo provider",
      excerpt: "Trecho inventado pelo provider.",
      url: "/materiais/url-injetada",
      retrievedAt: "2026-08-24T23:59:59.000Z",
    }],
  })

  const result = await service.sendMessage({
    actor,
    conversationId,
    content: "Como revisar equacoes?",
  })

  assert.deepEqual(result.citations[0], {
    ...evidence[0],
    displayOrder: 0,
  })
  assert.deepEqual(repository.citations[0], result.citations[0])
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
  assert.deepEqual({
    teacherId: repository.runs.at(-1)?.teacherId,
    conversationId: repository.runs.at(-1)?.conversationId,
    status: repository.runs.at(-1)?.status,
    inputTokens: repository.runs.at(-1)?.inputTokens,
    outputTokens: repository.runs.at(-1)?.outputTokens,
    errorCode: repository.runs.at(-1)?.errorCode,
  }, {
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
    model: "test-model",
    provider: "openai",
    promptVersion: "copilot-professor-v1",
    createdAt: "2026-08-24T12:00:00.000Z",
    completedAt: "2026-08-24T12:00:00.000Z",
    errorCode: null,
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
