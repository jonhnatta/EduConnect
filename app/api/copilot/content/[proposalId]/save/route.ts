import { createDefaultContentApiHandlers } from "@/lib/ai/copilot/runtime"
export const runtime = "nodejs"
const handlers = createDefaultContentApiHandlers()
export const POST = handlers.save
