import { createDefaultCopilotApiHandlers } from "@/lib/ai/copilot/runtime"

export const runtime = "nodejs"

const handlers = createDefaultCopilotApiHandlers()

export const POST = handlers.saveFeedback
