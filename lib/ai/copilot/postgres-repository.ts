import { createHash } from "node:crypto"
import type { QueryResultRow } from "pg"
import {
  CopilotServiceError,
  type CopilotRepository,
} from "./service.ts"
import type {
  CopilotConversation,
  CopilotMessage,
  CopilotMessageCitation,
  CopilotMessageFeedback,
  CopilotMessageWrite,
  CopilotRun,
  CopilotStoredCitation,
} from "./types.ts"
import type {
  LessonPlanProposalPayload,
  LessonPlanProposalRepository,
  LessonPlanSavedContentItem,
  StoredLessonPlanProposal,
} from "./lesson-plan-service.ts"
import { LessonPlanServiceError } from "./lesson-plan-service.ts"
import type {
  ContentModule,
  ContentProposal,
  TeacherContentDraft,
} from "./content-contracts.ts"
import type { ProposalStatus, StoredProposal } from "./proposal-service.ts"
import { ProposalServiceError } from "./proposal-service.ts"

type ConversationRow = QueryResultRow & {
  id: string
  teacher_id: string
  title: string
  classroom_id: string | null
  status: CopilotConversation["status"]
  created_at: Date | string
  updated_at: Date | string
}

type MessageRow = QueryResultRow & {
  id: string
  conversation_id: string
  role: CopilotMessage["role"]
  content: string
  status: CopilotMessage["status"]
  model: string | null
  provider: string | null
  prompt_version: string | null
  created_at: Date | string
  completed_at: Date | string | null
  error_code: string | null
}

type CitationRow = QueryResultRow & {
  message_id: string
  source_kind: CopilotStoredCitation["sourceKind"]
  source_id: string | null
  title: string
  excerpt: string | null
  url: string | null
  retrieved_at: Date | string
  display_order: number
}

type FeedbackRow = QueryResultRow & {
  message_id: string
  rating: CopilotMessageFeedback["rating"]
  comment: string | null
}

type LessonPlanProposalRow = QueryResultRow & {
  id: string
  teacher_id: string
  conversation_id: string
  status: StoredLessonPlanProposal["status"]
  payload: LessonPlanProposalPayload | string
  payload_hash: string
  idempotency_key: string
  content_item_id: string | null
  model: string
  created_at: Date | string
  updated_at: Date | string
}

type LessonPlanContentItemRow = QueryResultRow & {
  id: string
  author_id: string
  title: string
  body_html: string
  status: string
  visibility: string
  settings: Record<string, unknown> | string
}

type ContentProposalRow = QueryResultRow & {
  id: string
  teacher_id: string
  conversation_id: string
  module: ContentModule
  mode: ContentProposal["mode"]
  original_content: TeacherContentDraft | string | null
  payload: ContentProposal | string
  change_summary: string
  payload_hash: string
  provider: string
  model: string
  status: ProposalStatus
  idempotency_key: string
  content_item_id: string | null
  created_at: Date | string
  updated_at: Date | string
}

type ContentItemRow = QueryResultRow & {
  id: string
  author_id: string
  type: ContentProposalSavedContentDraft["type"]
  title: string
  body_html: string | null
  status: "draft"
  visibility: "private"
  settings: Record<string, unknown> | string
}

export type ContentProposalSavedContentDraft = {
  type: "article" | "exercise" | "assessment" | "simulado" | "dica"
  title: string
  bodyHtml: string | null
  status: "draft"
  visibility: "private"
  settings: Record<string, unknown>
}

export type SavedContentProposalItem = {
  id: string
  authorId: string
  type: ContentProposalSavedContentDraft["type"]
  title: string
  bodyHtml: string | null
  status: "draft"
  visibility: "private"
  settings: Record<string, unknown>
}

export type StoredContentProposal = StoredProposal & {
  module: ContentModule
  mode: ContentProposal["mode"]
  originalContent: TeacherContentDraft | null
  payload: ContentProposal
  changeSummary: string
  provider: string
  model: string
}

