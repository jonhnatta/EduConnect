import OpenAI from "openai"
import { auth } from "../../../auth.ts"
import { dbPool } from "../../db/pool.ts"
import { queryOne } from "../../db/query.ts"
import { checkAiEligibility, reserveAiUsage, settleAiUsage } from "../access.ts"
import { readAiConfig } from "../config.ts"
import type { Citation } from "../contracts.ts"
import { OpenAiEmbeddingProvider, OpenAiProvider } from "../providers/openai.ts"
import { LangfuseTelemetry } from "../telemetry/langfuse.ts"
import {
  qdrantHybridClient,
  searchKnowledge,
  type AuthorizedKnowledgeSource,
  type KnowledgeSourceRepository,
} from "../retrieval/search.ts"
import {
  CopilotServiceError,
  createCopilotService,
  type CopilotQuota,
} from "./service.ts"
import { createCopilotApiHandlers } from "./http.ts"
import { PostgresCopilotRepository } from "./postgres-repository.ts"
import type { CopilotActor, CopilotProvider } from "./types.ts"

const TENANT_ID = "educonnect"
const DEFAULT_COLLECTION = "educonnect_knowledge_v2"

type ProfileActorRow = {
  user_type: "professor" | "aluno" | null
}

class LazyOpenAiCopilotProvider implements CopilotProvider {
  readonly name = "openai"

  get model(): string {
    return readAiConfig().model
  }

  async generate(input: Parameters<CopilotProvider["generate"]>[0]) {
    const config = readAiConfig()
    if (!config.enabled) throw new CopilotServiceError("feature_disabled")
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 0,
      timeout: 30_000,
    })
    const provider = new OpenAiProvider(client, config.model)
    return provider.generate({
      system: input.system,
      user: `Contexto autorizado:\n${input.context}\n\nHistorico e pergunta:\n${input.user}`,
      maxOutputTokens: input.maxOutputTokens,
    })
  }
}

class PostgresAiQuota implements CopilotQuota {
  async checkAccess(input: { teacherId: string }) {
    const client = await dbPool().connect()
    try {
      return await checkAiEligibility(client, input.teacherId)
    } finally {
      client.release()
    }
  }

  async reserve(input: {
    teacherId: string
    estimatedTokens: number
  }) {
    const client = await dbPool().connect()
    try {
      return await reserveAiUsage(client, input.teacherId, input.estimatedTokens)
    } finally {
      client.release()
    }
  }

  async settle(input: {
    teacherId: string
    reservedTokens: number
    usageDate: string
    inputTokens: number
    outputTokens: number
  }): Promise<void> {
    const client = await dbPool().connect()
    try {
      await settleAiUsage(
        client,
        input.teacherId,
        input.usageDate,
        input.reservedTokens,
        {
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
        }
      )
    } finally {
      client.release()
    }
  }

  async getDailyUsage(input: { teacherId: string }) {
    const config = readAiConfig()
    if (!config.enabled) throw new CopilotServiceError("feature_disabled")

    const row = await queryOne<{
      used_requests: number | string | null
      request_limit: number | string | null
    }>(
      `select
         coalesce(usage.request_count, 0)::integer as used_requests,
         coalesce(beta.daily_request_limit, $2)::integer as request_limit
       from public.profiles p
       left join public.ai_beta_access beta
         on beta.teacher_id = p.id
        and beta.enabled = true
        and (beta.starts_at is null or beta.starts_at <= clock_timestamp())
        and (beta.expires_at is null or beta.expires_at > clock_timestamp())
       left join public.ai_usage_daily usage
         on usage.teacher_id = p.id
        and usage.usage_date = (current_timestamp at time zone 'UTC')::date
       where p.id = $1
         and p.user_type = 'professor'
         and p.account_status = 'active'
         and p.deleted_at is null
       limit 1`,
      [input.teacherId, config.dailyRequests]
    )

    return {
      usedRequests: Number(row?.used_requests ?? 0),
      requestLimit: Number(row?.request_limit ?? config.dailyRequests),
    }
  }
}

