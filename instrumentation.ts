type Env = Record<string, string | undefined>
type Registry = Record<PropertyKey, unknown>
type InstrumentationDependencies = {
  NodeSDK: new (options: { spanProcessors: unknown[] }) => { start(): void | Promise<void> }
  LangfuseSpanProcessor: new (options: Record<string, unknown>) => unknown
  sanitizeTelemetryValue(value: unknown): unknown
}
type DependencyLoader = () => Promise<InstrumentationDependencies>

const registrationKey = Symbol.for("educonnect.langfuse.instrumentation")

function validHttpUrl(value: string | undefined): value is string {
  if (!value?.trim()) return false
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

export function shouldRegisterLangfuse(env: Env): boolean {
  return env.NEXT_RUNTIME === "nodejs" &&
    Boolean(env.LANGFUSE_PUBLIC_KEY?.trim()) &&
    Boolean(env.LANGFUSE_SECRET_KEY?.trim()) &&
    validHttpUrl(env.LANGFUSE_BASE_URL)
}

export async function registerLangfuseInstrumentation(
  env: Env,
  loader: DependencyLoader,
  registry: Registry = globalThis
): Promise<void> {
  if (!shouldRegisterLangfuse(env)) return
  if (registry[registrationKey]) {
    await registry[registrationKey]
    return
  }

  const registration = (async () => {
    const { NodeSDK, LangfuseSpanProcessor, sanitizeTelemetryValue } = await loader()
    const processor = new LangfuseSpanProcessor({
      publicKey: env.LANGFUSE_PUBLIC_KEY!.trim(),
      secretKey: env.LANGFUSE_SECRET_KEY!.trim(),
      baseUrl: env.LANGFUSE_BASE_URL!.trim(),
      mask: ({ data }: { data: unknown }) => sanitizeTelemetryValue(data),
    })
    const sdk = new NodeSDK({ spanProcessors: [processor] })
    await sdk.start()
  })()
  registry[registrationKey] = registration
  try {
    await registration
  } catch (error) {
    delete registry[registrationKey]
    throw error
  }
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  await registerLangfuseInstrumentation(process.env, async () => {
    const [{ NodeSDK }, { LangfuseSpanProcessor }, { sanitizeTelemetryValue }] = await Promise.all([
      import("@opentelemetry/sdk-node"),
      import("@langfuse/otel"),
      import("./lib/ai/telemetry/langfuse.ts"),
    ])
    return {
      NodeSDK: NodeSDK as unknown as InstrumentationDependencies["NodeSDK"],
      LangfuseSpanProcessor,
      sanitizeTelemetryValue,
    }
  })
}