export type ContentProposalCursor = {
  updatedAt: string
  id: string
}

export type ContentProposalPage = {
  items: readonly StoredContentProposal[]
  nextCursor: ContentProposalCursor | null
}

export type ContentProposalRepository = {
  createContentProposal(input: {
    teacherId: string
    conversationId: string
    module: ContentModule
    mode: ContentProposal["mode"]
    originalContent?: TeacherContentDraft | null
    payload: ContentProposal
    payloadHash: string
    provider: string
    idempotencyKey: string
    status: Exclude<ProposalStatus, "saved">
  }): Promise<StoredContentProposal>
  getContentProposal(input: { teacherId: string; proposalId: string }): Promise<StoredContentProposal | null>
  rejectContentProposal(input: { teacherId: string; proposalId: string }): Promise<StoredContentProposal | null>
  saveContentDraft(input: {
    teacherId: string
    proposalId: string
    contentDraft: ContentProposalSavedContentDraft
  }): Promise<{ proposal: StoredContentProposal; contentItem: SavedContentProposalItem } | null>
  listContentProposals(input: {
    teacherId: string
    module?: ContentModule
    status?: ProposalStatus
    limit: number
    cursor?: ContentProposalCursor | null
  }): Promise<ContentProposalPage>
}

type Queryable = {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<{ rows: Row[] }>
}

type CopilotRepositoryDatabase = {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<Row[]>
  transaction<T>(work: (client: Queryable) => Promise<T>): Promise<T>
}

async function defaultQuery<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<Row[]> {
  const db = await import("../../db/query.ts")
  return db.query<Row>(text, params)
}

async function defaultTransaction<T>(
  work: (client: Queryable) => Promise<T>
): Promise<T> {
  const db = await import("../../db/transaction.ts")
  return db.withTransaction(work)
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function mapConversation(row: ConversationRow): CopilotConversation {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    title: row.title,
    classroomId: row.classroom_id,
    status: row.status,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  }
}

function mapMessage(row: MessageRow): CopilotMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    status: row.status,
    model: row.model,
    provider: row.provider,
    promptVersion: row.prompt_version,
    createdAt: iso(row.created_at)!,
    completedAt: iso(row.completed_at),
    errorCode: row.error_code,
  }
}

function mapCitation(row: CitationRow): CopilotStoredCitation {
  return {
    messageId: row.message_id,
    sourceKind: row.source_kind,
    sourceId: row.source_id ?? "",
    title: row.title,
    excerpt: row.excerpt ?? "",
    url: row.url ?? "",
    retrievedAt: iso(row.retrieved_at)!,
    displayOrder: row.display_order,
  }
}

function mapFeedback(row: FeedbackRow): CopilotMessageFeedback {
  return {
    messageId: row.message_id,
    rating: row.rating,
    comment: row.comment,
  }
}

function jsonObject<T>(value: T | string): T {
  return typeof value === "string" ? JSON.parse(value) as T : value
}

function mapLessonPlanProposal(row: LessonPlanProposalRow): StoredLessonPlanProposal {
  const payload = jsonObject<LessonPlanProposalPayload>(row.payload)
  return {
    id: row.id,
    teacherId: row.teacher_id,
    conversationId: row.conversation_id,
    status: row.status,
    draft: payload.draft,
    citations: payload.citations,
    model: row.model,
    usage: payload.usage,
    safety: payload.safety,
    contentItemId: row.content_item_id,
    payloadHash: row.payload_hash,
    idempotencyKey: row.idempotency_key,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  }
}

function mapLessonPlanContentItem(row: LessonPlanContentItemRow): LessonPlanSavedContentItem {
  return {
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    bodyHtml: row.body_html,
    status: row.status,
    visibility: row.visibility,
    settings: jsonObject<Record<string, unknown>>(row.settings),
  }
}

