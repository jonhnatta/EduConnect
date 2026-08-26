import { ZodError, z } from "zod"
import {
  contentGenerationInputSchema,
  contentReviewInputSchema,
  toStudentContentDraft,
  type ContentProposal,
} from "./content-contracts.ts"
import { ContentServiceError } from "./content-service.ts"
import { ProposalServiceError, proposalPayloadHash, type ProposalStatus } from "./proposal-service.ts"
import type { ContentProposalRepository } from "./postgres-repository.ts"
import { CopilotServiceError } from "./service.ts"
import type { CopilotActor } from "./types.ts"
import { EXAM_VERSION } from "../../activities/exam.ts"

const envelope = z.object({
  conversationId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(200),
  request: z.object({}).passthrough(),
}).strict()
const params = z.object({ proposalId: z.string().uuid() })
const historyQuery = z.object({
  module: z.enum(["article", "exercise", "assessment", "simulado", "tip", "review", "performance", "classroom"]).optional(),
  status: z.enum(["proposed", "rejected", "saved", "blocked", "failed"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().regex(/^\d{4}-\d{2}-\d{2}T[^,]+,[0-9a-f-]{36}$/i).optional(),
}).strict()

type Service = {
  generateContent(input: { actor: CopilotActor; request: unknown }): Promise<ContentProposal>
  reviewContent(input: { actor: CopilotActor; request: unknown }): Promise<ContentProposal>
}
type Dependencies = { resolveActor(): Promise<CopilotActor | null>; service: Service; repository: ContentProposalRepository; provider: string }

function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store" } }) }
function noContent() { return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } }) }
function publicProposal(proposal: any) {
  const { teacherId: _teacherId, ...withoutTeacher } = proposal
  const payload = proposal.payload as ContentProposal
  const draft = payload.draft === null ? null : toStudentContentDraft(payload.draft)
  const originalContent = proposal.originalContent === null ? null : toStudentContentDraft(proposal.originalContent)
  return { ...withoutTeacher, ...payload, draft, originalContent, payload: { ...payload, draft } }
}
function teacherEditProposal(proposal: any) {
  const { teacherId: _teacherId, ...withoutTeacher } = proposal
  const payload = proposal.payload as ContentProposal
  return { ...withoutTeacher, ...payload, originalContent: proposal.originalContent, payload }
}
function errorResponse(error: unknown) {
  if (error instanceof ZodError) return json({ ok: false, error: "invalid_payload" }, 422)
  if (error instanceof ProposalServiceError) {
    if (error.code === "content_idempotency_conflict") return json({ ok: false, error: "idempotency_conflict" }, 409)
    return json({ ok: false, error: "proposal_conflict" }, 409)
  }
  if (error instanceof CopilotServiceError && error.code === "conversation_not_found") return json({ ok: false, error: "not_found" }, 404)
  if (error instanceof ContentServiceError) {
    if (["content_not_found", "classroom_not_found", "proposal_not_found"].includes(error.code)) return json({ ok: false, error: "not_found" }, 404)
    if (["professor_required", "professor_not_approved", "beta_disabled", "account_inactive", "individual_diagnosis_not_allowed"].includes(error.code)) return json({ ok: false, error: "forbidden" }, 403)
    if (error.code.includes("quota")) return json({ ok: false, error: "quota_exceeded" }, 429)
  }
  return json({ ok: false, error: "internal_error" }, 500)
}
async function jsonBody(request: Request) {
  try { return await request.json() } catch { throw new ZodError([]) }
}
async function requireProfessor(resolveActor: Dependencies["resolveActor"]) {
  const actor = await resolveActor()
  if (!actor) return { ok: false as const, response: json({ ok: false, error: "unauthorized" }, 401) }
  if (actor.userType !== "professor") return { ok: false as const, response: json({ ok: false, error: "forbidden" }, 403) }
  return { ok: true as const, actor }
}
function contentDraft(proposal: ContentProposal) {
  if (!proposal.draft) throw new ContentServiceError("invalid_provider_output")
  const draft: any = proposal.draft
  const type = draft.module === "tip" ? "dica" : draft.module
  const bodyHtml = "bodyHtml" in draft ? draft.bodyHtml : null
  const settings: Record<string, unknown> = { source: "copilot" }
  if ("questions" in draft) {
    settings.exam = {
      version: EXAM_VERSION,
      questions: draft.questions.map((question: any) => question.type === "mcq"
        ? { id: question.id, order: question.order, type: question.type, prompt: question.prompt, points: question.points, disciplina: question.disciplina ?? undefined, options: question.options, correctIndex: question.teacherAnswer.correctIndex }
        : { id: question.id, order: question.order, type: question.type, prompt: question.prompt, points: question.points, disciplina: question.disciplina ?? undefined }),
    }
    settings.copilotDraft = draft
  } else settings.copilotDraft = draft
  return { type, title: draft.title, bodyHtml, status: "draft" as const, visibility: "private" as const, settings }
}

