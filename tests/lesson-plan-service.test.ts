import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"
import { PostgresCopilotRepository } from "../lib/ai/copilot/postgres-repository.ts"
import {
  createLessonPlanService,
  LessonPlanServiceError,
  type LessonPlanProposalPayload,
  type LessonPlanProposalRepository,
  type StoredLessonPlanProposal,
} from "../lib/ai/copilot/lesson-plan-service.ts"

const teacherId = "11111111-1111-4111-8111-111111111111"
const conversationId = "22222222-2222-4222-8222-222222222222"
const proposalId = "33333333-3333-4333-8333-333333333333"
const contentItemId = "44444444-4444-4444-8444-444444444444"

const migrationUrl = new URL("../scripts/057_ai_lesson_plan_proposals.sql", import.meta.url)
const migrateRunnerUrl = new URL("../scripts/migrate.mjs", import.meta.url)

const draft = {
  title: "Plano de aula: Revolucao Industrial",
  objectives: ["Relacionar industrializacao e transformacoes sociais."],
  prerequisites: ["Nocoes basicas de capitalismo."],
  durationMinutes: 50,
  steps: [
    {
      title: "Problematizacao",
      minutes: 10,
      description: "Apresente imagens de fabricas e levante hipoteses com a turma.",
    },
    {
      title: "Sintese guiada",
      minutes: 25,
      description: "Conecte tecnologia, trabalho e urbanizacao usando o material indicado.",
    },
  ],
  materials: ["Projetor", "Texto de apoio"],
  activity: "Em duplas, os alunos comparam duas fontes e registram permanencias.",
  assessment: "Rubrica curta com participacao, uso de evidencia e clareza.",
  adaptations: ["Oferecer glossario para estudantes que precisarem de apoio."],
  citations: [
    {
      id: "material-1",
      kind: "internal" as const,
      title: "Material de historia",
      url: "/conteudo/material-1",
      retrievedAt: "2026-08-25T12:00:00.000Z",
      excerpt: "A industrializacao reorganizou trabalho, cidades e relacoes sociais.",
    },
  ],
}

const payload = {
  model: "gpt-5-mini-test",
  draft,
  citations: draft.citations,
  usage: { inputTokens: 120, outputTokens: 80 },
  safety: { decision: "approved" as const, policyVersion: "lesson-plan-test-v1" },
}

function stored(overrides: Partial<StoredLessonPlanProposal> = {}): StoredLessonPlanProposal {
  return {
    id: proposalId,
    teacherId,
    conversationId,
    status: "proposed",
    draft,
    model: payload.model,
    citations: draft.citations,
    usage: payload.usage,
    safety: payload.safety,
    contentItemId: null,
    payloadHash: "hash",
    idempotencyKey: "lesson-plan-key",
    createdAt: "2026-08-25T12:00:00.000Z",
    updatedAt: "2026-08-25T12:00:00.000Z",
    ...overrides,
  }
}

function proposalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: proposalId,
    teacher_id: teacherId,
    conversation_id: conversationId,
    status: "proposed",
    payload,
    payload_hash: "hash",
    idempotency_key: "lesson-plan-key",
    content_item_id: null,
    model: payload.model,
    created_at: "2026-08-25T12:00:00.000Z",
    updated_at: "2026-08-25T12:00:00.000Z",
    ...overrides,
  }
}

class RecordingDatabase {
  readonly queries: Array<{ text: string; params?: unknown[] }> = []
  readonly txQueries: Array<{ text: string; params?: unknown[] }> = []
  rows: unknown[][] = []
  txRows: Array<{ rows: unknown[] } | Error> = []
  transactionStarted = false
  transactionRolledBack = false

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<Row[]> {
    this.queries.push({ text, params })
    return (this.rows.shift() ?? []) as Row[]
  }

