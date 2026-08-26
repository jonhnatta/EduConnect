import { createDefaultContentApiHandlers } from "@/lib/ai/copilot/runtime"
export const runtime = "nodejs"
const handlers = createDefaultContentApiHandlers()
export const GET = handlers.get
export const DELETE = handlers.reject
