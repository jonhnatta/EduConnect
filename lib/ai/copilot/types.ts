import type { Citation, CopilotResponse } from "../contracts.ts"

export type CopilotActor = {
  userId: string
  userType: "professor" | "aluno"
}

export type CopilotConversation = {
  id: string
  teacherId: string
  title: string
  classroomId: string | null
  status: "active" | "archived" | "deleted"
  createdAt: string
  updatedAt: string
}

export type CopilotMessage = {
  id: string
  conversationId: string
  role: "user" | "assistant" | "system" | "tool"
  content: string
  status: "pending" | "streaming" | "completed" | "failed" | "cancelled" | "blocked"
  model: string | null
  provider: string | null
  promptVersion: string | null
  createdAt: string
  completedAt: string | null
  errorCode: string | null
}

export type CopilotMessageWrite = {
  teacherId: string
  conversationId: string
  role: CopilotMessage["role"]
  content: string
  status: CopilotMessage["status"]
  model: string | null
  provider: string | null
  promptVersion: string | null
  errorCode: string | null
}

export type CopilotCitation = {
  sourceId: string
  contentSourceId?: string
  sourceKind: Citation["kind"]
  title: string
  excerpt: string
  url: string
  retrievedAt: string
}

export type CopilotMessageCitation = CopilotCitation & {
  displayOrder: number
}

export type CopilotStoredCitation = CopilotMessageCitation & {
  messageId: string
}

export type CopilotMessageFeedback = {
  messageId: string
  rating: "positive" | "negative"
  comment: string | null
}

export type CopilotConversationDetail = {
  conversation: CopilotConversation
  messages: readonly CopilotMessage[]
  citationsByMessage: Record<string, CopilotMessageCitation[]>
  feedbackByMessage: Record<string, Omit<CopilotMessageFeedback, "messageId">>
}

export type CopilotDailyUsage = {
  usedRequests: number
  requestLimit: number
}

export type CopilotProviderInput = {
  system: string
  user: string
  context: string
  maxOutputTokens: number
}

export type CopilotProviderOutput = CopilotResponse

export type CopilotSafetyAudit = CopilotProviderOutput["safety"]

export type CopilotRun = {
  teacherId: string
  conversationId: string
  messageId: string | null
  feature: string
  provider: string
  model: string
  promptVersion: string
  correlationId: string
  latencyMs: number
  safety: CopilotSafetyAudit
  status: "completed" | "failed" | "blocked"
  inputTokens: number
  outputTokens: number
  errorCode: string | null
}

export type CopilotProvider = {
  readonly name: string
  readonly model: string
  generate(input: CopilotProviderInput): Promise<CopilotProviderOutput>
}

export type CopilotContextRequest = {
  teacherId: string
  query: string
  classroomId: string | null
  allowedClassroomIds: readonly string[]
}

export type CopilotContextRetriever = (
  input: CopilotContextRequest
) => Promise<readonly CopilotCitation[]>