  async transaction<T>(
    work: (client: {
      query: <Row extends Record<string, unknown> = Record<string, unknown>>(
        text: string,
        params?: unknown[]
      ) => Promise<{ rows: Row[] }>
    }) => Promise<T>
  ) {
    this.transactionStarted = true
    try {
      return await work({
        query: async <Row extends Record<string, unknown> = Record<string, unknown>>(
          text: string,
          params?: unknown[]
        ) => {
          this.txQueries.push({ text, params })
          const next = this.txRows.shift() ?? { rows: [] }
          if (next instanceof Error) throw next
          return { rows: next.rows as Row[] }
        },
      })
    } catch (error) {
      this.transactionRolledBack = true
      throw error
    }
  }
}

class MemoryLessonPlanRepository implements LessonPlanProposalRepository {
  proposal: StoredLessonPlanProposal | null = null
  lastCreateInput: Parameters<LessonPlanProposalRepository["createProposal"]>[0] | null = null
  saveCount = 0
  readonly contentItems = new Map<string, {
    id: string
    authorId: string
    title: string
    bodyHtml: string
    status: string
    visibility: string
    settings: Record<string, unknown>
  }>()

  async createProposal(input: Parameters<LessonPlanProposalRepository["createProposal"]>[0]) {
    this.lastCreateInput = input
    if (this.proposal?.teacherId === input.teacherId && this.proposal.idempotencyKey === input.idempotencyKey) {
      return this.proposal
    }
    this.proposal = stored({
      teacherId: input.teacherId,
      conversationId: input.conversationId,
      status: input.status,
      draft: input.payload.draft,
      citations: input.payload.citations,
      usage: input.payload.usage,
      safety: input.payload.safety,
      idempotencyKey: input.idempotencyKey,
      payloadHash: input.payloadHash,
    })
    return this.proposal
  }

  async getProposal(input: Parameters<LessonPlanProposalRepository["getProposal"]>[0]) {
    if (this.proposal?.teacherId !== input.teacherId || this.proposal.id !== input.proposalId) {
      return null
    }
    return this.proposal
  }

  async rejectProposal(input: Parameters<LessonPlanProposalRepository["rejectProposal"]>[0]) {
    if (this.proposal?.teacherId !== input.teacherId || this.proposal.id !== input.proposalId) {
      return null
    }
    if (this.proposal.status !== "proposed") return this.proposal
    this.proposal = stored({ ...this.proposal, status: "rejected" })
    return this.proposal
  }

  async saveDraft(input: Parameters<LessonPlanProposalRepository["saveDraft"]>[0]) {
    if (this.proposal?.teacherId !== input.teacherId || this.proposal.id !== input.proposalId) {
      return null
    }
    if (this.proposal.contentItemId) {
      return {
        proposal: this.proposal,
        contentItem: this.contentItems.get(this.proposal.contentItemId)!,
      }
    }
    this.saveCount += 1
    const contentItem = {
      id: contentItemId,
      authorId: input.teacherId,
      title: input.contentDraft.title,
      bodyHtml: input.contentDraft.bodyHtml,
      status: input.contentDraft.status,
      visibility: input.contentDraft.visibility,
      settings: input.contentDraft.settings,
    }
    this.contentItems.set(contentItem.id, contentItem)
    this.proposal = stored({
      ...this.proposal,
      status: "saved",
      contentItemId: contentItem.id,
    })
    return { proposal: this.proposal, contentItem }
  }
}

