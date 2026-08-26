import assert from "node:assert/strict"
import test from "node:test"
import { createContentApiHandlers } from "../lib/ai/copilot/content-http.ts"
import type { ContentProposal } from "../lib/ai/copilot/content-contracts.ts"
import type {
  ContentProposalRepository,
  ContentProposalSavedContentDraft,
  SavedContentProposalItem,
  StoredContentProposal,
} from "../lib/ai/copilot/postgres-repository.ts"
import { ContentServiceError } from "../lib/ai/copilot/content-service.ts"
import { ProposalServiceError } from "../lib/ai/copilot/proposal-service.ts"
import { CopilotServiceError } from "../lib/ai/copilot/service.ts"
import type { CopilotActor } from "../lib/ai/copilot/types.ts"

const teacher: CopilotActor = {
  userId: "11111111-1111-4111-8111-111111111111",
  userType: "professor",
}
const student: CopilotActor = {
  userId: "22222222-2222-4222-8222-222222222222",
  userType: "aluno",
}
const anotherTeacherId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const conversationId = "33333333-3333-4333-8333-333333333333"
const proposalId = "44444444-4444-4444-8444-444444444444"
const contentItemId = "55555555-5555-4555-8555-555555555555"

function proposal(overrides: Partial<ContentProposal> = {}): ContentProposal {
  return {
    module: "assessment",
    mode: "generate",
    draft: {
      module: "assessment",
      title: "Avaliação de fotossíntese",
      instructions: "Responda às questões.",
      questions: [{
        id: "questao-1",
        order: 1,
        type: "mcq",
        prompt: "Qual processo produz glicose?",
        points: 1,
        disciplina: null,
        options: ["Fotossíntese", "Respiração"],
        teacherAnswer: { correctIndex: 0, rationale: "A fotossíntese produz glicose." },
      }],
    },
    changeSummary: "Cria uma avaliação introdutória.",
    warnings: [],
    citations: [{
      kind: "internal",
      id: "chunk-1",
      title: "Material autorizado",
      url: "/conteudo/material-1",
      retrievedAt: "2026-08-25T12:00:00.000Z",
      excerpt: "A fotossíntese produz glicose a partir de energia luminosa.",
    }],
    model: "test-model",
    usage: { inputTokens: 100, outputTokens: 80 },
    safety: { decision: "approved", policyVersion: "content-test-v1", reasonCode: null },
    ...overrides,
  }
}

function stored(overrides: Partial<StoredContentProposal> = {}): StoredContentProposal {
  return {
    id: proposalId,
    teacherId: teacher.userId,
    conversationId,
    module: "assessment",
    mode: "generate",
    originalContent: null,
    payload: proposal(),
    changeSummary: "Cria uma avaliação introdutória.",
    provider: "openai",
    model: "test-model",
    status: "proposed",
    contentItemId: null,
    payloadHash: "hash",
    idempotencyKey: "content-key",
    createdAt: "2026-08-25T12:00:00.000Z",
    updatedAt: "2026-08-25T12:00:00.000Z",
    ...overrides,
  }
}