class PostgresKnowledgeSourceRepository implements KnowledgeSourceRepository {
  async authorize(
    candidate: AuthorizedKnowledgeSource
  ): Promise<AuthorizedKnowledgeSource | null> {
    const row = await queryOne<{
      tenant_id: string
      teacher_id: string
      classroom_id: string | null
      source_id: string
      id: string
      version: number
      embedding_model: string
      embedding_dimensions: number
      vector_schema_version: number
      active: boolean
    }>(
      `select tenant_id, teacher_id, classroom_id, source_id, id, version,
              embedding_model, embedding_dimensions, $5::integer as vector_schema_version,
              (status = 'indexed' and is_current = true and deleted_at is null) as active
         from public.ai_documents
        where tenant_id = $1
          and teacher_id = $2
          and source_id = $3
          and id = $4
        limit 1`,
      [
        candidate.tenantId,
        candidate.teacherId,
        candidate.sourceId,
        candidate.documentId,
        candidate.vectorSchemaVersion,
      ]
    )
    if (!row) return null
    return {
      tenantId: row.tenant_id,
      teacherId: row.teacher_id,
      classroomId: row.classroom_id,
      sourceId: row.source_id,
      documentId: row.id,
      version: row.version,
      embeddingModel: row.embedding_model,
      embeddingDimensions: row.embedding_dimensions,
      vectorSchemaVersion: row.vector_schema_version,
      active: row.active,
    }
  }
}

function toCopilotCitation(citation: Citation) {
  return {
    sourceId: citation.id,
    contentSourceId: citation.contentSourceId,
    sourceKind: citation.kind,
    title: citation.title,
    excerpt: citation.excerpt,
    url: citation.url,
    retrievedAt: citation.retrievedAt,
  }
}

async function retrieveContext(input: {
  teacherId: string
  query: string
  classroomId: string | null
  allowedClassroomIds: readonly string[]
}) {
  const config = readAiConfig()
  if (!config.enabled) throw new CopilotServiceError("feature_disabled")
  if (!config.internalRag) return []
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: 30_000,
  })
  const citations = await searchKnowledge(
    {
      access: {
        tenantId: TENANT_ID,
        teacherId: input.teacherId,
        allowedClassroomIds: input.allowedClassroomIds,
      },
      query: input.query,
      classroomId: input.classroomId ?? undefined,
    },
    {
      embeddingProvider: new OpenAiEmbeddingProvider(openai, config.embeddingModel),
      vectorClient: qdrantHybridClient({
        url: process.env.QDRANT_URL ?? "",
        apiKey: process.env.QDRANT_API_KEY ?? "",
      }),
      sourceRepository: new PostgresKnowledgeSourceRepository(),
      config: {
        collection: process.env.QDRANT_COLLECTION ?? DEFAULT_COLLECTION,
        embeddingModel: config.embeddingModel,
        embeddingDimensions: config.embeddingDimensions,
        vectorSchemaVersion: config.vectorSchemaVersion,
      },
    }
  )
  return citations.map(toCopilotCitation)
}

export async function resolveCopilotActor(): Promise<CopilotActor | null> {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return null

  const profile = await queryOne<ProfileActorRow>(
    `select user_type
       from public.profiles
      where id = $1
        and deleted_at is null
        and account_status = 'active'`,
    [userId]
  )
  return {
    userId,
    userType: profile?.user_type === "professor" ? "professor" : "aluno",
  }
}

export function createDefaultCopilotService() {
  return createCopilotService({
    repository: new PostgresCopilotRepository(),
    quota: new PostgresAiQuota(),
    provider: new LazyOpenAiCopilotProvider(),
    retrieveContext,
    telemetry: new LangfuseTelemetry(),
  })
}

export async function getDefaultCopilotAccess(teacherId: string) {
  const client = await dbPool().connect()
  try {
    return await checkAiEligibility(client, teacherId)
  } finally {
    client.release()
  }
}

export async function requireDefaultCopilotAccess(teacherId: string): Promise<void> {
  const access = await getDefaultCopilotAccess(teacherId)
  if (!access.ok) throw new CopilotServiceError(access.code)
}

export function createDefaultCopilotApiHandlers() {
  return createCopilotApiHandlers({
    resolveActor: resolveCopilotActor,
    service: createDefaultCopilotService(),
  })
}
