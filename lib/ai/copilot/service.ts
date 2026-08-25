import { copilotResponseSchema, type Citation } from "../contracts.ts"
import {
  conversationCreateSchema,
  copilotMessageInputSchema,
  feedbackSchema,
} from "./validation.ts"
import type {
  CopilotActor,
  CopilotCitation,
  CopilotContextRetriever,
  CopilotConversation,
  CopilotMessage,
  CopilotMessageCitation,
  CopilotProvider,
} from "./types.ts"

const HISTORY_LIMIT = 12
const DEFAULT_TITLE = "Nova conversa"
const BLOCKED_RESPONSE =
  "Nao encontrei evidencias suficientes nos materiais autorizados para responder com seguranca."

export type CopilotServiceErrorCode =
  | "professor_required"
  | "conversation_not_found"
  | "invalid_provider_output"
  | string

export class CopilotServiceError extends Error {
  readonly code: CopilotServiceErrorCode

  constructor(code: CopilotServiceErrorCode) {
    super(code)
    this.name = "CopilotServiceError"
    this.code = code
  }
}

export type CopilotRepository = {
  createConversation(input: {
    teacherId: string
    title: string
  }): Promise<CopilotConversation>
  listConversations(teacherId: string): Promise<readonly CopilotConversation[]>
  getConversation(
    teacherId: string,
    conversationId: string
  ): Promise<CopilotConversation | null>
  listMessages(
    teacherId: string,
    conversationId: string,
    limit: number
  ): Promise<readonly CopilotMessage[]>
  appendMessage(input: {
    teacherId: string
    conversationId: string
    role: CopilotMessage["role"]
    content: string
    status: CopilotMessage["status"]
  }): Promise<CopilotMessage>
  saveCitations(input: {
    messageId: string
    citations: readonly CopilotMessageCitation[]
  }): Promise<void>
  saveFeedback(input: {
    teacherId: string
    conversationId: string
    messageId: string
    rating: "positive" | "negative"
    comment?: string
  }): Promise<void>
  listAllowedClassroomIds(teacherId: string): Promise<readonly string[]>
  recordRun(input: {
    teacherId: string
    conversationId: string
    status: "completed" | "failed" | "blocked"
    inputTokens: number
    outputTokens: number
    errorCode?: string
  }): Promise<void>
}

export type CopilotQuota = {
  reserve(input: {
    teacherId: string
    estimatedTokens: number
  }): Promise<{ ok: true } | { ok: false; code: string }>
}

export type CopilotServiceDependencies = {
  repository: CopilotRepository
  quota: CopilotQuota
  provider: CopilotProvider
  retrieveContext: CopilotContextRetriever
}

type ActorInput = { actor: CopilotActor | null | undefined }

function requireProfessor(actor: CopilotActor | null | undefined): CopilotActor {
  if (!actor || actor.userType !== "professor" || actor.userId.trim() === "") {
    throw new CopilotServiceError("professor_required")
  }
  return actor
}

function estimatedTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4) + 1_000)
}

function normalizedEvidence(evidence: readonly CopilotCitation[]): CopilotCitation[] {
  return evidence.flatMap((citation) => {
    const sourceId = citation.sourceId.trim()
    const title = citation.title.trim()
    const excerpt = citation.excerpt.trim()
    return sourceId && title && excerpt ? [{ sourceId, title, excerpt }] : []
  })
}

function formatContext(evidence: readonly CopilotCitation[]): string {
  return evidence
    .map(
      (citation, index) =>
        `[${index + 1}] ${citation.title}\nFonte: ${citation.sourceId}\n${citation.excerpt}`
    )
    .join("\n\n")
}

function formatUserPrompt(history: readonly CopilotMessage[], content: string): string {
  const previousMessages = history
    .filter((message) => message.status === "completed")
    .map((message) => `${message.role}: ${message.content}`)

  return [...previousMessages, `user: ${content}`].join("\n")
}

function citationsSupportedBy(
  citations: readonly Citation[],
  evidence: readonly CopilotCitation[]
): CopilotMessageCitation[] {
  const authorized = new Map(evidence.map((citation) => [citation.sourceId, citation]))
  const seen = new Set<string>()

  return citations.flatMap((citation) => {
    if (citation.kind !== "internal") return []
    const source = authorized.get(citation.id)
    if (!source || seen.has(source.sourceId)) return []
    seen.add(source.sourceId)
    return [{
      ...source,
      sourceKind: citation.kind,
      url: citation.url,
      retrievedAt: citation.retrievedAt,
      displayOrder: seen.size - 1,
    }]
  })
}

