import { createDefaultLessonPlanApiHandlers } from "@/lib/ai/copilot/runtime"
export const runtime = "nodejs"
const handlers = createDefaultLessonPlanApiHandlers()
export const GET = handlers.get
export const DELETE = handlers.reject
