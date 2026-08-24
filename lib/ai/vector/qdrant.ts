import { z } from "zod"
import { citationSchema, type Citation, type VectorStore } from "../contracts.ts"
import { DENSE_VECTOR_NAME, SPARSE_VECTOR_NAME, sparseVectorForText } from "../../../workers/ai-vector-core.mjs"

type QdrantClient = {
  upsert(collection: string, input: unknown): Promise<unknown>
  query(collection: string, input: unknown): Promise<{ points?: readonly { payload?: unknown }[] }>
  delete(collection: string, input: unknown): Promise<unknown>
}

const scopedPayloadSchema = z
  .object({
    tenant_id: z.string().trim().min(1).max(100),
    teacher_id: z.string().uuid(),
    classroom_id: z.string().uuid().optional(),
    source_id: z.string().trim().min(1),
    active: z.boolean(),
  })
  .and(citationSchema)

function validVector(vector: readonly number[]): boolean {
  return vector.length > 0 && vector.every((value) => Number.isFinite(value))
}

function validPointId(value: string): boolean {
  if (z.string().uuid().safeParse(value).success) return true
  if (!/^\d+$/.test(value)) return false
  const normalized = value.replace(/^0+(?=\d)/, "")
  const maxUint64 = "18446744073709551615"
  return normalized.length < maxUint64.length ||
    (normalized.length === maxUint64.length && normalized <= maxUint64)
}

function requireUuid(value: string, errorCode: string): string {
  if (!z.string().uuid().safeParse(value).success) throw new Error(errorCode)
  return value
}

function requireNonEmpty(value: string, errorCode: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(errorCode)
  return normalized
}

function requireTenantId(value: string): string {
  const normalized = requireNonEmpty(value, "invalid_tenant_id")
  if (normalized.length > 100) throw new Error("invalid_tenant_id")
  return normalized
}

export class QdrantVectorStore implements VectorStore {
  private readonly client: QdrantClient
  private readonly collection: string

  constructor(client: QdrantClient, collection: string) {
    this.client = client
    this.collection = requireNonEmpty(collection, "invalid_qdrant_collection")
  }

  async upsert(points: readonly {
    id: string
    vector: readonly number[]
    payload: Record<string, unknown>
  }[]): Promise<void> {
    for (const point of points) {
      if (
        !validPointId(point.id) ||
        !validVector(point.vector) ||
        !scopedPayloadSchema.safeParse(point.payload).success
      ) {
        throw new Error("invalid_qdrant_point")
      }
    }
    await this.client.upsert(this.collection, {
      wait: true,
      points: points.map((point) => ({
        id: point.id,
        vector: {
          [DENSE_VECTOR_NAME]: [...point.vector],
          [SPARSE_VECTOR_NAME]: sparseVectorForText(String(point.payload.excerpt)),
        },
        payload: { ...point.payload },
      })),
    })
  }

  async deleteBySource(sourceId: string, tenantId: string, teacherId: string): Promise<void> {
    const source = requireNonEmpty(sourceId, "invalid_source_id")
    const tenant = requireTenantId(tenantId)
    requireUuid(teacherId, "invalid_teacher_id")
    await this.client.delete(this.collection, {
      wait: true,
      filter: {
        must: [
          { key: "tenant_id", match: { value: tenant } },
          { key: "teacher_id", match: { value: teacherId } },
          { key: "source_id", match: { value: source } },
        ],
      },
    })
  }

  async search(input: {
    vector: readonly number[]
    tenantId: string
    teacherId: string
    classroomId?: string
    limit: number
  }): Promise<readonly Citation[]> {
    const tenant = requireTenantId(input.tenantId)
    requireUuid(input.teacherId, "invalid_teacher_id")
    if (input.classroomId !== undefined) requireUuid(input.classroomId, "invalid_classroom_id")
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50) {
      throw new Error("invalid_search_limit")
    }
    if (!validVector(input.vector)) throw new Error("invalid_search_vector")

    const must: Record<string, unknown>[] = [
      { key: "tenant_id", match: { value: tenant } },
      { key: "teacher_id", match: { value: input.teacherId } },
      { key: "active", match: { value: true } },
    ]
    if (input.classroomId !== undefined) {
      must.push({ key: "classroom_id", match: { value: input.classroomId } })
    }
    const response = await this.client.query(this.collection, {
      query: [...input.vector],
      using: DENSE_VECTOR_NAME,
      filter: { must },
      limit: input.limit,
      with_payload: true,
    })

    if (!Array.isArray(response.points)) throw new Error("invalid_qdrant_response")
    return response.points.map((point) => {
      const parsed = scopedPayloadSchema.safeParse(point.payload)
      if (
        !parsed.success ||
        parsed.data.tenant_id !== tenant ||
        parsed.data.teacher_id !== input.teacherId ||
        parsed.data.active !== true ||
        (input.classroomId !== undefined && parsed.data.classroom_id !== input.classroomId)
      ) {
        throw new Error("retrieval_scope_violation")
      }
      return citationSchema.parse(parsed.data)
    })
  }
}
