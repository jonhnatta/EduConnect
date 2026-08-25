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
  CopilotMessageWrite,
  CopilotMessageCitation,
  CopilotProvider,
  CopilotRun,
  CopilotSafetyAudit,
} from "./types.ts"

const HISTORY_LIMIT = 12
const DEFAULT_TITLE = "Nova conversa"
const COPILOT_FEATURE = "teacher_copilot"
const PROMPT_VERSION = "copilot-professor-v1"
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
  appendMessage(input: CopilotMessageWrite): Promise<CopilotMessage>
  persistAssistantResult(input: {
    message: CopilotMessageWrite
    citations: readonly CopilotMessageCitation[]
    run: Omit<CopilotRun, "messageId">
  }): Promise<CopilotMessage>
  saveFeedback(input: {
    teacherId: string
    conversationId: string
    messageId: string
    rating: "positive" | "negative"
    comment?: string
  }): Promise<void>
  listAllowedClassroomIds(teacherId: string): Promise<readonly string[]>
  recordRun(input: CopilotRun): Promise<void>
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
    const url = citation.url.trim()
    const retrievedAt = citation.retrievedAt.trim()
    return sourceId && title && excerpt && url && retrievedAt
      ? [{ ...citation, sourceId, title, excerpt, url, retrievedAt }]
      : []
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
    if (
      !source ||
      source.sourceKind !== "internal" ||
      seen.has(source.sourceId)
    ) return []
    seen.add(source.sourceId)
    return [{
      ...source,
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
  const providerName = provider.name.trim()
  const providerModel = provider.model.trim()
  if (!providerName || !providerModel) {
    throw new TypeError("Copilot provider audit metadata is required")
  }

  function runAudit(input: {
    conversation: CopilotConversation
    actor: CopilotActor
    correlationId: string
    startedAt: number
    safety: CopilotSafetyAudit
    status: CopilotRun["status"]
    inputTokens: number
    outputTokens: number
    errorCode: string | null
  }): Omit<CopilotRun, "messageId"> {
    return {
      teacherId: input.actor.userId,
      conversationId: input.conversation.id,
      feature: COPILOT_FEATURE,
      provider: providerName,
      model: providerModel,
      promptVersion: PROMPT_VERSION,
      correlationId: input.correlationId,
      latencyMs: Math.max(0, Date.now() - input.startedAt),
      safety: input.safety,
      status: input.status,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      errorCode: input.errorCode,
    }
  }

  async function persistBlockedResponse(input: {
    actor: CopilotActor
    conversation: CopilotConversation
    userMessage: CopilotMessage
    correlationId: string
    startedAt: number
    safety: CopilotSafetyAudit
    errorCode: string
    inputTokens?: number
    outputTokens?: number
  }) {
    const assistantMessage = await repository.persistAssistantResult({
      message: {
        teacherId: input.actor.userId,
        conversationId: input.conversation.id,
        role: "assistant",
        content: BLOCKED_RESPONSE,
        status: "blocked",
        model: providerModel,
        provider: providerName,
        promptVersion: PROMPT_VERSION,
        errorCode: input.errorCode,
      },
      citations: [],
      run: runAudit({
        ...input,
        status: "blocked",
        inputTokens: input.inputTokens ?? 0,
        outputTokens: input.outputTokens ?? 0,
        errorCode: input.errorCode,
      }),
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
      const startedAt = Date.now()
      const correlationId = crypto.randomUUID()
      const { content } = copilotMessageInputSchema.parse({ content: input.content })
      const conversation = await ownedConversation(actor, input.conversationId)

      const reservation = await quota.reserve({
        teacherId: actor.userId,
        estimatedTokens: estimatedTokens(content),
      })
      if (!reservation.ok) throw new CopilotServiceError(reservation.code)

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
          model: null,
          provider: null,
          promptVersion: null,
          errorCode: null,
        })
        return persistBlockedResponse({
          actor,
          conversation,
          userMessage,
          correlationId,
          startedAt,
          safety: {
            decision: "abstain",
            policyVersion: PROMPT_VERSION,
            reasonCode: "insufficient_context",
          },
          errorCode: "insufficient_context",
        })
      }

      const userMessage = await repository.appendMessage({
        teacherId: actor.userId,
        conversationId: conversation.id,
        role: "user",
        content,
        status: "completed",
        model: null,
        provider: null,
        promptVersion: null,
        errorCode: null,
      })

      let lastSafety: CopilotSafetyAudit = {
        decision: "blocked",
        policyVersion: PROMPT_VERSION,
        reasonCode: "provider_failed",
      }
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
            correlationId,
            startedAt,
            safety: {
              decision: "blocked",
              policyVersion: PROMPT_VERSION,
              reasonCode: "invalid_provider_output",
            },
            errorCode: "invalid_provider_output",
          })
        }

        const output = parsedOutput.data
        lastSafety = output.safety
        const citations = citationsSupportedBy(output.citations, evidence)
        const approved =
          output.safety.decision === "approved" ||
          output.safety.decision === "approved_with_warning"

        if (!approved) {
          return persistBlockedResponse({
            actor,
            conversation,
            userMessage,
            correlationId,
            startedAt,
            safety: output.safety,
            errorCode: output.safety.reasonCode ?? output.safety.decision,
            inputTokens: output.usage.inputTokens,
            outputTokens: output.usage.outputTokens,
          })
        }
        if (citations.length === 0) {
          return persistBlockedResponse({
            actor,
            conversation,
            userMessage,
            correlationId,
            startedAt,
            safety: {
              decision: "blocked",
              policyVersion: output.safety.policyVersion,
              reasonCode: "invalid_provider_output",
            },
            errorCode: "invalid_provider_output",
            inputTokens: output.usage.inputTokens,
            outputTokens: output.usage.outputTokens,
          })
        }

        const assistantMessage = await repository.persistAssistantResult({
          message: {
            teacherId: actor.userId,
            conversationId: conversation.id,
            role: "assistant",
            content: output.text.trim(),
            status: "completed",
            model: providerModel,
            provider: providerName,
            promptVersion: PROMPT_VERSION,
            errorCode: null,
          },
          citations,
          run: runAudit({
            actor,
            conversation,
            correlationId,
            startedAt,
            safety: output.safety,
            status: "completed",
            inputTokens: output.usage.inputTokens,
            outputTokens: output.usage.outputTokens,
            errorCode: null,
          }),
        })
        return { userMessage, assistantMessage, citations }
      } catch (error) {
        await repository.recordRun({
          ...runAudit({
            actor,
            conversation,
            correlationId,
            startedAt,
            safety: lastSafety,
            status: "failed",
            inputTokens: 0,
            outputTokens: 0,
            errorCode:
              error instanceof CopilotServiceError ? error.code : "provider_failed",
          }),
          messageId: null,
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
