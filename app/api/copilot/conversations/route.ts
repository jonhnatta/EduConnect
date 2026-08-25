import { createDefaultCopilotApiHandlers } from "@/lib/ai/copilot/runtime"

export const runtime = "nodejs"

const handlers = createDefaultCopilotApiHandlers()

export const GET = handlers.listConversations
export const POST = handlers.createConversation
