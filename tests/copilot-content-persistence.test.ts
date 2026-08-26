import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"
import {
  PostgresCopilotRepository,
  type ContentProposalSavedContentDraft,
} from "../lib/ai/copilot/postgres-repository.ts"
import type { ContentProposal } from "../lib/ai/copilot/content-contracts.ts"
import { ProposalServiceError } from "../lib/ai/copilot/proposal-service.ts"

const teacherId = "11111111-1111-4111-8111-111111111111"
const anotherTeacherId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const conversationId = "22222222-2222-4222-8222-222222222222"
const proposalId = "33333333-3333-4333-8333-333333333333"
const contentItemId = "44444444-4444-4444-8444-444444444444"
const migrationUrl = new URL("../scripts/058_ai_copilot_content_proposals.sql", import.meta.url)
const migrateRunnerUrl = new URL("../scripts/migrate.mjs", import.meta.url)

const payload: ContentProposal = {
  module: "article",
  mode: "generate",
  draft: {
    module: "article",
    title: "Fotossíntese",
    bodyHtml: "<p>As plantas transformam energia luminosa.</p>",
  },
  changeSummary: "Cria um artigo curto sobre fotossíntese.",
  warnings: [],
  citations: [{
    kind: "internal",
    id: "chunk-1",
    title: "Material autorizado",
    url: "/conteudo/material-1",
    retrievedAt: "2026-08-25T12:00:00.000Z",
    excerpt: "As plantas transformam energia luminosa em energia química.",
  }],
  model: "gpt-5-mini",
  usage: { inputTokens: 120, outputTokens: 80 },
  safety: { decision: "approved", policyVersion: "content-v1", reasonCode: null },
}

const savedDraft: ContentProposalSavedContentDraft = {
  type: "article",
  title: payload.draft && "title" in payload.draft ? payload.draft.title : "Fotossíntese",
  bodyHtml: payload.draft && "bodyHtml" in payload.draft ? payload.draft.bodyHtml : null,
  status: "draft",
  visibility: "private",
  settings: {
    source: "copilot",
    citations: payload.citations,
  },
}

function proposalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: proposalId,
    teacher_id: teacherId,
    conversation_id: conversationId,
    module: payload.module,
    mode: payload.mode,
    original_content: null,
    payload,
    change_summary: payload.changeSummary,
    payload_hash: "content-hash",
    provider: "openai",
    model: payload.model,
    status: "proposed",
    idempotency_key: "content-proposal-key",
    content_item_id: null,
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
  transactionRolledBack = false

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(text: string, params?: unknown[]): Promise<Row[]> {
    this.queries.push({ text, params })
    return (this.rows.shift() ?? []) as Row[]
  }

  async transaction<T>(work: (client: { query: <Row extends Record<string, unknown> = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: Row[] }> }) => Promise<T>) {
    try {
      return await work({
        query: async <Row extends Record<string, unknown> = Record<string, unknown>>(text: string, params?: unknown[]) => {
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

class IdempotentProposalDatabase {
  insertAttempts = 0
  insertedRows = 0
  private proposal: ReturnType<typeof proposalRow> | null = null

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(text: string, params?: unknown[]): Promise<Row[]> {
    if (/insert into public\.ai_content_proposals/.test(text)) {
      this.insertAttempts++
      const payloadHash = params?.[7]
      const idempotencyKey = params?.[11]
      if (!this.proposal) {
        this.insertedRows++
        this.proposal = proposalRow({ payload_hash: payloadHash, idempotency_key: idempotencyKey })
        return [this.proposal] as unknown as Row[]
      }
      return this.proposal.payload_hash === payloadHash && this.proposal.idempotency_key === idempotencyKey
        ? [this.proposal] as unknown as Row[]
        : []
    }
    if (/select id\s+from public\.ai_content_proposals/.test(text)) {
      return this.proposal ? [{ id: this.proposal.id }] as unknown as Row[] : []
    }
    return []
  }

  async transaction<T>(_work: (client: never) => Promise<T>): Promise<T> {
    throw new Error("not_used")
  }
}

class ForeignContentOwnershipDatabase extends RecordingDatabase {
  override async transaction<T>(work: (client: {
    query: <Row extends Record<string, unknown> = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: Row[] }>
  }) => Promise<T>) {
    this.txRows = [
      { rows: [proposalRow()] },
      { rows: [{
        id: contentItemId,
        author_id: anotherTeacherId,
        type: "article",
        title: savedDraft.title,
        body_html: savedDraft.bodyHtml,
        status: "draft",
        visibility: "private",
        settings: savedDraft.settings,
      }] },
      new Error("insert or update on table ai_content_proposals violates foreign key constraint ai_content_proposals_content_item_owner_fkey"),
    ]
    return super.transaction(work)
  }
}

test("content proposal migration protects ownership, lifecycle, normalized payload and saved content", () => {
  assert.ok(existsSync(migrationUrl), "scripts/058_ai_copilot_content_proposals.sql must exist")
  const sql = readFileSync(migrationUrl, "utf8").replace(/\s+/g, " ").trim().toLowerCase()

  assert.match(sql, /create table if not exists public\.ai_content_proposals \(/)
  assert.match(sql, /teacher_id uuid not null references public\.profiles\(id\) on delete cascade/)
  assert.match(sql, /module text not null/)
  assert.match(sql, /mode text not null check \(mode in \('generate', 'review'\)\)/)
  assert.match(sql, /original_content jsonb/)
  assert.match(sql, /payload jsonb not null/)
  assert.match(sql, /change_summary text not null/)
  assert.match(sql, /payload_hash text not null/)
  assert.match(sql, /provider text not null/)
  assert.match(sql, /model text not null/)
  assert.match(sql, /status text not null default 'proposed'/)
  assert.match(sql, /idempotency_key text not null/)
  assert.match(sql, /unique \(teacher_id, idempotency_key\)/)
  assert.match(sql, /foreign key \(conversation_id, teacher_id\) references public\.ai_conversations\(id, teacher_id\) on delete cascade/)
  assert.match(sql, /check \(\(status = 'saved' and content_item_id is not null\) or \(status <> 'saved' and content_item_id is null\)\)/)
  assert.match(sql, /create index if not exists idx_ai_content_proposals_teacher_updated/)
  assert.match(sql, /create index if not exists idx_ai_content_proposals_teacher_status_updated/)
  assert.match(sql, /create index if not exists idx_ai_content_proposals_teacher_module_updated/)

  const runner = readFileSync(migrateRunnerUrl, "utf8").replace(/\s+/g, " ").trim().toLowerCase()
  assert.match(runner, /\["00620", "ai_content_proposals", "scripts\/058_ai_copilot_content_proposals\.sql"\]/)
})

test("content proposal migration makes saved content ownership a composite foreign-key contract", () => {
  // DATABASE_URL is not configured in this test environment, so this static assertion
  // documents the DDL contract that PostgreSQL will enforce during migration.
  const sql = readFileSync(migrationUrl, "utf8").replace(/\s+/g, " ").trim().toLowerCase()

  assert.match(sql, /add constraint content_items_id_author_id_key unique \(id, author_id\)/)
  assert.match(sql, /foreign key \(content_item_id, teacher_id\) references public\.content_items\(id, author_id\) on delete restrict/)
})

test("creates, reads, rejects and lists proposals through teacher-scoped SQL", async () => {
  const database = new RecordingDatabase()
  database.rows = [[proposalRow()], [proposalRow()], [proposalRow({ status: "rejected" })], [proposalRow()]]
  const repository = new PostgresCopilotRepository(database)

  const created = await repository.createContentProposal({
    teacherId,
    conversationId,
    module: payload.module,
    mode: payload.mode,
    originalContent: null,
    payload,
    payloadHash: "content-hash",
    provider: "openai",
    idempotencyKey: "content-proposal-key",
    status: "proposed",
  })
  const loaded = await repository.getContentProposal({ teacherId, proposalId: created.id })
  const rejected = await repository.rejectContentProposal({ teacherId, proposalId: created.id })
  const history = await repository.listContentProposals({ teacherId, module: "article", status: "proposed", limit: 10 })

  assert.equal(created.teacherId, teacherId)
  assert.equal(loaded?.id, proposalId)
  assert.equal(rejected?.status, "rejected")
  assert.equal(history.items.length, 1)
  assert.equal(database.queries.length, 4)
  assert.match(database.queries[0]!.text, /from public\.ai_conversations c/)
  assert.match(database.queries[0]!.text, /where c\.teacher_id = \$1\s+and c\.id = \$2/)
  assert.match(database.queries[0]!.text, /on conflict \(teacher_id, idempotency_key\)/)
  assert.match(database.queries[0]!.text, /where public\.ai_content_proposals\.payload_hash = excluded\.payload_hash/)
  assert.match(database.queries[1]!.text, /where teacher_id = \$1\s+and id = \$2/)
  assert.match(database.queries[2]!.text, /where teacher_id = \$1\s+and id = \$2\s+and status = 'proposed'/)
  assert.match(database.queries[3]!.text, /where teacher_id = \$1/)
  assert.match(database.queries[3]!.text, /and module = \$2/)
  assert.match(database.queries[3]!.text, /and status = \$3/)
})

test("returns the same content proposal for an idempotent retry and rejects a conflicting payload", async () => {
  const retryDatabase = new RecordingDatabase()
  retryDatabase.rows = [[proposalRow()]]
  const retryRepository = new PostgresCopilotRepository(retryDatabase)
  const first = await retryRepository.createContentProposal({
    teacherId, conversationId, module: payload.module, mode: payload.mode, originalContent: null,
    payload, payloadHash: "content-hash", provider: "openai", idempotencyKey: "content-proposal-key", status: "proposed",
  })
  assert.equal(first.id, proposalId)

  const conflictDatabase = new RecordingDatabase()
  conflictDatabase.rows = [[], [{ id: proposalId, payload_hash: "another-hash" }]]
  const conflictRepository = new PostgresCopilotRepository(conflictDatabase)
  await assert.rejects(
    conflictRepository.createContentProposal({
      teacherId, conversationId, module: payload.module, mode: payload.mode, originalContent: null,
      payload, payloadHash: "content-hash", provider: "openai", idempotencyKey: "content-proposal-key", status: "proposed",
    }),
    (error: unknown) => error instanceof ProposalServiceError && error.code === "content_idempotency_conflict",
  )
})

test("retries the same content proposal against persisted idempotency state without a duplicate insert", async () => {
  const database = new IdempotentProposalDatabase()
  const repository = new PostgresCopilotRepository(database)
  const input = {
    teacherId,
    conversationId,
    module: payload.module,
    mode: payload.mode,
    originalContent: null,
    payload,
    payloadHash: "content-hash",
    provider: "openai",
    idempotencyKey: "content-proposal-key",
    status: "proposed" as const,
  }

  const first = await repository.createContentProposal(input)
  const retry = await repository.createContentProposal(input)

  assert.equal(retry.id, first.id)
  assert.equal(retry.createdAt, first.createdAt)
  assert.equal(database.insertAttempts, 2)
  assert.equal(database.insertedRows, 1)
})

test("paginates content proposal history with the next keyset cursor and no duplicate items", async () => {
  const firstRow = proposalRow({ id: "55555555-5555-4555-8555-555555555555", updated_at: "2026-08-25T12:03:00.000Z" })
  const secondRow = proposalRow({ id: "66666666-6666-4666-8666-666666666666", updated_at: "2026-08-25T12:02:00.000Z" })
  const thirdRow = proposalRow({ id: "77777777-7777-4777-8777-777777777777", updated_at: "2026-08-25T12:01:00.000Z" })
  const database = new RecordingDatabase()
  database.rows = [[firstRow, secondRow, thirdRow], [thirdRow]]
  const repository = new PostgresCopilotRepository(database)

  const firstPage = await repository.listContentProposals({ teacherId, module: "article", status: "proposed", limit: 2 })
  const secondPage = await repository.listContentProposals({
    teacherId,
    module: "article",
    status: "proposed",
    limit: 2,
    cursor: firstPage.nextCursor,
  })

  assert.deepEqual(firstPage.items.map((item) => item.id), [firstRow.id, secondRow.id])
  assert.deepEqual(firstPage.nextCursor, { updatedAt: secondRow.updated_at, id: secondRow.id })
  assert.deepEqual(secondPage.items.map((item) => item.id), [thirdRow.id])
  assert.equal(secondPage.nextCursor, null)
  assert.equal(new Set([...firstPage.items, ...secondPage.items].map((item) => item.id)).size, 3)
  assert.match(database.queries[1]!.text, /\(updated_at, id\) < \(\$4::timestamptz, \$5::uuid\)/)
  assert.deepEqual(database.queries[1]!.params, [teacherId, "article", "proposed", secondRow.updated_at, secondRow.id, 3])
})

test("saves a private content draft transactionally and rolls back if proposal linkage fails", async () => {
  const database = new RecordingDatabase()
  database.txRows = [
    { rows: [proposalRow()] },
    { rows: [{ id: contentItemId, author_id: teacherId, type: "article", title: savedDraft.title, body_html: savedDraft.bodyHtml, status: "draft", visibility: "private", settings: savedDraft.settings }] },
    new Error("link_failed"),
  ]
  const repository = new PostgresCopilotRepository(database)

  await assert.rejects(
    repository.saveContentDraft({ teacherId, proposalId, contentDraft: savedDraft }),
    /link_failed/,
  )

  assert.equal(database.transactionRolledBack, true)
  assert.match(database.txQueries[0]!.text, /from public\.ai_content_proposals/)
  assert.match(database.txQueries[0]!.text, /where teacher_id = \$1\s+and id = \$2\s+for update/)
  assert.match(database.txQueries[1]!.text, /insert into public\.content_items/)
  assert.match(database.txQueries[1]!.text, /\$1, \$2, \$3, \$4, 'draft', 'private', \$5::jsonb/)
  assert.equal(database.txQueries[1]!.params?.[0], teacherId)
  assert.equal(database.txQueries[1]!.params?.[1], "article")
  assert.match(database.txQueries[2]!.text, /update public\.ai_content_proposals/)
  assert.match(database.txQueries[2]!.text, /where teacher_id = \$1\s+and id = \$2\s+and status = 'proposed'/)
})

test("rejects a proposal link to a content item owned by another teacher", async () => {
  const database = new ForeignContentOwnershipDatabase()
  const repository = new PostgresCopilotRepository(database)

  await assert.rejects(
    repository.saveContentDraft({ teacherId, proposalId, contentDraft: savedDraft }),
    /ai_content_proposals_content_item_owner_fkey/,
  )

  assert.equal(database.transactionRolledBack, true)
  assert.equal(database.txQueries[1]?.params?.[0], teacherId)
  assert.equal(database.txQueries[2]?.params?.[2], contentItemId)
})

test("saves one private content item and reuses it on a save retry", async () => {
  const database = new RecordingDatabase()
  const savedProposal = proposalRow({ status: "saved", content_item_id: contentItemId })
  const savedContentItem = {
    id: contentItemId,
    author_id: teacherId,
    type: "article",
    title: savedDraft.title,
    body_html: savedDraft.bodyHtml,
    status: "draft",
    visibility: "private",
    settings: savedDraft.settings,
  }
  database.txRows = [
    { rows: [proposalRow()] },
    { rows: [savedContentItem] },
    { rows: [savedProposal] },
    { rows: [savedProposal] },
    { rows: [savedContentItem] },
  ]
  const repository = new PostgresCopilotRepository(database)

  const first = await repository.saveContentDraft({ teacherId, proposalId, contentDraft: savedDraft })
  const retry = await repository.saveContentDraft({ teacherId, proposalId, contentDraft: savedDraft })

  assert.equal(first?.proposal.status, "saved")
  assert.equal(first?.proposal.contentItemId, contentItemId)
  assert.equal(retry?.contentItem.id, contentItemId)
  assert.equal(database.txQueries.filter((query) => /insert into public\.content_items/.test(query.text)).length, 1)
  assert.equal(database.txQueries.filter((query) => /values \(\s+\$1, \$2, \$3, \$4, 'draft', 'private'/.test(query.text)).length, 1)
})

test("does not load or mutate another teacher's content proposal", async () => {
  const database = new RecordingDatabase()
  database.rows = [[], []]
  const repository = new PostgresCopilotRepository(database)

  const loaded = await repository.getContentProposal({ teacherId: anotherTeacherId, proposalId })
  const rejected = await repository.rejectContentProposal({ teacherId: anotherTeacherId, proposalId })

  assert.equal(loaded, null)
  assert.equal(rejected, null)
  assert.match(database.queries[0]!.text, /where teacher_id = \$1\s+and id = \$2/)
  assert.equal(database.queries[0]!.params?.[0], anotherTeacherId)
  assert.match(database.queries[1]!.text, /where teacher_id = \$1\s+and id = \$2\s+and status = 'proposed'/)
  assert.equal(database.queries[1]!.params?.[0], anotherTeacherId)
})
