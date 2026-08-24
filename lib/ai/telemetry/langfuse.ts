import { propagateAttributes, startActiveObservation } from "@langfuse/tracing"

const REDACTED = "[redacted]"
const MAX_DEPTH = 6
const MAX_ITEMS = 50
const MAX_STRING_LENGTH = 8_000
const SENSITIVE_KEY = /(password|secret|token|authorization|cookie|apikey|answerkey|gabarito|headers?)/i
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, "")
  return normalized.toLowerCase() === "auth" || SENSITIVE_KEY.test(normalized)
}

export type TelemetryOperation = {
  name: string
  input?: unknown
  metadata?: Record<string, unknown>
}

export interface Telemetry {
  trace<T>(operation: TelemetryOperation, callback: () => T | Promise<T>): Promise<T>
  wrap<T>(operation: TelemetryOperation, callback: () => T | Promise<T>): Promise<T>
  flush(): Promise<void>
}

function isUnsupported(value: object): boolean {
  if (value instanceof Error) return true
  if (typeof AbortSignal !== "undefined" && value instanceof AbortSignal) return true
  if (typeof Headers !== "undefined" && value instanceof Headers) return true
  return false
}

export function sanitizeTelemetryValue(value: unknown): unknown {
  const visited = new WeakSet<object>()

  function sanitize(current: unknown, depth: number): unknown {
    if (typeof current === "string") {
      return current.slice(0, MAX_STRING_LENGTH).replace(EMAIL, "[email-redacted]")
    }
    if (current === null || typeof current === "boolean") return current
    if (typeof current === "number") return Number.isFinite(current) ? current : "[non-finite]"
    if (typeof current === "undefined" || typeof current === "function" || typeof current === "symbol" || typeof current === "bigint") {
      return "[unsupported]"
    }
    if (isUnsupported(current)) {
      return current instanceof Error ? "[error-redacted]" : "[unsupported]"
    }
    if (depth >= MAX_DEPTH) return "[max-depth]"
    if (visited.has(current)) return "[circular]"
    visited.add(current)

    if (Array.isArray(current)) {
      return current.slice(0, MAX_ITEMS).map((item) => sanitize(item, depth + 1))
    }

    let entries: [string, unknown][]
    try {
      entries = Object.entries(current).slice(0, MAX_ITEMS)
    } catch {
      return "[unavailable]"
    }

    const result: Record<string, unknown> = {}
    for (const [key, nested] of entries) {
      if (isSensitiveKey(key)) {
        result[key] = REDACTED
        continue
      }
      try {
        result[key] = sanitize(nested, depth + 1)
      } catch {
        result[key] = "[unavailable]"
      }
    }
    return result
  }

  return sanitize(value, 0)
}

type Observation = { update(attributes: Record<string, unknown>): unknown }
type LangfuseDependencies = {
  propagateAttributes(attributes: Record<string, unknown>, callback: () => unknown): unknown
  startActiveObservation(
    name: string,
    callback: (observation: Observation) => unknown,
    options?: Record<string, unknown>
  ): unknown
  flush?: () => Promise<void>
}

function propagatedMetadata(operation: TelemetryOperation): Record<string, unknown> {
  const sanitized = sanitizeTelemetryValue(operation.metadata) as Record<string, unknown> | undefined
  const metadata: Record<string, string> = {}
  for (const [key, value] of Object.entries(sanitized ?? {})) {
    metadata[key] = (typeof value === "string" ? value : JSON.stringify(value)).slice(0, 200)
  }
  return { traceName: operation.name.slice(0, 200), metadata }
}

export class NoopTelemetry implements Telemetry {
  async trace<T>(_operation: TelemetryOperation, callback: () => T | Promise<T>): Promise<T> {
    return await callback()
  }

  async wrap<T>(_operation: TelemetryOperation, callback: () => T | Promise<T>): Promise<T> {
    return await callback()
  }

  async flush(): Promise<void> {}
}

export class LangfuseTelemetry implements Telemetry {
  private readonly dependencies: LangfuseDependencies

  constructor(dependencies?: LangfuseDependencies) {
    this.dependencies = dependencies ?? {
      propagateAttributes: (attributes, callback) => propagateAttributes(attributes, callback),
      startActiveObservation: (name, callback, options) =>
        startActiveObservation(name, callback, options),
    }
  }

  async trace<T>(operation: TelemetryOperation, callback: () => T | Promise<T>): Promise<T> {
    return await this.observe(operation, callback, "span")
  }

  async wrap<T>(operation: TelemetryOperation, callback: () => T | Promise<T>): Promise<T> {
    return await this.observe(operation, callback, "generation")
  }

  async flush(): Promise<void> {
    try {
      await this.dependencies.flush?.()
    } catch {
      return
    }
  }

  private async observe<T>(
    operation: TelemetryOperation,
    callback: () => T | Promise<T>,
    asType: "span" | "generation"
  ): Promise<T> {
    const attributes = propagatedMetadata(operation)
    return await this.dependencies.propagateAttributes(attributes, () =>
      this.dependencies.startActiveObservation(
        operation.name,
        async (observation) => {
          observation.update({ input: sanitizeTelemetryValue(operation.input) })
          const result = await callback()
          observation.update({ output: sanitizeTelemetryValue(result) })
          return result
        },
        { asType }
      )
    ) as T
  }
}
