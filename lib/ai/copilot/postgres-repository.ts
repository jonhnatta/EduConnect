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
  CopilotMessageWrite,
  CopilotRun,
} from "./types.ts"

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
       correlation_id, started_at, completed_at, error_code
     )
     values (
       $1, $2, $3, $4, $5, $6, $7, $8,
       $9::bigint, $10::bigint, $11, $12,
       timezone('utc'::text, now()), timezone('utc'::text, now()), $13
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

export class PostgresCopilotRepository implements CopilotRepository {
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
             message_id, source_kind, source_id, title, url, retrieved_at,
             content_hash, display_order
           )
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            assistantMessage.id,
            citation.sourceKind,
            citation.sourceId,
            citation.title,
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
         correlation_id, started_at, completed_at, error_code
       )
       values (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9::bigint, $10::bigint, $11, $12,
         timezone('utc'::text, now()), timezone('utc'::text, now()), $13
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
      ]
    )
  }
}
