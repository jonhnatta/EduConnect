import { z } from "zod"

const citationBase = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  retrievedAt: z.string().datetime(),
  excerpt: z.string().min(1).max(2000),
})

export const citationSchema = z.discriminatedUnion("kind", [
  citationBase.extend({
    kind: z.literal("internal"),
    url: z.string().startsWith("/"),
  }),
  citationBase.extend({
    kind: z.literal("web"),
    url: z.string().url().startsWith("https://"),
  }),
])

export const safetyResultSchema = z.object({
  decision: z.enum([
    "approved",
    "approved_with_warning",
    "regenerate",
    "abstain",
    "blocked",
    "human_review_required",
  ]),
  policyVersion: z.string().min(1),
  reasonCode: z.string().max(100).optional(),
})

export const usageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
})

export const copilotResponseSchema = z.object({
  text: z.string().min(1),
  citations: z.array(citationSchema),
  usage: usageSchema,
  safety: safetyResultSchema,
})

export type CopilotResponse = z.infer<typeof copilotResponseSchema>
export type Citation = z.infer<typeof citationSchema>

export interface LLMProvider {
  generate(input: {
    system: string
    user: string
    tools?: readonly unknown[]
    signal?: AbortSignal
  }): Promise<CopilotResponse>
}

export interface EmbeddingProvider {
  embed(texts: readonly string[]): Promise<readonly number[][]>
}

export interface VectorStore {
  upsert(
    points: readonly {
      id: string
      vector: readonly number[]
      payload: Record<string, unknown>
    }[]
  ): Promise<void>
  deleteBySource(sourceId: string): Promise<void>
  search(input: {
    vector: readonly number[]
    teacherId: string
    classroomId?: string
    limit: number
  }): Promise<readonly Citation[]>
}