function mapContentProposal(row: ContentProposalRow): StoredContentProposal {
  const payload = jsonObject<ContentProposal>(row.payload)
  return {
    id: row.id,
    teacherId: row.teacher_id,
    conversationId: row.conversation_id,
    module: row.module,
    mode: row.mode,
    originalContent: row.original_content === null ? null : jsonObject<TeacherContentDraft>(row.original_content),
    payload,
    changeSummary: row.change_summary,
    provider: row.provider,
    model: row.model,
    status: row.status,
    payloadHash: row.payload_hash,
    idempotencyKey: row.idempotency_key,
    contentItemId: row.content_item_id,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  }
}

function mapSavedContentProposalItem(row: ContentItemRow): SavedContentProposalItem {
  return {
    id: row.id,
    authorId: row.author_id,
    type: row.type,
    title: row.title,
    bodyHtml: row.body_html,
    status: row.status,
    visibility: row.visibility,
    settings: jsonObject<Record<string, unknown>>(row.settings),
  }
}

function completedAtExpression(status: CopilotMessage["status"]): string | null {
  return status === "pending" || status === "streaming"
    ? null
    : "timezone('utc'::text, now())"
}

function citationHash(citation: CopilotMessageCitation): string {
  return createHash("sha256")
    .update(`${citation.sourceKind}:${citation.sourceId}:${citation.excerpt}`)
    .digest("hex")
}

async function insertMessage(
  client: Queryable,
  input: CopilotMessageWrite
): Promise<CopilotMessage> {
  const rows = await client.query<MessageRow>(
    `insert into public.ai_messages (
       conversation_id, role, content, status, model, provider, prompt_version,
       completed_at, error_code
     )
     select c.id, $3, $4, $5, $6, $7, $8,
            case when $9::text is null then null else timezone('utc'::text, now()) end,
            $10
       from public.ai_conversations c
      where c.id = $2
        and c.teacher_id = $1
      returning id, conversation_id, role, content, status, model, provider,
                prompt_version, created_at, completed_at, error_code`,
    [
      input.teacherId,
      input.conversationId,
      input.role,
      input.content,
      input.status,
      input.model,
      input.provider,
      input.promptVersion,
      completedAtExpression(input.status),
      input.errorCode,
    ]
  )
  const row = rows.rows[0]
  if (!row) throw new CopilotServiceError("conversation_not_found")
  return mapMessage(row)
}

async function insertRun(client: Queryable, input: CopilotRun) {
  await client.query(
    `insert into public.ai_runs (
       conversation_id, message_id, teacher_id, feature, provider, model,
       prompt_version, status, input_tokens, output_tokens, latency_ms,
       correlation_id, started_at, completed_at, error_code,
       safety_decision, safety_reason_code, safety_policy_version
     )
     values (
       $1, $2, $3, $4, $5, $6, $7, $8,
       $9::bigint, $10::bigint, $11, $12,
       timezone('utc'::text, now()), timezone('utc'::text, now()), $13,
       $14, $15, $16
     )`,
    [
      input.conversationId,
      input.messageId,
      input.teacherId,
      input.feature,
      input.provider,
      input.model,
      input.promptVersion,
      input.status,
      input.inputTokens,
      input.outputTokens,
      input.latencyMs,
      input.correlationId,
      input.errorCode,
      input.safety.decision,
      input.safety.reasonCode ?? null,
      input.safety.policyVersion,
    ]
  )
}

async function touchConversation(
  client: Queryable,
  conversationId: string,
  teacherId: string
) {
  await client.query(
    `update public.ai_conversations
        set updated_at = timezone('utc'::text, now())
      where id = $1
        and teacher_id = $2`,
    [conversationId, teacherId]
  )
}

export class PostgresCopilotRepository implements CopilotRepository, LessonPlanProposalRepository, ContentProposalRepository {
  private readonly database: CopilotRepositoryDatabase

  constructor(database: CopilotRepositoryDatabase = {
    query: defaultQuery,
    transaction: defaultTransaction,
  }) {
    this.database = database
  }

