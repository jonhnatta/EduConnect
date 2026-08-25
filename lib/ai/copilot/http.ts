import { ZodError, z } from "zod"
import {
  CopilotServiceError,
  createCopilotService,
  type CopilotServiceDependencies,
} from "./service.ts"
import {
  conversationCreateSchema,
  copilotMessageInputSchema,
  feedbackSchema,
} from "./validation.ts"
import type { CopilotActor } from "./types.ts"

export { CopilotServiceError } from "./service.ts"

type RouteContext = {
  params: { conversationId: string } | Promise<{ conversationId: string }>
}

export type CopilotServiceApi = ReturnType<typeof createCopilotService>

export type CopilotApiDependencies = {
  resolveActor(): Promise<CopilotActor | null>
  service: CopilotServiceApi
}

const feedbackRequestSchema = feedbackSchema.extend({
  messageId: z.string().uuid(),
})
const conversationParamsSchema = z.object({
  conversationId: z.string().uuid(),
})

async function routeParams(context: RouteContext): Promise<{ conversationId: string }> {
  return conversationParamsSchema.parse(await context.params)
}

async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new ZodError([])
  }
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function noContent(): Response {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  })
}

function isQuotaError(code: string): boolean {
  return code === "daily_quota_exceeded" || code === "monthly_quota_exceeded"
}

function errorResponse(error: unknown): Response {
  if (error instanceof ZodError) {
    return json({ ok: false, error: "invalid_payload" }, 422)
  }
  if (error instanceof CopilotServiceError) {
    if (error.code === "conversation_not_found") {
      return json({ ok: false, error: "not_found" }, 404)
    }
    if (isQuotaError(error.code)) {
      return json({ ok: false, error: "quota_exceeded" }, 429)
    }
    if (error.code === "professor_required") {
      return json({ ok: false, error: "forbidden" }, 403)
    }
    if (error.code === "feature_disabled" || error.code === "beta_disabled") {
      return json({ ok: false, error: "copilot_unavailable" }, 403)
    }
  }
  return json({ ok: false, error: "internal_error" }, 500)
}

async function requireProfessor(resolveActor: CopilotApiDependencies["resolveActor"]) {
  const actor = await resolveActor()
  if (!actor) return { ok: false as const, response: json({ ok: false, error: "unauthorized" }, 401) }
  if (actor.userType !== "professor") {
    return { ok: false as const, response: json({ ok: false, error: "forbidden" }, 403) }
  }
  return { ok: true as const, actor }
}

export function createCopilotApiHandlers(dependencies: CopilotApiDependencies) {
  const { resolveActor, service } = dependencies

  return {
    async listConversations() {
      const access = await requireProfessor(resolveActor)
      if (!access.ok) return access.response
      try {
        const conversations = await service.listConversations({ actor: access.actor })
        return json({ ok: true, conversations })
      } catch (error) {
        return errorResponse(error)
      }
    },

    async createConversation(request: Request) {
      const access = await requireProfessor(resolveActor)
      if (!access.ok) return access.response
      try {
        const input = conversationCreateSchema.parse(await jsonBody(request))
        const conversation = await service.createConversation({
          actor: access.actor,
          title: input.title,
        })
        return json({ ok: true, conversation }, 201)
      } catch (error) {
        return errorResponse(error)
      }
    },

    async getConversation(_request: Request, context: RouteContext) {
      const access = await requireProfessor(resolveActor)
      if (!access.ok) return access.response
      try {
        const { conversationId } = await routeParams(context)
        const detail = await service.getConversation({
          actor: access.actor,
          conversationId,
        })
        return json({ ok: true, ...detail })
      } catch (error) {
        return errorResponse(error)
      }
    },

    async getDailyUsage() {
      const access = await requireProfessor(resolveActor)
      if (!access.ok) return access.response
      try {
        const usage = await service.getDailyUsage({ actor: access.actor })
        return json({ ok: true, usage })
      } catch (error) {
        return errorResponse(error)
      }
    },

    async sendMessage(request: Request, context: RouteContext) {
      const access = await requireProfessor(resolveActor)
      if (!access.ok) return access.response
      try {
        const { conversationId } = await routeParams(context)
        const input = copilotMessageInputSchema.parse(await jsonBody(request))
        const result = await service.sendMessage({
          actor: access.actor,
          conversationId,
          content: input.content,
        })
        return json({ ok: true, ...result }, 201)
      } catch (error) {
        return errorResponse(error)
      }
    },

    async saveFeedback(request: Request, context: RouteContext) {
      const access = await requireProfessor(resolveActor)
      if (!access.ok) return access.response
      try {
        const { conversationId } = await routeParams(context)
        const input = feedbackRequestSchema.parse(await jsonBody(request))
        await service.saveFeedback({
          actor: access.actor,
          conversationId,
          messageId: input.messageId,
          rating: input.rating,
          comment: input.comment,
        })
        return noContent()
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}

export function createCopilotApiHandlersFromService(
  resolveActor: CopilotApiDependencies["resolveActor"],
  dependencies: CopilotServiceDependencies
) {
  return createCopilotApiHandlers({
    resolveActor,
    service: createCopilotService(dependencies),
  })
}
