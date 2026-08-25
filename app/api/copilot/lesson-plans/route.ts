import { createDefaultLessonPlanApiHandlers } from "@/lib/ai/copilot/runtime"
export const runtime = "nodejs"
const handlers = createDefaultLessonPlanApiHandlers()
export const POST = handlers.generate