export function createCopilotService({
  repository,
  quota,
  provider,
  retrieveContext,
}: CopilotServiceDependencies) {
  async function persistBlockedResponse(input: {
    actor: CopilotActor
    conversation: CopilotConversation
    userMessage: CopilotMessage
    errorCode: string
    content?: string
  }) {
    const assistantMessage = await repository.appendMessage({
      teacherId: input.actor.userId,
      conversationId: input.conversation.id,
      role: "assistant",
      content: input.content ?? BLOCKED_RESPONSE,
      status: "blocked",
    })
    await repository.recordRun({
      teacherId: input.actor.userId,
      conversationId: input.conversation.id,
      status: "blocked",
      inputTokens: 0,
      outputTokens: 0,
      errorCode: input.errorCode,
    })
    return { userMessage: input.userMessage, assistantMessage, citations: [] }
  }

  async function ownedConversation(actor: CopilotActor, conversationId: string) {
    const conversation = await repository.getConversation(actor.userId, conversationId)
    if (!conversation || conversation.status !== "active") {
      throw new CopilotServiceError("conversation_not_found")
    }
    return conversation
  }

  return {
    async createConversation(input: ActorInput & { title?: string }) {
      const actor = requireProfessor(input.actor)
      const parsed = conversationCreateSchema.parse({ title: input.title })
      return repository.createConversation({
        teacherId: actor.userId,
        title: parsed.title ?? DEFAULT_TITLE,
      })
    },

    async listConversations(input: ActorInput) {
      const actor = requireProfessor(input.actor)
      return repository.listConversations(actor.userId)
    },

    async getConversation(input: ActorInput & { conversationId: string }) {
      const actor = requireProfessor(input.actor)
      return ownedConversation(actor, input.conversationId)
    },

    async sendMessage(
      input: ActorInput & { conversationId: string; content: string }
    ) {
      const actor = requireProfessor(input.actor)
      const { content } = copilotMessageInputSchema.parse({ content: input.content })
      const conversation = await ownedConversation(actor, input.conversationId)
      const [history, allowedClassroomIds] = await Promise.all([
        repository.listMessages(actor.userId, conversation.id, HISTORY_LIMIT),
        repository.listAllowedClassroomIds(actor.userId),
      ])
      const classroomId =
        conversation.classroomId && allowedClassroomIds.includes(conversation.classroomId)
          ? conversation.classroomId
          : null
      const evidence = normalizedEvidence(
        await retrieveContext({
          teacherId: actor.userId,
          query: content,
          classroomId,
          allowedClassroomIds,
        })
      )

      if (evidence.length === 0) {
        const userMessage = await repository.appendMessage({
          teacherId: actor.userId,
          conversationId: conversation.id,
          role: "user",
          content,
          status: "completed",
        })
        return persistBlockedResponse({
          actor,
          conversation,
          userMessage,
          errorCode: "insufficient_context",
        })
      }

      const reservation = await quota.reserve({
        teacherId: actor.userId,
        estimatedTokens: estimatedTokens(content),
      })
      if (!reservation.ok) throw new CopilotServiceError(reservation.code)

      const userMessage = await repository.appendMessage({
        teacherId: actor.userId,
        conversationId: conversation.id,
        role: "user",
        content,
        status: "completed",
      })

      try {
        const providerOutput = await provider.generate({
          system:
            "Voce e o Copilot do Professor. Responda somente com base no contexto autorizado.",
          user: formatUserPrompt(history, content),
          context: formatContext(evidence),
        })
        const parsedOutput = copilotResponseSchema.safeParse(providerOutput)
        if (!parsedOutput.success || parsedOutput.data.text.trim() === "") {
          return persistBlockedResponse({
            actor,
            conversation,
            userMessage,
            errorCode: "invalid_provider_output",
          })
        }

        const output = parsedOutput.data
        const citations = citationsSupportedBy(output.citations, evidence)
        const approved =
          output.safety.decision === "approved" ||
          output.safety.decision === "approved_with_warning"

        if (!approved) {
          return persistBlockedResponse({
            actor,
            conversation,
            userMessage,
            content: output.text.trim(),
            errorCode: output.safety.reasonCode ?? output.safety.decision,
          })
        }
        if (citations.length === 0) {
          return persistBlockedResponse({
            actor,
            conversation,
            userMessage,
            errorCode: "invalid_provider_output",
          })
        }

        const assistantMessage = await repository.appendMessage({
          teacherId: actor.userId,
          conversationId: conversation.id,
          role: "assistant",
          content: output.text.trim(),
          status: "completed",
        })
        if (citations.length > 0) {
          await repository.saveCitations({ messageId: assistantMessage.id, citations })
        }
        await repository.recordRun({
          teacherId: actor.userId,
          conversationId: conversation.id,
          status: "completed",
          inputTokens: output.usage.inputTokens,
          outputTokens: output.usage.outputTokens,
        })
        return { userMessage, assistantMessage, citations }
      } catch (error) {
        await repository.recordRun({
          teacherId: actor.userId,
          conversationId: conversation.id,
          status: "failed",
          inputTokens: 0,
          outputTokens: 0,
          errorCode:
            error instanceof CopilotServiceError ? error.code : "provider_failed",
        })
        throw error
      }
    },

    async saveFeedback(
      input: ActorInput & {
        conversationId: string
        messageId: string
        rating: "positive" | "negative"
        comment?: string
      }
    ) {
      const actor = requireProfessor(input.actor)
      await ownedConversation(actor, input.conversationId)
      const feedback = feedbackSchema.parse({
        rating: input.rating,
        comment: input.comment,
      })
      await repository.saveFeedback({
        teacherId: actor.userId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        ...feedback,
      })
    },
  }
}
