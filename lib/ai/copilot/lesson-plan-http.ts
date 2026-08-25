import { ZodError, z } from "zod"
import { lessonPlanInputSchema } from "./lesson-plan.ts"
import { CopilotServiceError } from "./service.ts"
import type { CopilotActor } from "./types.ts"

const paramsSchema = z.object({ proposalId: z.string().uuid() })
const generateSchema = z.object({
  conversationId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(200),
  request: lessonPlanInputSchema,
})

type Dependencies = {
  resolveActor(): Promise<CopilotActor | null>
  service: ReturnType<typeof import("./lesson-plan-service.ts").createLessonPlanService>
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } })
}
function error(error: unknown) {
  if (error instanceof ZodError) return json({ ok: false, error: "invalid_payload" }, 422)
  if (error instanceof CopilotServiceError) {
    if (error.code === "conversation_not_found" || error.code === "proposal_not_found") return json({ ok: false, error: "not_found" }, 404)
    if (error.code.includes("quota")) return json({ ok: false, error: "quota_exceeded" }, 429)
    if (["professor_required", "professor_not_approved", "beta_disabled", "account_inactive"].includes(error.code)) return json({ ok: false, error: "forbidden" }, 403)
  }
  return json({ ok: false, error: "internal_error" }, 500)
}
async function actor(resolveActor: Dependencies["resolveActor"]) {
  const found = await resolveActor()
  if (!found) return { ok: false as const, response: json({ ok: false, error: "unauthorized" }, 401) }
  if (found.userType !== "professor") return { ok: false as const, response: json({ ok: false, error: "forbidden" }, 403) }
  return { ok: true as const, actor: found }
}
async function body(request: Request) { return await request.json().catch(() => { throw new ZodError([]) }) }

export function createLessonPlanApiHandlers({ resolveActor, service }: Dependencies) {
  return {
    async generate(request: Request) {
      const access = await actor(resolveActor); if (!access.ok) return access.response
      try {
        const input = generateSchema.parse(await body(request))
        const proposal = await service.generateProposal({ actor: access.actor, ...input })
        return json({ ok: true, proposal }, 201)
      } catch (e) { return error(e) }
    },
    async get(_request: Request, context: { params: Promise<{ proposalId: string }> }) {
      const access = await actor(resolveActor); if (!access.ok) return access.response
      try {
        const { proposalId } = paramsSchema.parse(await context.params)
        const proposal = await service.getProposal({ teacherId: access.actor.userId, proposalId })
        return proposal ? json({ ok: true, proposal }) : json({ ok: false, error: "not_found" }, 404)
      } catch (e) { return error(e) }
    },
    async reject(_request: Request, context: { params: Promise<{ proposalId: string }> }) {
      const access = await actor(resolveActor); if (!access.ok) return access.response
      try {
        const { proposalId } = paramsSchema.parse(await context.params)
        const proposal = await service.rejectProposal({ teacherId: access.actor.userId, proposalId })
        return proposal ? json({ ok: true, proposal }) : json({ ok: false, error: "not_found" }, 404)
      } catch (e) { return error(e) }
    },
    async save(_request: Request, context: { params: Promise<{ proposalId: string }> }) {
      const access = await actor(resolveActor); if (!access.ok) return access.response
      try {
        const { proposalId } = paramsSchema.parse(await context.params)
        const result = await service.saveDraft({ teacherId: access.actor.userId, proposalId })
        return result ? json({ ok: true, ...result }, 201) : json({ ok: false, error: "not_found" }, 404)
      } catch (e) { return error(e) }
    },
  }
}
