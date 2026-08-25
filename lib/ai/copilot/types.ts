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
  createdAt: string
  completedAt: string | null
}

export type CopilotCitation = {
  sourceId: string
  title: string
  excerpt: string
}

export type CopilotMessageCitation = CopilotCitation & {
  sourceKind: Citation["kind"]
  url: string
  retrievedAt: string
  displayOrder: number
}

export type CopilotProviderInput = {
  system: string
  user: string
  context: string
}

export type CopilotProviderOutput = CopilotResponse

export type CopilotProvider = {
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
