import { copilotResponseSchema, usageSchema, type Citation } from "../contracts.ts"
import { NoopTelemetry, type Telemetry } from "../telemetry/langfuse.ts"
import { evaluateCopilotInput } from "./guardrail.ts"
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
  CopilotConversationDetail,
  CopilotDailyUsage,
  CopilotMessage,
  CopilotMessageWrite,
  CopilotMessageCitation,
  CopilotMessageFeedback,
  CopilotProvider,
  CopilotRun,
  CopilotSafetyAudit,
  CopilotStoredCitation,
} from "./types.ts"

const HISTORY_LIMIT = 12
const DETAIL_MESSAGE_LIMIT = 100
const DEFAULT_TITLE = "Nova conversa"
const COPILOT_FEATURE = "teacher_copilot"
const PROMPT_VERSION = "copilot-professor-v1"
const COPILOT_MAX_OUTPUT_TOKENS = 1_000
const COPILOT_MAX_PROMPT_BYTES = 28_000
const COPILOT_RESERVED_TOKENS = 40_000
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
  listMessageCitations(
    teacherId: string,
    conversationId: string
  ): Promise<readonly CopilotStoredCitation[]>
  listMessageFeedback(
    teacherId: string,
    conversationId: string
  ): Promise<readonly CopilotMessageFeedback[]>
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
  checkAccess(input: {
    teacherId: string
  }): Promise<{ ok: true } | { ok: false; code: string }>
  reserve(input: {
    teacherId: string
    estimatedTokens: number
  }): Promise<
    | { ok: true; reservedTokens: number; usageDate: string }
    | { ok: false; code: string }
  >
  settle(input: {
    teacherId: string
    reservedTokens: number
    usageDate: string
    inputTokens: number
    outputTokens: number
  }): Promise<void>
  getDailyUsage(input: {
    teacherId: string
  }): Promise<CopilotDailyUsage>
}

export type CopilotServiceDependencies = {
  repository: CopilotRepository
  quota: CopilotQuota
  provider: CopilotProvider
  retrieveContext: CopilotContextRetriever
  telemetry?: Telemetry
}

type ActorInput = { actor: CopilotActor | null | undefined }

function requireProfessor(actor: CopilotActor | null | undefined): CopilotActor {
  if (!actor || actor.userType !== "professor" || actor.userId.trim() === "") {
    throw new CopilotServiceError("professor_required")
  }
  return actor
}

function estimatedTokens(_content: string): number {
  return COPILOT_RESERVED_TOKENS
}

function truncateUtf8(value: string, maxBytes: number, keepEnd = false): string {
  const bytes = Buffer.from(value, "utf8")
  if (bytes.length <= maxBytes) return value
  const truncated = keepEnd
    ? bytes.subarray(bytes.length - maxBytes).toString("utf8")
    : bytes.subarray(0, maxBytes).toString("utf8")
  return truncated.replace(keepEnd ? /^\uFFFD+/ : /\uFFFD+$/, "")
}