function publicContentSettings(settings: Record<string, unknown>) {
  const exam = settings.exam
  if (!exam || typeof exam !== "object") return settings
  const questions: unknown[] = Array.isArray((exam as Record<string, unknown>).questions) ? (exam as Record<string, unknown>).questions as unknown[] : []
  return { ...settings, exam: { ...(exam as Record<string, unknown>), questions: questions.map((question: unknown) => { if (!question || typeof question !== "object") return question; const { correctIndex: _correctIndex, ...publicQuestion } = question as Record<string, unknown>; return publicQuestion }) } }
}

export function createContentApiHandlers(dependencies: Dependencies) {
  return {
    async generate(request: Request) {
      const access = await requireProfessor(dependencies.resolveActor); if (!access.ok) return access.response
      try {
        const body = envelope.parse(await jsonBody(request))
        const parsedRequest = body.request as Record<string, unknown>
        const parsed = parsedRequest.module === "review" ? contentReviewInputSchema.parse(body.request) : contentGenerationInputSchema.parse(body.request)
        const proposal = parsed.module === "review"
          ? await dependencies.service.reviewContent({ actor: access.actor, request: parsed })
          : await dependencies.service.generateContent({ actor: access.actor, request: parsed })
        const status: Exclude<ProposalStatus, "saved"> = proposal.safety.decision === "blocked" || proposal.safety.decision === "abstain" ? "blocked" : "proposed"
        const stored = await dependencies.repository.createContentProposal({
          teacherId: access.actor.userId, conversationId: body.conversationId, module: proposal.module, mode: proposal.mode,
          originalContent: parsed.module === "review" ? parsed.originalContent : null, payload: proposal,
          payloadHash: proposalPayloadHash({ conversationId: body.conversationId, status, payload: proposal }), provider: dependencies.provider,
          idempotencyKey: body.idempotencyKey, status,
        })
        return json({ ok: true, proposal: publicProposal(stored) }, 201)
      } catch (error) { return errorResponse(error) }
    },
    async get(_request: Request, context: { params: { proposalId: string } | Promise<{ proposalId: string }> }) {
      const access = await requireProfessor(dependencies.resolveActor); if (!access.ok) return access.response
      try { const { proposalId } = params.parse(await context.params); const found = await dependencies.repository.getContentProposal({ teacherId: access.actor.userId, proposalId }); return found ? json({ ok: true, proposal: publicProposal(found) }) : json({ ok: false, error: "not_found" }, 404) } catch (error) { return errorResponse(error) }
    },
    async edit(_request: Request, context: { params: { proposalId: string } | Promise<{ proposalId: string }> }) {
      const access = await requireProfessor(dependencies.resolveActor); if (!access.ok) return access.response
      try { const { proposalId } = params.parse(await context.params); const found = await dependencies.repository.getContentProposal({ teacherId: access.actor.userId, proposalId }); return found ? json({ ok: true, proposal: teacherEditProposal(found) }) : json({ ok: false, error: "not_found" }, 404) } catch (error) { return errorResponse(error) }
    },
    async reject(_request: Request, context: { params: { proposalId: string } | Promise<{ proposalId: string }> }) {
      const access = await requireProfessor(dependencies.resolveActor); if (!access.ok) return access.response
      try { const { proposalId } = params.parse(await context.params); const found = await dependencies.repository.rejectContentProposal({ teacherId: access.actor.userId, proposalId }); return found ? noContent() : json({ ok: false, error: "not_found" }, 404) } catch (error) { return errorResponse(error) }
    },
    async save(_request: Request, context: { params: { proposalId: string } | Promise<{ proposalId: string }> }) {
      const access = await requireProfessor(dependencies.resolveActor); if (!access.ok) return access.response
      try { const { proposalId } = params.parse(await context.params); const found = await dependencies.repository.getContentProposal({ teacherId: access.actor.userId, proposalId }); if (!found) return json({ ok: false, error: "not_found" }, 404); if (["performance", "classroom"].includes(found.module)) return json({ ok: false, error: "proposal_not_savable" }, 409); const result = await dependencies.repository.saveContentDraft({ teacherId: access.actor.userId, proposalId, contentDraft: contentDraft(found.payload) }); if (!result) return json({ ok: false, error: "not_found" }, 404); const { authorId: _authorId, ...publicContentItem } = result.contentItem; const settings = publicContentSettings(publicContentItem.settings); return json({ ok: true, proposal: publicProposal(result.proposal), contentItem: { ...publicContentItem, settings: { ...settings, copilotDraft: settings.copilotDraft ? toStudentContentDraft(settings.copilotDraft) : undefined } } }, 201) } catch (error) { return errorResponse(error) }
    },
    async history(request: Request) {
      const access = await requireProfessor(dependencies.resolveActor); if (!access.ok) return access.response
      try { const url = new URL(request.url); const query = historyQuery.parse(Object.fromEntries(url.searchParams)); const cursor = query.cursor ? (() => { const [updatedAt, id] = query.cursor!.split(","); return { updatedAt, id } })() : null; const page = await dependencies.repository.listContentProposals({ teacherId: access.actor.userId, module: query.module, status: query.status as ProposalStatus | undefined, limit: query.limit, cursor }); return json({ ok: true, proposals: page.items.map(publicProposal), nextCursor: page.nextCursor }) } catch (error) { return errorResponse(error) }
    },
  }
}