  async createConversation(input: {
    teacherId: string
    title: string
  }): Promise<CopilotConversation> {
    const rows = await this.database.query<ConversationRow>(
      `insert into public.ai_conversations (teacher_id, title)
       values ($1, $2)
       returning id, teacher_id, title, classroom_id, status, created_at, updated_at`,
      [input.teacherId, input.title]
    )
    return mapConversation(rows[0]!)
  }

  async listConversations(teacherId: string): Promise<readonly CopilotConversation[]> {
    const rows = await this.database.query<ConversationRow>(
      `select id, teacher_id, title, classroom_id, status, created_at, updated_at
         from public.ai_conversations
        where teacher_id = $1
          and status <> 'deleted'
        order by updated_at desc, created_at desc
        limit 50`,
      [teacherId]
    )
    return rows.map(mapConversation)
  }

  async getConversation(
    teacherId: string,
    conversationId: string
  ): Promise<CopilotConversation | null> {
    const rows = await this.database.query<ConversationRow>(
      `select id, teacher_id, title, classroom_id, status, created_at, updated_at
         from public.ai_conversations
        where teacher_id = $1
          and id = $2
        limit 1`,
      [teacherId, conversationId]
    )
    return rows[0] ? mapConversation(rows[0]) : null
  }

  async listMessages(
    teacherId: string,
    conversationId: string,
    limit: number
  ): Promise<readonly CopilotMessage[]> {
    const rows = await this.database.query<MessageRow>(
      `select m.id, m.conversation_id, m.role, m.content, m.status, m.model,
              m.provider, m.prompt_version, m.created_at, m.completed_at, m.error_code
         from public.ai_messages m
         join public.ai_conversations c on c.id = m.conversation_id
        where c.teacher_id = $1
          and c.id = $2
        order by m.created_at desc
        limit $3`,
      [teacherId, conversationId, limit]
    )
    return rows.reverse().map(mapMessage)
  }

  async listMessageCitations(
    teacherId: string,
    conversationId: string
  ): Promise<readonly CopilotStoredCitation[]> {
    const rows = await this.database.query<CitationRow>(
      `select ci.message_id, ci.source_kind, ci.source_id, ci.title,
              ci.excerpt, ci.url, ci.retrieved_at, ci.display_order
         from public.ai_citations ci
         join public.ai_messages m on m.id = ci.message_id
         join public.ai_conversations c on c.id = m.conversation_id
        where c.teacher_id = $1
          and c.id = $2
        order by m.created_at asc, ci.display_order asc`,
      [teacherId, conversationId]
    )
    return rows.map(mapCitation)
  }

  async listMessageFeedback(
    teacherId: string,
    conversationId: string
  ): Promise<readonly CopilotMessageFeedback[]> {
    const rows = await this.database.query<FeedbackRow>(
      `select f.message_id, f.rating, f.comment
         from public.ai_message_feedback f
         join public.ai_conversations c on c.id = f.conversation_id
        where c.teacher_id = $1
          and c.id = $2
        order by f.updated_at asc`,
      [teacherId, conversationId]
    )
    return rows.map(mapFeedback)
  }

  async appendMessage(input: CopilotMessageWrite): Promise<CopilotMessage> {
    return this.database.transaction(async (client) => {
      const message = await insertMessage(client, input)
      await touchConversation(client, input.conversationId, input.teacherId)
      return message
    })
  }