function boundedProviderPrompt(
  history: readonly CopilotMessage[],
  content: string,
  evidence: readonly CopilotCitation[]
) {
  const halfBudget = Math.floor((COPILOT_MAX_PROMPT_BYTES - 1) / 2)
  return {
    user: truncateUtf8(formatUserPrompt(history, content), halfBudget, true),
    context: truncateUtf8(formatContext(evidence), halfBudget),
  }
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

function groupCitations(
  citations: readonly CopilotStoredCitation[]
): CopilotConversationDetail["citationsByMessage"] {
  const grouped: CopilotConversationDetail["citationsByMessage"] = {}
  for (const { messageId, ...citation } of citations) {
    grouped[messageId] ??= []
    grouped[messageId]!.push(citation)
  }
  return grouped
}

function groupFeedback(
  feedbackRows: readonly CopilotMessageFeedback[]
): CopilotConversationDetail["feedbackByMessage"] {
  const grouped: CopilotConversationDetail["feedbackByMessage"] = {}
  for (const { messageId, ...feedback } of feedbackRows) {
    grouped[messageId] = feedback
  }
  return grouped
}

export function createCopilotService({
  repository,
  quota,
  provider,
  retrieveContext,
  telemetry = new NoopTelemetry(),
}: CopilotServiceDependencies) {
  const providerName = provider.name.trim()
  const providerModel = provider.model.trim()
  if (!providerName || !providerModel) {
    throw new TypeError("Copilot provider audit metadata is required")
  }

  async function requireCopilotAccess(
    actorInput: CopilotActor | null | undefined
  ): Promise<CopilotActor> {
    const actor = requireProfessor(actorInput)
    const access = await quota.checkAccess({ teacherId: actor.userId })
    if (!access.ok) throw new CopilotServiceError(access.code)
    return actor
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
      const actor = await requireCopilotAccess(input.actor)
      const parsed = conversationCreateSchema.parse({ title: input.title })
      return repository.createConversation({
        teacherId: actor.userId,
        title: parsed.title ?? DEFAULT_TITLE,
      })
    },

    async listConversations(input: ActorInput) {
      const actor = await requireCopilotAccess(input.actor)
      return repository.listConversations(actor.userId)
    },

    async getConversation(input: ActorInput & { conversationId: string }) {
      const actor = await requireCopilotAccess(input.actor)
      const conversation = await ownedConversation(actor, input.conversationId)
      const [messages, citations, feedback] = await Promise.all([
        repository.listMessages(actor.userId, conversation.id, DETAIL_MESSAGE_LIMIT),
        repository.listMessageCitations(actor.userId, conversation.id),
        repository.listMessageFeedback(actor.userId, conversation.id),
      ])
      return {
        conversation,
        messages,
        citationsByMessage: groupCitations(citations),
        feedbackByMessage: groupFeedback(feedback),
      }
    },

    async getDailyUsage(input: ActorInput) {
      const actor = await requireCopilotAccess(input.actor)
      return quota.getDailyUsage({ teacherId: actor.userId })
    },

    async sendMessage(
      input: ActorInput & { conversationId: string; content: string }
    ) {
      const actor = await requireCopilotAccess(input.actor)
      const startedAt = Date.now()
      const correlationId = crypto.randomUUID()
      const { content } = copilotMessageInputSchema.parse({ content: input.content })
      const conversation = await ownedConversation(actor, input.conversationId)

      const inputGuardrail = evaluateCopilotInput(content)
      if (!inputGuardrail.ok) {
        let blockedUserMessage: CopilotMessage | null = null
        try {
          return await telemetry.trace({
            name: "copilot.execution",
            metadata: {
              teacherId: actor.userId,
              conversationId: conversation.id,
              correlationId,
              provider: providerName,
              model: providerModel,
              decision: inputGuardrail.safety.decision,
              reasonCode: inputGuardrail.safety.reasonCode,
            },
          }, async () => {
            blockedUserMessage = await repository.appendMessage({
              teacherId: actor.userId,
              conversationId: conversation.id,
              role: "user",
              content,
              status: "blocked",
              model: null,
              provider: null,
              promptVersion: null,
              errorCode: "prompt_injection",
            })
            return persistBlockedResponse({
              actor,
              conversation,
              userMessage: blockedUserMessage,
              correlationId,
              startedAt,
              safety: inputGuardrail.safety,
              errorCode: "prompt_injection",
            })
          })
        } catch (error) {
          await repository.recordRun({
            ...runAudit({
              actor,
              conversation,
              correlationId,
              startedAt,
              safety: inputGuardrail.safety,
              status: "failed",
              inputTokens: 0,
              outputTokens: 0,
              errorCode: "message_persistence_failed",
            }),
            messageId: null,
          })
          throw error
        }
      }

      const reservation = await quota.reserve({
        teacherId: actor.userId,
        estimatedTokens: estimatedTokens(content),
      })
      if (!reservation.ok) throw new CopilotServiceError(reservation.code)

      let userMessage: CopilotMessage | null = null
      let lastSafety: CopilotSafetyAudit = {
        decision: "blocked",
        policyVersion: PROMPT_VERSION,
        reasonCode: "message_persistence_failed",
      }
      let failureCode = "message_persistence_failed"
      let actualUsage = { inputTokens: 0, outputTokens: 0 }
      let settlementUsage = { inputTokens: 0, outputTokens: 0 }
      try {
        const persistedUserMessage = await repository.appendMessage({
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
        userMessage = persistedUserMessage
        failureCode = "retrieval_failed"
        lastSafety = {
          decision: "blocked",
          policyVersion: PROMPT_VERSION,
          reasonCode: "retrieval_failed",
        }
        return await telemetry.trace({
          name: "copilot.execution",
          metadata: {
            teacherId: actor.userId,
            conversationId: conversation.id,
            correlationId,
            provider: providerName,
            model: providerModel,
          },
        }, async () => {
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
            lastSafety = {
              decision: "abstain",
              policyVersion: PROMPT_VERSION,
              reasonCode: "insufficient_context",
            }
            return persistBlockedResponse({
              actor,
              conversation,
              userMessage: persistedUserMessage,
              correlationId,
              startedAt,
              safety: lastSafety,
              errorCode: "insufficient_context",
            })
          }

          failureCode = "provider_failed"
          const prompt = boundedProviderPrompt(history, content, evidence)
          const providerOutput = await telemetry.wrap({
            name: "copilot.generate",
            metadata: {
              teacherId: actor.userId,
              conversationId: conversation.id,
              correlationId,
              provider: providerName,
              model: providerModel,
            },
          }, () => {
            settlementUsage = {
              inputTokens: reservation.reservedTokens,
              outputTokens: 0,
            }
            return provider.generate({
              system:
                "Voce e o Copilot do Professor. Responda somente com base no contexto autorizado.",
              user: prompt.user,
              context: prompt.context,
              maxOutputTokens: COPILOT_MAX_OUTPUT_TOKENS,
            })
          })
        const reportedUsage = usageSchema.safeParse(providerOutput.usage)
        if (
          reportedUsage.success &&
          reportedUsage.data.inputTokens + reportedUsage.data.outputTokens <=
            reservation.reservedTokens
        ) {
          actualUsage = reportedUsage.data
          settlementUsage = reportedUsage.data
        }
        const parsedOutput = copilotResponseSchema.safeParse(providerOutput)
        if (!parsedOutput.success || parsedOutput.data.text.trim() === "") {
          return persistBlockedResponse({
            actor,
            conversation,
            userMessage: persistedUserMessage,
            correlationId,
            startedAt,
            safety: {
              decision: "blocked",
              policyVersion: PROMPT_VERSION,
              reasonCode: "invalid_provider_output",
            },
            errorCode: "invalid_provider_output",
            inputTokens: actualUsage.inputTokens,
            outputTokens: actualUsage.outputTokens,
          })
        }

        const output = parsedOutput.data
        actualUsage = output.usage
        lastSafety = output.safety
        if (output.usage.outputTokens > COPILOT_MAX_OUTPUT_TOKENS) {
          lastSafety = {
            decision: "blocked",
            policyVersion: PROMPT_VERSION,
            reasonCode: "output_token_limit_exceeded",
          }
          return persistBlockedResponse({
            actor,
            conversation,
            userMessage: persistedUserMessage,
            correlationId,
            startedAt,
            safety: lastSafety,
            errorCode: "output_token_limit_exceeded",
            inputTokens: output.usage.inputTokens,
            outputTokens: output.usage.outputTokens,
          })
        }
        const citations = citationsSupportedBy(output.citations, evidence)
        const approved =
          output.safety.decision === "approved" ||
          output.safety.decision === "approved_with_warning"

        if (!approved) {
          return persistBlockedResponse({
            actor,
            conversation,
            userMessage: persistedUserMessage,
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
            userMessage: persistedUserMessage,
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
        return { userMessage: persistedUserMessage, assistantMessage, citations }
        })
      } catch (error) {
        await repository.recordRun({
          ...runAudit({
            actor,
            conversation,
            correlationId,
            startedAt,
            safety: lastSafety,
            status: "failed",
            inputTokens: actualUsage.inputTokens,
            outputTokens: actualUsage.outputTokens,
            errorCode:
              error instanceof CopilotServiceError ? error.code : failureCode,
          }),
          messageId: userMessage?.id ?? null,
        })
        throw error
      } finally {
        if (
          "reservedTokens" in reservation &&
          "usageDate" in reservation
        ) {
          await quota.settle({
            teacherId: actor.userId,
            reservedTokens: reservation.reservedTokens as number,
            usageDate: reservation.usageDate as string,
            ...settlementUsage,
          })
        }
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
      const actor = await requireCopilotAccess(input.actor)
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
