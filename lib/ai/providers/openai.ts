import { zodTextFormat } from "openai/helpers/zod"
import { z } from "zod"
import {
  citationSchema,
  copilotResponseSchema,
  type EmbeddingProvider,
  type LLMProvider,
} from "../contracts.ts"

const REQUEST_TIMEOUT_MS = 30_000

const nullableString = z.string().nullable().optional()
const webLocationSchema = z
  .object({
    type: z.literal("approximate").optional(),
    city: nullableString,
    country: nullableString,
    region: nullableString,
    timezone: nullableString,
  })
  .strict()

const responseToolSchema = z.union([
  z
    .object({
      type: z.literal("function"),
      name: z.string().trim().min(1),
      parameters: z.record(z.unknown()).nullable(),
      strict: z.boolean().nullable(),
      allowed_callers: z.array(z.enum(["direct", "programmatic"])).nullable().optional(),
      defer_loading: z.boolean().optional(),
      description: nullableString,
      output_schema: z.record(z.unknown()).nullable().optional(),
    })
    .strict(),
  z
    .object({
      type: z.enum(["web_search", "web_search_2025_08_26"]),
      external_web_access: z.boolean().optional(),
      filters: z
        .object({ allowed_domains: z.array(z.string()).nullable().optional() })
        .strict()
        .nullable()
        .optional(),
      search_context_size: z.enum(["low", "medium", "high"]).optional(),
      user_location: webLocationSchema.nullable().optional(),
    })
    .strict(),
  z
    .object({
      type: z.enum(["web_search_preview", "web_search_preview_2025_03_11"]),
      search_content_types: z.array(z.enum(["text", "image"])).optional(),
      search_context_size: z.enum(["low", "medium", "high"]).optional(),
      user_location: webLocationSchema
        .extend({ type: z.literal("approximate") })
        .strict()
        .nullable()
        .optional(),
    })
    .strict(),
])

type RequestOptions = {
  timeout: number
  maxRetries: number
  signal?: AbortSignal
}

type ResponsesClient = {
  responses: {
    create(request: unknown, options: RequestOptions): Promise<{
      output_text?: unknown
      usage?: { input_tokens?: unknown; output_tokens?: unknown } | null
    }>
  }
}

type EmbeddingsClient = {
  embeddings: {
    create(request: unknown, options: RequestOptions): Promise<{
      data?: readonly { index?: unknown; embedding?: unknown }[]
    }>
  }
}

const generatedResponseSchema = z
  .object({
    text: z.string().min(1),
    citations: z.array(citationSchema),
    safety: z
      .object({
        decision: z.enum([
          "approved",
          "approved_with_warning",
          "regenerate",
          "abstain",
          "blocked",
          "human_review_required",
        ]),
        policyVersion: z.string().min(1),
        reasonCode: z.string().max(100).nullable(),
      })
      .strict(),
  })
  .strict()

const usageResponseSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
})

function requireModel(model: string): string {
  const normalized = model.trim()
  if (!normalized) throw new Error("invalid_model")
  return normalized
}

function requestOptions(signal?: AbortSignal): RequestOptions {
  return { timeout: REQUEST_TIMEOUT_MS, maxRetries: 0, signal }
}

function validatedTools(tools: readonly unknown[] | undefined): Record<string, unknown>[] | undefined {
  if (tools === undefined) return undefined
  return tools.map((tool) => {
    const validated = responseToolSchema.safeParse(tool)
    if (!validated.success) throw new Error("invalid_tool")
    return { ...validated.data }
  })
}

export class OpenAiProvider implements LLMProvider {
  private readonly client: ResponsesClient
  private readonly model: string

  constructor(client: ResponsesClient, model: string) {
    this.client = client
    this.model = requireModel(model)
  }

  async generate(input: {
    system: string
    user: string
    tools?: readonly unknown[]
    signal?: AbortSignal
  }) {
    const tools = validatedTools(input.tools)
    const request: Record<string, unknown> = {
      model: this.model,
      instructions: input.system,
      input: input.user,
      store: false,
      text: { format: zodTextFormat(generatedResponseSchema, "copilot_response") },
    }
    if (tools !== undefined) request.tools = tools

    const response = await this.client.responses.create(request, requestOptions(input.signal))

    try {
      if (typeof response.output_text !== "string" || !response.output_text.trim()) {
        throw new Error("empty output")
      }
      const generated = generatedResponseSchema.parse(JSON.parse(response.output_text))
      const usage = usageResponseSchema.parse(response.usage)
      const safety = generated.safety.reasonCode === null
        ? {
            decision: generated.safety.decision,
            policyVersion: generated.safety.policyVersion,
          }
        : {
            decision: generated.safety.decision,
            policyVersion: generated.safety.policyVersion,
            reasonCode: generated.safety.reasonCode,
          }
      return copilotResponseSchema.parse({
        ...generated,
        safety,
        usage: {
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
        },
      })
    } catch {
      throw new Error("invalid_openai_response")
    }
  }
}

export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  private readonly client: EmbeddingsClient
  private readonly model: string

  constructor(client: EmbeddingsClient, model: string) {
    this.client = client
    this.model = requireModel(model)
  }

  async embed(texts: readonly string[], signal?: AbortSignal): Promise<readonly number[][]> {
    if (texts.length === 0) return []
    const response = await this.client.embeddings.create(
      { model: this.model, input: [...texts] },
      requestOptions(signal)
    )

    try {
      if (!Array.isArray(response.data) || response.data.length !== texts.length) {
        throw new Error("incomplete response")
      }
      const ordered: number[][] = new Array(texts.length)
      let dimension: number | undefined
      for (const item of response.data) {
        if (
          !Number.isInteger(item.index) ||
          (item.index as number) < 0 ||
          (item.index as number) >= texts.length ||
          ordered[item.index as number] !== undefined ||
          !Array.isArray(item.embedding) ||
          item.embedding.length === 0 ||
          !item.embedding.every((value: unknown) =>
            typeof value === "number" && Number.isFinite(value)
          )
        ) {
          throw new Error("invalid vector")
        }
        dimension ??= item.embedding.length
        if (item.embedding.length !== dimension) throw new Error("dimension mismatch")
        ordered[item.index as number] = [...item.embedding] as number[]
      }
      if (ordered.some((vector) => vector === undefined)) throw new Error("missing vector")
      return ordered
    } catch {
      throw new Error("invalid_embedding_response")
    }
  }
}