function request(path: string, body: unknown): Request {
  return new Request(`https://educonnect.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function assertTeacherDataHidden(value: unknown) {
  if (Array.isArray(value)) return value.forEach(assertTeacherDataHidden)
  if (!value || typeof value !== "object") return
  for (const [key, nested] of Object.entries(value)) {
    assert.notEqual(key, "teacherId")
    assert.notEqual(key, "teacherAnswer")
    assert.notEqual(key, "authorId")
    assertTeacherDataHidden(nested)
  }
}

function setup(options: {
  actor?: CopilotActor | null
  generate?: (input: { actor: CopilotActor; request: unknown }) => Promise<ContentProposal>
  review?: (input: { actor: CopilotActor; request: unknown }) => Promise<ContentProposal>
  proposal?: StoredContentProposal | null
  createError?: Error
  saveError?: Error
} = {}) {
  const calls: Record<string, unknown[]> = { generate: [], review: [], create: [], get: [], reject: [], save: [], list: [] }
  let current = options.proposal === undefined ? stored() : options.proposal
  const repository: ContentProposalRepository = {
    async createContentProposal(input) {
      calls.create.push(input)
      if (options.createError) throw options.createError
      current = stored({
        teacherId: input.teacherId,
        conversationId: input.conversationId,
        module: input.module,
        mode: input.mode,
        originalContent: input.originalContent ?? null,
        payload: input.payload,
        changeSummary: input.payload.changeSummary,
        provider: input.provider,
        model: input.payload.model,
        status: input.status,
        idempotencyKey: input.idempotencyKey,
        payloadHash: input.payloadHash,
      })
      return current
    },
    async getContentProposal(input) {
      calls.get.push(input)
      return current?.teacherId === input.teacherId && current.id === input.proposalId ? current : null
    },
    async rejectContentProposal(input) {
      calls.reject.push(input)
      if (!current || current.teacherId !== input.teacherId || current.id !== input.proposalId) return null
      current = { ...current, status: "rejected" }
      return current
    },
    async saveContentDraft(input) {
      calls.save.push(input)
      if (options.saveError) throw options.saveError
      if (!current || current.teacherId !== input.teacherId || current.id !== input.proposalId) return null
      const contentItem: SavedContentProposalItem = {
        id: contentItemId,
        authorId: input.teacherId,
        type: input.contentDraft.type,
        title: input.contentDraft.title,
        bodyHtml: input.contentDraft.bodyHtml,
        status: "draft",
        visibility: "private",
        settings: input.contentDraft.settings,
      }
      current = { ...current, status: "saved", contentItemId }
      return { proposal: current, contentItem }
    },
    async listContentProposals(input) {
      calls.list.push(input)
      return { items: current?.teacherId === input.teacherId ? [current] : [], nextCursor: null }
    },
  }
  const handlers = createContentApiHandlers({
    resolveActor: async () => options.actor === undefined ? teacher : options.actor,
    service: {
      generateContent: async (input) => {
        calls.generate.push(input)
        return options.generate ? options.generate(input) : proposal()
      },
      reviewContent: async (input) => {
        calls.review.push(input)
        return options.review ? options.review(input) : proposal({ module: "review", mode: "review" })
      },
    },
    repository,
    provider: "openai",
  })
  return { calls, handlers }
}

const generateInput = {
  conversationId,
  idempotencyKey: "content-key",
  request: {
    module: "assessment",
    topic: "Fotossíntese",
    audience: "8º ano",
    objective: "Verificar a compreensão do processo.",
    sourceIds: [],
    questionCount: 1,
  },
}

test("returns 401 and 403 before content services are called", async () => {
  const anonymous = setup({ actor: null })
  const unauthorized = await anonymous.handlers.generate(request("/api/copilot/content", generateInput))
  assert.equal(unauthorized.status, 401)
  assert.deepEqual(await unauthorized.json(), { ok: false, error: "unauthorized" })
  assert.equal(anonymous.calls.generate.length, 0)

  const nonProfessor = setup({ actor: student })
  const forbidden = await nonProfessor.handlers.generate(request("/api/copilot/content", generateInput))
  assert.equal(forbidden.status, 403)
  assert.deepEqual(await forbidden.json(), { ok: false, error: "forbidden" })
  assert.equal(nonProfessor.calls.generate.length, 0)
})

test("generates, persists, and returns a DTO without teacher answers", async () => {
  const { calls, handlers } = setup()
  const response = await handlers.generate(request("/api/copilot/content", generateInput))

  assert.equal(response.status, 201)
  const body = await response.json()
  assert.equal(body.ok, true)
  assert.equal(body.proposal.status, "proposed")
  assert.equal(body.proposal.payload.draft.questions[0].teacherAnswer, undefined)
  assertTeacherDataHidden(body)
  assert.deepEqual(calls.generate[0], { actor: teacher, request: generateInput.request })
  assert.equal((calls.create[0] as { teacherId: string }).teacherId, teacher.userId)
})

test("reviews only a strict review payload and persists the server-derived status", async () => {
  const { calls, handlers } = setup()
  const response = await handlers.generate(request("/api/copilot/content", {
    conversationId,
    idempotencyKey: "review-key",
    request: {
      module: "review",
      targetModule: "article",
      objective: "Tornar o texto mais claro.",
      notes: "",
      sourceIds: [],
      originalContent: { module: "article", title: "Luz", bodyHtml: "<p>Texto inicial.</p>" },
    },
  }))

  assert.equal(response.status, 201)
  assert.equal(calls.review.length, 1)
  assert.equal((calls.create[0] as { status: string }).status, "proposed")
})

test("rejects invalid and authority-bearing request bodies with 422", async () => {
  const { calls, handlers } = setup()
  const invalid = await handlers.generate(request("/api/copilot/content", {
    ...generateInput,
    teacherId: anotherTeacherId,
  }))
  assert.equal(invalid.status, 422)
  assert.deepEqual(await invalid.json(), { ok: false, error: "invalid_payload" })
  assert.equal(calls.generate.length, 0)
})

test("rejects malformed JSON and a null request with 422", async () => {
  const { calls, handlers } = setup()
  const malformed = await handlers.generate(new Request("https://educonnect.test/api/copilot/content", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  }))
  assert.equal(malformed.status, 422)
  assert.deepEqual(await malformed.json(), { ok: false, error: "invalid_payload" })

  const nullRequest = await handlers.generate(request("/api/copilot/content", { ...generateInput, request: null }))
  assert.equal(nullRequest.status, 422)
  assert.deepEqual(await nullRequest.json(), { ok: false, error: "invalid_payload" })
  assert.equal(calls.generate.length, 0)
})

test("maps content proposal errors to stable statuses", async () => {
  const conflict = setup({ createError: new ProposalServiceError("content_idempotency_conflict") })
  const conflictResponse = await conflict.handlers.generate(request("/api/copilot/content", generateInput))
  assert.equal(conflictResponse.status, 409)
  assert.deepEqual(await conflictResponse.json(), { ok: false, error: "idempotency_conflict" })

  const missingConversation = setup({ createError: new CopilotServiceError("conversation_not_found") })
  const missingResponse = await missingConversation.handlers.generate(request("/api/copilot/content", generateInput))
  assert.equal(missingResponse.status, 404)
  assert.deepEqual(await missingResponse.json(), { ok: false, error: "not_found" })

  const saveConflict = setup({ saveError: new ProposalServiceError("content_proposal_save_conflict") })
  const saveResponse = await saveConflict.handlers.save(new Request("https://educonnect.test/api/copilot/content/" + proposalId + "/save", { method: "POST" }), { params: { proposalId } })
  assert.equal(saveResponse.status, 409)
  assert.deepEqual(await saveResponse.json(), { ok: false, error: "proposal_conflict" })
})

test("maps quota errors to 429", async () => {
  const { handlers } = setup({
    generate: async () => { throw new ContentServiceError("daily_quota_exceeded") },
  })
  const response = await handlers.generate(request("/api/copilot/content", generateInput))
  assert.equal(response.status, 429)
  assert.deepEqual(await response.json(), { ok: false, error: "quota_exceeded" })
})

test("reads, rejects, saves, and hides another teacher's proposal as 404", async () => {
  const own = setup()
  const read = await own.handlers.get(new Request("https://educonnect.test/api/copilot/content/" + proposalId), { params: { proposalId } })
  assert.equal(read.status, 200)
  assertTeacherDataHidden(await read.clone().json())

  const rejected = await own.handlers.reject(new Request("https://educonnect.test/api/copilot/content/" + proposalId, { method: "DELETE" }), { params: { proposalId } })
  assert.equal(rejected.status, 204)

  const savable = setup()
  const saved = await savable.handlers.save(new Request("https://educonnect.test/api/copilot/content/" + proposalId + "/save", { method: "POST" }), { params: { proposalId } })
  assert.equal(saved.status, 201)
  const savedBody = await saved.json()
  assertTeacherDataHidden(savedBody)
  assert.equal((savable.calls.save[0] as { contentDraft: ContentProposalSavedContentDraft }).contentDraft.type, "assessment")

  const foreign = setup({ proposal: stored({ teacherId: anotherTeacherId }) })
  const missing = await foreign.handlers.get(new Request("https://educonnect.test/api/copilot/content/" + proposalId), { params: { proposalId } })
  assert.equal(missing.status, 404)
  assert.deepEqual(await missing.json(), { ok: false, error: "not_found" })
})

test("does not save performance or classroom proposals as content items", async () => {
  for (const proposalModule of ["performance", "classroom"] as const) {
    const { calls, handlers } = setup({ proposal: stored({
      module: proposalModule,
      payload: proposal({
        module: proposalModule,
        draft: proposalModule === "performance"
          ? { module: proposalModule, overview: "Visão agregada da turma.", findings: ["Há lacunas."], recommendations: ["Retome o tema."] }
          : { module: proposalModule, title: "Atividade em grupo", activity: "Debatam os conceitos.", rationale: "Consolida a aprendizagem." },
      }),
    }) })
    const response = await handlers.save(new Request("https://educonnect.test/api/copilot/content/" + proposalId + "/save", { method: "POST" }), { params: { proposalId } })
    assert.equal(response.status, 409)
    assert.deepEqual(await response.json(), { ok: false, error: "proposal_not_savable" })
    assert.equal(calls.save.length, 0)
  }
})

test("lists teacher-scoped history with validated filters and cursor", async () => {
  const { calls, handlers } = setup()
  const response = await handlers.history(new Request(
    "https://educonnect.test/api/copilot/content/history?module=assessment&status=proposed&limit=10&cursor=2026-08-25T12%3A00%3A00.000Z," + proposalId,
  ))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.proposals.length, 1)
  assertTeacherDataHidden(body)
  assert.deepEqual(calls.list[0], {
    teacherId: teacher.userId,
    module: "assessment",
    status: "proposed",
    limit: 10,
    cursor: { updatedAt: "2026-08-25T12:00:00.000Z", id: proposalId },
  })

  const invalid = await handlers.history(new Request("https://educonnect.test/api/copilot/content/history?status=admin"))
  assert.equal(invalid.status, 422)
})