test("lesson plan proposal migration defines ownership, status and idempotency constraints", () => {
  assert.ok(existsSync(migrationUrl), "scripts/057_ai_lesson_plan_proposals.sql must exist")
  const sql = readFileSync(migrationUrl, "utf8").replace(/\s+/g, " ").trim().toLowerCase()

  assert.match(sql, /create table if not exists public\.ai_lesson_plan_proposals \(/)
  assert.match(sql, /teacher_id uuid not null references public\.profiles\(id\) on delete cascade/)
  assert.match(sql, /conversation_id uuid not null/)
  assert.match(sql, /status text not null default 'proposed' check \(status in \('proposed', 'rejected', 'saved', 'blocked', 'failed'\)\)/)
  assert.match(sql, /payload jsonb not null/)
  assert.match(sql, /payload_hash text not null/)
  assert.match(sql, /model text not null/)
  assert.match(sql, /idempotency_key text not null/)
  assert.match(sql, /content_item_id uuid references public\.content_items\(id\) on delete restrict/)
  assert.match(sql, /check \(\(status = 'saved' and content_item_id is not null\) or \(status <> 'saved' and content_item_id is null\)\)/)
  assert.match(sql, /payload \? 'model'/)
  assert.match(sql, /payload->>'model' = model/)
  assert.match(sql, /safety_decision text/)
  assert.match(sql, /foreign key \(conversation_id, teacher_id\) references public\.ai_conversations\(id, teacher_id\) on delete cascade/)
  assert.match(sql, /unique \(teacher_id, idempotency_key\)/)
  assert.match(sql, /create index if not exists idx_ai_lesson_plan_proposals_teacher_created/)

  const runner = readFileSync(migrateRunnerUrl, "utf8").replace(/\s+/g, " ").trim().toLowerCase()
  assert.match(runner, /\["00610", "ai_lesson_plan_proposals", "scripts\/057_ai_lesson_plan_proposals\.sql"\]/)
})

test("creates, loads, rejects and converts a proposal into one server-owned draft", async () => {
  const repository = new MemoryLessonPlanRepository()
  const service = createLessonPlanService({ repository })

  const created = await service.createProposal({
    teacherId,
    conversationId,
    idempotencyKey: "lesson-plan-key",
    payload,
  })

  assert.equal(created.teacherId, teacherId)
  assert.equal(created.status, "proposed")
  assert.equal(created.model, payload.model)
  assert.deepEqual(created.citations, created.draft.citations)

  const loaded = await service.getProposal({ teacherId, proposalId: created.id })
  assert.equal(loaded?.id, created.id)

  const rejected = await service.rejectProposal({ teacherId, proposalId: created.id })
  assert.equal(rejected?.status, "rejected")

  const secondRepository = new MemoryLessonPlanRepository()
  const secondService = createLessonPlanService({ repository: secondRepository })
  const savable = await secondService.createProposal({
    teacherId,
    conversationId,
    idempotencyKey: "lesson-plan-key",
    payload,
  })

  const firstSave = await secondService.saveDraft({
    teacherId,
    proposalId: savable.id,
    draft: {
      ...draft,
      title: "Titulo editado pelo professor",
    },
    authorId: "99999999-9999-4999-8999-999999999999",
    status: "published",
  })
  const retrySave = await secondService.saveDraft({
    teacherId,
    proposalId: savable.id,
    draft,
    authorId: "99999999-9999-4999-8999-999999999999",
    status: "published",
  })

  assert.equal(secondRepository.saveCount, 1)
  assert.equal(firstSave?.contentItem.id, retrySave?.contentItem.id)
  assert.equal(firstSave?.proposal.status, "saved")
  assert.equal(firstSave?.contentItem.authorId, teacherId)
  assert.equal(firstSave?.contentItem.status, "draft")
  assert.equal(firstSave?.contentItem.visibility, "private")
  assert.equal(firstSave?.contentItem.title, "Titulo editado pelo professor")
  assert.equal(firstSave?.contentItem.settings.source, "copilot")
  assert.equal(firstSave?.contentItem.settings.conversationId, conversationId)
  assert.equal(firstSave?.contentItem.settings.proposalId, savable.id)
  assert.deepEqual(firstSave?.contentItem.settings.citations, draft.citations)
})

test("rejects an idempotency retry with the same key and a different payload", async () => {
  class ConflictingRepository extends MemoryLessonPlanRepository {
    override async createProposal(input: Parameters<LessonPlanProposalRepository["createProposal"]>[0]) {
      if (this.proposal?.teacherId === input.teacherId && this.proposal.idempotencyKey === input.idempotencyKey) {
        if (this.proposal.payloadHash !== input.payloadHash) {
          throw new LessonPlanServiceError("lesson_plan_idempotency_conflict")
        }
        return this.proposal
      }
      return super.createProposal(input)
    }
  }

  const service = createLessonPlanService({ repository: new ConflictingRepository() })
  await service.createProposal({
    teacherId,
    conversationId,
    idempotencyKey: "lesson-plan-key",
    payload,
  })

  await assert.rejects(
    service.createProposal({
      teacherId,
      conversationId,
      idempotencyKey: "lesson-plan-key",
      payload: {
        ...payload,
        draft: { ...payload.draft, title: "Outro plano valido" },
      },
    }),
    /lesson_plan_idempotency_conflict/
  )
})

test("rejects an idempotency retry with the same key and a different conversation", async () => {
  class ConflictingRepository extends MemoryLessonPlanRepository {
    override async createProposal(input: Parameters<LessonPlanProposalRepository["createProposal"]>[0]) {
      if (this.proposal?.teacherId === input.teacherId && this.proposal.idempotencyKey === input.idempotencyKey) {
        if (this.proposal.payloadHash !== input.payloadHash) {
          throw new LessonPlanServiceError("lesson_plan_idempotency_conflict")
        }
        return this.proposal
      }
      return super.createProposal(input)
    }
  }

  const service = createLessonPlanService({ repository: new ConflictingRepository() })
  await service.createProposal({
    teacherId,
    conversationId,
    idempotencyKey: "lesson-plan-key",
    payload,
  })

  await assert.rejects(
    service.createProposal({
      teacherId,
      conversationId: "55555555-5555-4555-8555-555555555555",
      idempotencyKey: "lesson-plan-key",
      payload,
    }),
    /lesson_plan_idempotency_conflict/
  )
})

test("normalizes the proposal payload before hashing and persistence", async () => {
  const repository = new MemoryLessonPlanRepository()
  const service = createLessonPlanService({ repository })
  const rawPayload = {
    ...payload,
    model: "  gpt-5-mini-test  ",
    draft: {
      ...draft,
      title: "  Plano de aula: Revolucao Industrial  ",
      ignoredBySchema: "remove-me",
    },
    ignoredBySchema: "remove-me",
  } as LessonPlanProposalPayload & { ignoredBySchema: string }

  const created = await service.createProposal({
    teacherId,
    conversationId,
    idempotencyKey: "lesson-plan-key",
    payload: rawPayload,
  })
  const createInput = repository.lastCreateInput!

  assert.equal(created.model, "gpt-5-mini-test")
  assert.equal(createInput.model, "gpt-5-mini-test")
  assert.equal(createInput.payload.model, "gpt-5-mini-test")
  assert.equal(createInput.payload.draft.title, "Plano de aula: Revolucao Industrial")
  assert.equal("ignoredBySchema" in createInput.payload, false)
  assert.equal("ignoredBySchema" in createInput.payload.draft, false)
  assert.equal(createInput.payloadHash, repository.proposal?.payloadHash)
})

test("Postgres repository creates proposals through teacher ownership and stable idempotency", async () => {
  const database = new RecordingDatabase()
  database.rows = [[proposalRow()]]
  const repository = new PostgresCopilotRepository(database)

  const created = await repository.createProposal({
    teacherId,
    conversationId,
    status: "proposed",
    payload,
    payloadHash: "hash",
    idempotencyKey: "lesson-plan-key",
    safetyDecision: "approved",
    model: payload.model,
  })

  assert.equal(created.teacherId, teacherId)
  assert.equal(created.model, payload.model)
  assert.equal(database.queries.length, 1)
  assert.match(database.queries[0]!.text, /from public\.ai_conversations c/)
  assert.match(database.queries[0]!.text, /where c\.teacher_id = \$1\s+and c\.id = \$2/)
  assert.match(database.queries[0]!.text, /on conflict \(teacher_id, idempotency_key\)/)
  assert.match(database.queries[0]!.text, /where public\.ai_lesson_plan_proposals\.payload_hash = excluded\.payload_hash/)
  assert.deepEqual(database.queries[0]!.params, [
    teacherId,
    conversationId,
    "proposed",
    JSON.stringify(payload),
    "hash",
    "lesson-plan-key",
    "approved",
    payload.model,
  ])
})

test("Postgres repository rejects conflicting idempotency keys without creating a second proposal", async () => {
  const database = new RecordingDatabase()
  database.rows = [[], [{ id: proposalId, payload_hash: "different-hash" }]]
  const repository = new PostgresCopilotRepository(database)

  await assert.rejects(
    repository.createProposal({
      teacherId,
      conversationId,
      status: "proposed",
      payload,
      payloadHash: "hash",
      idempotencyKey: "lesson-plan-key",
      safetyDecision: "approved",
      model: payload.model,
    }),
    /lesson_plan_idempotency_conflict/
  )

  assert.equal(database.queries.length, 2)
  assert.match(database.queries[1]!.text, /from public\.ai_lesson_plan_proposals/)
  assert.match(database.queries[1]!.text, /teacher_id = \$1\s+and idempotency_key = \$2/)
})

test("Postgres repository saves drafts inside a transaction and rolls back on proposal update failure", async () => {
  const database = new RecordingDatabase()
  database.txRows = [
    { rows: [proposalRow()] },
    {
      rows: [{
        id: contentItemId,
        author_id: teacherId,
        title: draft.title,
        body_html: "<h2>Plano</h2>",
        status: "draft",
        visibility: "private",
        settings: { source: "copilot" },
      }],
    },
    new Error("update_failed"),
  ]
  const repository = new PostgresCopilotRepository(database)

  await assert.rejects(
    repository.saveDraft({
      teacherId,
      proposalId,
      contentDraft: {
        title: draft.title,
        bodyHtml: "<h2>Plano</h2>",
        status: "draft",
        visibility: "private",
        settings: {
          source: "copilot",
          conversationId,
          proposalId,
          citations: draft.citations,
          lessonPlan: draft,
        },
      },
    }),
    /update_failed/
  )

  assert.equal(database.transactionStarted, true)
  assert.equal(database.transactionRolledBack, true)
  assert.match(database.txQueries[0]!.text, /for update/)
  assert.match(database.txQueries[1]!.text, /insert into public\.content_items/)
  assert.match(database.txQueries[1]!.text, /values \(\s+\$1, 'article', \$2, \$3, 'draft', 'private', \$4::jsonb/)
  assert.equal(database.txQueries[1]!.params?.[0], teacherId)
  assert.match(database.txQueries[2]!.text, /update public\.ai_lesson_plan_proposals/)
  assert.match(database.txQueries[2]!.text, /where teacher_id = \$1\s+and id = \$2\s+and status = 'proposed'/)
})

test("rejects non canonical proposal citations before persistence", async () => {
  const repository = new MemoryLessonPlanRepository()
  const service = createLessonPlanService({ repository })
  const invalidPayload = {
    ...payload,
    citations: [
      {
        id: "different-material",
        kind: "internal" as const,
        title: "Outro material",
        url: "/conteudo/outro",
        retrievedAt: "2026-08-25T12:00:00.000Z",
        excerpt: "Trecho divergente.",
      },
    ],
  }

  await assert.rejects(
    service.createProposal({
      teacherId,
      conversationId,
      idempotencyKey: "lesson-plan-key",
      payload: invalidPayload,
    }),
    /invalid_lesson_plan_proposal/
  )
})