  async persistAssistantResult(input: {
    message: CopilotMessageWrite
    citations: readonly CopilotMessageCitation[]
    run: Omit<CopilotRun, "messageId">
  }): Promise<CopilotMessage> {
    return this.database.transaction(async (client) => {
      const assistantMessage = await insertMessage(client, input.message)
      for (const citation of input.citations) {
        await client.query(
          `insert into public.ai_citations (
             message_id, source_kind, source_id, title, excerpt, url, retrieved_at,
             content_hash, display_order
           )
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            assistantMessage.id,
            citation.sourceKind,
            citation.sourceId,
            citation.title,
            citation.excerpt,
            citation.url,
            citation.retrievedAt,
            citationHash(citation),
            citation.displayOrder,
          ]
        )
      }
      await insertRun(client, {
        ...input.run,
        messageId: assistantMessage.id,
      })
      await touchConversation(client, input.message.conversationId, input.message.teacherId)
      return assistantMessage
    })
  }

  async saveFeedback(input: {
    teacherId: string
    conversationId: string
    messageId: string
    rating: "positive" | "negative"
    comment?: string
  }): Promise<void> {
    const rows = await this.database.query<{ message_id: string }>(
      `insert into public.ai_message_feedback (
         teacher_id, conversation_id, message_id, rating, comment
       )
       select c.teacher_id, c.id, m.id, $4, $5
         from public.ai_conversations c
         join public.ai_messages m on m.conversation_id = c.id
        where c.teacher_id = $1
          and c.id = $2
          and m.id = $3
          and m.role = 'assistant'
       on conflict (teacher_id, conversation_id, message_id)
       do update set
         rating = excluded.rating,
         comment = excluded.comment,
         updated_at = timezone('utc'::text, now())
       returning message_id`,
      [
        input.teacherId,
        input.conversationId,
        input.messageId,
        input.rating,
        input.comment ?? null,
      ]
    )
    if (!rows[0]) throw new CopilotServiceError("conversation_not_found")
  }

  async listAllowedClassroomIds(teacherId: string): Promise<readonly string[]> {
    const rows = await this.database.query<{ id: string }>(
      `select id
         from public.classrooms
        where professor_id = $1
          and status = 'ativa'
        order by created_at desc`,
      [teacherId]
    )
    return rows.map((row) => row.id)
  }

  async recordRun(input: CopilotRun): Promise<void> {
    await this.database.query(
      `insert into public.ai_runs (
         conversation_id, message_id, teacher_id, feature, provider, model,
         prompt_version, status, input_tokens, output_tokens, latency_ms,
         correlation_id, started_at, completed_at, error_code,
         safety_decision, safety_reason_code, safety_policy_version
       )
       values (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9::bigint, $10::bigint, $11, $12,
         timezone('utc'::text, now()), timezone('utc'::text, now()), $13,
         $14, $15, $16
       )`,
      [
        input.conversationId,
        input.messageId,
        input.teacherId,
        input.feature,
        input.provider,
        input.model,
        input.promptVersion,
        input.status,
        input.inputTokens,
        input.outputTokens,
        input.latencyMs,
        input.correlationId,
        input.errorCode,
        input.safety.decision,
        input.safety.reasonCode ?? null,
        input.safety.policyVersion,
      ]
    )
  }

  async createProposal(input: {
    teacherId: string
    conversationId: string
    status: StoredLessonPlanProposal["status"]
    payload: LessonPlanProposalPayload
    payloadHash: string
    idempotencyKey: string
    safetyDecision: string
    model: string
  }): Promise<StoredLessonPlanProposal> {
    const rows = await this.database.query<LessonPlanProposalRow>(
      `insert into public.ai_lesson_plan_proposals (
         teacher_id, conversation_id, status, payload, payload_hash,
         idempotency_key, safety_decision, model
       )
       select c.teacher_id, c.id, $3, $4::jsonb, $5, $6, $7, $8
         from public.ai_conversations c
        where c.teacher_id = $1
          and c.id = $2
       on conflict (teacher_id, idempotency_key)
       do update set updated_at = public.ai_lesson_plan_proposals.updated_at
       where public.ai_lesson_plan_proposals.payload_hash = excluded.payload_hash
       returning id, teacher_id, conversation_id, status, payload, payload_hash,
                 idempotency_key, content_item_id, model, created_at, updated_at`,
      [
        input.teacherId,
        input.conversationId,
        input.status,
        JSON.stringify(input.payload),
        input.payloadHash,
        input.idempotencyKey,
        input.safetyDecision,
        input.model,
      ]
    )
    const row = rows[0]
    if (!row) {
      const conflicts = await this.database.query<{ id: string; payload_hash: string }>(
        `select id, payload_hash
           from public.ai_lesson_plan_proposals
          where teacher_id = $1
            and idempotency_key = $2
          limit 1`,
        [input.teacherId, input.idempotencyKey]
      )
      if (conflicts[0]) {
        throw new LessonPlanServiceError("lesson_plan_idempotency_conflict")
      }
      throw new CopilotServiceError("conversation_not_found")
    }
    return mapLessonPlanProposal(row)
  }

  async getProposal(input: {
    teacherId: string
    proposalId: string
  }): Promise<StoredLessonPlanProposal | null> {
    const rows = await this.database.query<LessonPlanProposalRow>(
      `select id, teacher_id, conversation_id, status, payload, payload_hash,
              idempotency_key, content_item_id, model, created_at, updated_at
         from public.ai_lesson_plan_proposals
        where teacher_id = $1
          and id = $2
        limit 1`,
      [input.teacherId, input.proposalId]
    )
    return rows[0] ? mapLessonPlanProposal(rows[0]) : null
  }

  async rejectProposal(input: {
    teacherId: string
    proposalId: string
  }): Promise<StoredLessonPlanProposal | null> {
    const rows = await this.database.query<LessonPlanProposalRow>(
      `update public.ai_lesson_plan_proposals
          set status = 'rejected',
              updated_at = timezone('utc'::text, now())
        where teacher_id = $1
          and id = $2
          and status = 'proposed'
        returning id, teacher_id, conversation_id, status, payload, payload_hash,
                  idempotency_key, content_item_id, model, created_at, updated_at`,
      [input.teacherId, input.proposalId]
    )
    if (rows[0]) return mapLessonPlanProposal(rows[0])
    return this.getProposal(input)
  }

  async saveDraft(input: {
    teacherId: string
    proposalId: string
    contentDraft: {
      title: string
      bodyHtml: string
      status: "draft"
      visibility: "private"
      settings: Record<string, unknown>
    }
  }) {
    return this.database.transaction(async (client) => {
      const proposalRows = await client.query<LessonPlanProposalRow>(
        `select id, teacher_id, conversation_id, status, payload, payload_hash,
                idempotency_key, content_item_id, model, created_at, updated_at
           from public.ai_lesson_plan_proposals
          where teacher_id = $1
            and id = $2
          for update`,
        [input.teacherId, input.proposalId]
      )
      const proposalRow = proposalRows.rows[0]
      if (!proposalRow) return null
      const proposal = mapLessonPlanProposal(proposalRow)

      if (proposal.contentItemId) {
        const contentRows = await client.query<LessonPlanContentItemRow>(
          `select id, author_id, title, body_html, status, visibility, settings
             from public.content_items
            where id = $1
              and author_id = $2
            limit 1`,
          [proposal.contentItemId, input.teacherId]
        )
        const contentRow = contentRows.rows[0]
        return contentRow
          ? { proposal, contentItem: mapLessonPlanContentItem(contentRow) }
          : null
      }

      if (proposal.status !== "proposed") return null

      const contentRows = await client.query<LessonPlanContentItemRow>(
        `insert into public.content_items (
           author_id, type, title, body_html, status, visibility, settings,
           created_at, updated_at
         )
         values (
           $1, 'article', $2, $3, 'draft', 'private', $4::jsonb,
           timezone('utc'::text, now()), timezone('utc'::text, now())
         )
         returning id, author_id, title, body_html, status, visibility, settings`,
        [
          input.teacherId,
          input.contentDraft.title,
          input.contentDraft.bodyHtml,
          JSON.stringify(input.contentDraft.settings),
        ]
      )
      const contentItem = mapLessonPlanContentItem(contentRows.rows[0]!)
      const savedRows = await client.query<LessonPlanProposalRow>(
        `update public.ai_lesson_plan_proposals
            set status = 'saved',
                content_item_id = $3,
                updated_at = timezone('utc'::text, now())
          where teacher_id = $1
            and id = $2
            and status = 'proposed'
          returning id, teacher_id, conversation_id, status, payload, payload_hash,
                    idempotency_key, content_item_id, model, created_at, updated_at`,
        [input.teacherId, input.proposalId, contentItem.id]
      )

      return {
        proposal: mapLessonPlanProposal(savedRows.rows[0]!),
        contentItem,
      }
    })
  }

  async createContentProposal(input: {
    teacherId: string
    conversationId: string
    module: ContentModule
    mode: ContentProposal["mode"]
    originalContent?: TeacherContentDraft | null
    payload: ContentProposal
    payloadHash: string
    provider: string
    idempotencyKey: string
    status: Exclude<ProposalStatus, "saved">
  }): Promise<StoredContentProposal> {
    const rows = await this.database.query<ContentProposalRow>(
      `insert into public.ai_content_proposals (
         teacher_id, conversation_id, module, mode, original_content, payload,
         change_summary, payload_hash, provider, model, status, idempotency_key
       )
       select c.teacher_id, c.id, $3, $4, $5::jsonb, $6::jsonb,
              $7, $8, $9, $10, $11, $12
         from public.ai_conversations c
        where c.teacher_id = $1
          and c.id = $2
       on conflict (teacher_id, idempotency_key)
       do update set updated_at = public.ai_content_proposals.updated_at
       where public.ai_content_proposals.payload_hash = excluded.payload_hash
       returning id, teacher_id, conversation_id, module, mode, original_content,
                 payload, change_summary, payload_hash, provider, model, status,
                 idempotency_key, content_item_id, created_at, updated_at`,
      [
        input.teacherId,
        input.conversationId,
        input.module,
        input.mode,
        input.originalContent == null ? null : JSON.stringify(input.originalContent),
        JSON.stringify(input.payload),
        input.payload.changeSummary,
        input.payloadHash,
        input.provider,
        input.payload.model,
        input.status,
        input.idempotencyKey,
      ]
    )
    const row = rows[0]
    if (row) return mapContentProposal(row)

    const conflicts = await this.database.query<{ id: string }>(
      `select id
         from public.ai_content_proposals
        where teacher_id = $1
          and idempotency_key = $2
        limit 1`,
      [input.teacherId, input.idempotencyKey]
    )
    if (conflicts[0]) throw new ProposalServiceError("content_idempotency_conflict")
    throw new CopilotServiceError("conversation_not_found")
  }

  async getContentProposal(input: {
    teacherId: string
    proposalId: string
  }): Promise<StoredContentProposal | null> {
    const rows = await this.database.query<ContentProposalRow>(
      `select id, teacher_id, conversation_id, module, mode, original_content,
              payload, change_summary, payload_hash, provider, model, status,
              idempotency_key, content_item_id, created_at, updated_at
         from public.ai_content_proposals
        where teacher_id = $1
          and id = $2
        limit 1`,
      [input.teacherId, input.proposalId]
    )
    return rows[0] ? mapContentProposal(rows[0]) : null
  }

  async rejectContentProposal(input: {
    teacherId: string
    proposalId: string
  }): Promise<StoredContentProposal | null> {
    const rows = await this.database.query<ContentProposalRow>(
      `update public.ai_content_proposals
          set status = 'rejected',
              updated_at = timezone('utc'::text, now())
        where teacher_id = $1
          and id = $2
          and status = 'proposed'
        returning id, teacher_id, conversation_id, module, mode, original_content,
                  payload, change_summary, payload_hash, provider, model, status,
                  idempotency_key, content_item_id, created_at, updated_at`,
      [input.teacherId, input.proposalId]
    )
    if (rows[0]) return mapContentProposal(rows[0])
    return this.getContentProposal(input)
  }

  async saveContentDraft(input: {
    teacherId: string
    proposalId: string
    contentDraft: ContentProposalSavedContentDraft
  }): Promise<{ proposal: StoredContentProposal; contentItem: SavedContentProposalItem } | null> {
    return this.database.transaction(async (client) => {
      const proposalRows = await client.query<ContentProposalRow>(
        `select id, teacher_id, conversation_id, module, mode, original_content,
                payload, change_summary, payload_hash, provider, model, status,
                idempotency_key, content_item_id, created_at, updated_at
           from public.ai_content_proposals
          where teacher_id = $1
            and id = $2
          for update`,
        [input.teacherId, input.proposalId]
      )
      const proposalRow = proposalRows.rows[0]
      if (!proposalRow) return null
      const proposal = mapContentProposal(proposalRow)

      if (proposal.contentItemId) {
        const contentRows = await client.query<ContentItemRow>(
          `select id, author_id, type, title, body_html, status, visibility, settings
             from public.content_items
            where id = $1
              and author_id = $2
            limit 1`,
          [proposal.contentItemId, input.teacherId]
        )
        const contentRow = contentRows.rows[0]
        return contentRow ? { proposal, contentItem: mapSavedContentProposalItem(contentRow) } : null
      }

      if (proposal.status !== "proposed") return null

      const contentRows = await client.query<ContentItemRow>(
        `insert into public.content_items (
           author_id, type, title, body_html, status, visibility, settings,
           created_at, updated_at
         )
         values (
           $1, $2, $3, $4, 'draft', 'private', $5::jsonb,
           timezone('utc'::text, now()), timezone('utc'::text, now())
         )
         returning id, author_id, type, title, body_html, status, visibility, settings`,
        [
          input.teacherId,
          input.contentDraft.type,
          input.contentDraft.title,
          input.contentDraft.bodyHtml,
          JSON.stringify(input.contentDraft.settings),
        ]
      )
      const contentRow = contentRows.rows[0]
      if (!contentRow) throw new ProposalServiceError("content_draft_not_saved")
      const contentItem = mapSavedContentProposalItem(contentRow)
      const savedRows = await client.query<ContentProposalRow>(
        `update public.ai_content_proposals
            set status = 'saved',
                content_item_id = $3,
                updated_at = timezone('utc'::text, now())
          where teacher_id = $1
            and id = $2
            and status = 'proposed'
          returning id, teacher_id, conversation_id, module, mode, original_content,
                    payload, change_summary, payload_hash, provider, model, status,
                    idempotency_key, content_item_id, created_at, updated_at`,
        [input.teacherId, input.proposalId, contentItem.id]
      )
      const savedRow = savedRows.rows[0]
      if (!savedRow) throw new ProposalServiceError("content_proposal_save_conflict")
      return { proposal: mapContentProposal(savedRow), contentItem }
    })
  }

  async listContentProposals(input: {
    teacherId: string
    module?: ContentModule
    status?: ProposalStatus
    limit: number
    cursor?: ContentProposalCursor | null
  }): Promise<ContentProposalPage> {
    const limit = Math.max(1, Math.min(input.limit, 50))
    const conditions = ["teacher_id = $1"]
    const params: unknown[] = [input.teacherId]
    if (input.module) {
      params.push(input.module)
      conditions.push(`module = $${params.length}`)
    }
    if (input.status) {
      params.push(input.status)
      conditions.push(`status = $${params.length}`)
    }
    if (input.cursor) {
      params.push(input.cursor.updatedAt, input.cursor.id)
      conditions.push(`(updated_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`)
    }
    params.push(limit + 1)
    const rows = await this.database.query<ContentProposalRow>(
      `select id, teacher_id, conversation_id, module, mode, original_content,
              payload, change_summary, payload_hash, provider, model, status,
              idempotency_key, content_item_id, created_at, updated_at
         from public.ai_content_proposals
        where ${conditions.join("\n          and ")}
        order by updated_at desc, id desc
        limit $${params.length}`,
      params
    )
    const pageRows = rows.slice(0, limit)
    const last = pageRows.at(-1)
    return {
      items: pageRows.map(mapContentProposal),
      nextCursor: rows.length > limit && last
        ? { updatedAt: iso(last.updated_at)!, id: last.id }
        : null,
    }
  }
}
