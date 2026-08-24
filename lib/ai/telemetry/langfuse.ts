import { propagateAttributes, startActiveObservation } from "@langfuse/tracing"

const REDACTED = "[redacted]"
const MAX_DEPTH = 6
const MAX_ITEMS = 50
const MAX_STRING_LENGTH = 8_000
const SENSITIVE_KEY = /(password|secret|token|authorization|cookie|apikey|answerkey|gabarito|headers?)/i
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g
const CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g
const PHONE = /(?<!\d)(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-\s]?\d{4}(?!\d)/g
const JWT = /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g
const RAW_API_SECRET = /\b(?:sk|pk)-(?:proj-)?[A-Za-z0-9_-]{6,}\b/gi
const CONTEXTUAL_NAME = /\b(alun[oa]|student|nome)\s*(?::|=)?\s+([A-ZÀ-ÖØ-Þ][\p{L}'’-]+(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’-]+){1,4})/gu
const PII_KEY = /(cpf|studentname|alun[oa]|fullname|nomecompleto)/i
const SAFE_TEXT_KEY = /^(?:tenantId|teacherId|classroomId|documentId|sourceId|runId|traceId|correlationId|eventId|category|decision|reasonCode|policyVersion|status|model|provider|toolName)$/
const SAFE_TEXT_VALUE = /^[a-zA-Z0-9_.:@/-]{1,200}$/

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, "")
  return normalized.toLowerCase() === "auth" || SENSITIVE_KEY.test(normalized) || PII_KEY.test(normalized)
}

function sanitizeTelemetryText(value: string): string {
  return value
    .replace(/["']?\bauthorization\b["']?\s*[:=]\s*["']?(?:bearer|basic)\s+[^\s,;"'}]+["']?/gi, "Authorization: [authorization-redacted]")
    .replace(/\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "[authorization-redacted]")
    .replace(/["']?\b(?:set-cookie|cookie)\b["']?\s*:\s*["']?[^\r\n"'}]+["']?/gi, "Cookie: [cookie-redacted]")
    .replace(JWT, "[token-redacted]")
    .replace(RAW_API_SECRET, "[secret-redacted]")
    .replace(/["']?\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|session(?:id)?|token)\b["']?\s*(?::|=|\bis\b|\bé\b)\s*["']?[^\s,;"'}]+["']?/gi, "[secret-redacted]")
    .replace(/\b(?:senha|password|passphrase)\b[^\r\n]{0,80}?\s(?:é|is)\s+["']?[^\s,;"']+/gi, "[secret-redacted]")
    .replace(/["']?\b(?:senha|password|passphrase)\b["']?\s*[:=]\s*["']?[^\s,;"'}]+["']?/gi, "[secret-redacted]")
    .replace(CONTEXTUAL_NAME, "$1 [name-redacted]")
    .replace(EMAIL, "[email-redacted]")
    .replace(CNPJ, "[cnpj-redacted]")
    .replace(CPF, "[cpf-redacted]")
    .replace(PHONE, "[phone-redacted]")
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
      return sanitizeTelemetryText(current.slice(0, MAX_STRING_LENGTH))
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

export type TelemetryContentPolicy = {
  captureContent?: boolean
  sampleRate?: number
  random?: () => number
}

export function metadataOnlyTelemetryValue(value: unknown): unknown {
  const visited = new WeakSet<object>()
  function transform(current: unknown, key: string | undefined, depth: number): unknown {
    if (typeof current === "string") {
      if (key && SAFE_TEXT_KEY.test(key) && SAFE_TEXT_VALUE.test(current)) return current
      return { length: current.length }
    }
    if (current === null || typeof current === "boolean") return current
    if (typeof current === "number") return Number.isFinite(current) ? current : "[non-finite]"
    if (typeof current !== "object") return "[unsupported]"
    if (isUnsupported(current)) return current instanceof Error ? "[error-redacted]" : "[unsupported]"
    if (depth >= MAX_DEPTH) return "[max-depth]"
    if (visited.has(current)) return "[circular]"
    visited.add(current)
    if (Array.isArray(current)) return { itemCount: current.length }

    const result: Record<string, unknown> = {}
    let entries: [string, unknown][]
    try {
      entries = Object.entries(current).slice(0, MAX_ITEMS)
    } catch {
      return "[unavailable]"
    }
    for (const [nestedKey, nested] of entries) {
      if (isSensitiveKey(nestedKey)) {
        result[nestedKey] = REDACTED
      } else {
        try {
          result[nestedKey] = transform(nested, nestedKey, depth + 1)
        } catch {
          result[nestedKey] = "[unavailable]"
        }
      }
    }
    return result
  }
  return transform(value, undefined, 0)
}

function propagatedMetadata(operation: TelemetryOperation): Record<string, unknown> {
  const sanitized = metadataOnlyTelemetryValue(operation.metadata) as Record<string, unknown> | undefined
  const metadata: Record<string, string> = {}
  for (const [key, value] of Object.entries(sanitized ?? {})) {
    metadata[key] = (typeof value === "string" ? value : JSON.stringify(value)).slice(0, 200)
  }
  return { traceName: safeOperationName(operation.name), metadata }
}

function safeOperationName(name: string): string {
  return /^[a-z][a-z0-9_.-]{0,199}$/.test(name) ? name : "ai.operation"
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
  private readonly policy: Required<TelemetryContentPolicy>

  constructor(dependencies?: LangfuseDependencies, policy: TelemetryContentPolicy = {}) {
    this.dependencies = dependencies ?? {
      propagateAttributes: (attributes, callback) => propagateAttributes(attributes, callback),
      startActiveObservation: (name, callback, options) =>
        startActiveObservation(name, callback, options),
    }
    const sampleRate = Number.isFinite(policy.sampleRate) && policy.sampleRate! >= 0 && policy.sampleRate! <= 1
      ? policy.sampleRate!
      : 0
    this.policy = {
      captureContent: policy.captureContent === true,
      sampleRate,
      random: policy.random ?? Math.random,
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
    const captureContent = this.policy.captureContent && this.policy.random() < this.policy.sampleRate
    const exportValue = (value: unknown) => captureContent
      ? sanitizeTelemetryValue(value)
      : metadataOnlyTelemetryValue(value)
    let callbackPromise: Promise<T> | undefined
    const runCallbackOnce = () => {
      callbackPromise ??= Promise.resolve().then(callback)
      return callbackPromise
    }

    try {
      const attributes = propagatedMetadata(operation)
      await this.dependencies.propagateAttributes(attributes, () =>
        this.dependencies.startActiveObservation(
          safeOperationName(operation.name),
          async (observation) => {
            try {
              observation.update({ input: exportValue(operation.input) })
            } catch {
              // Telemetry must remain outside the application callback's critical path.
            }
            const result = await runCallbackOnce()
            try {
              observation.update({ output: exportValue(result) })
            } catch {
              // Preserve the application result when telemetry export fails.
            }
            return result
          },
          { asType }
        )
      )
    } catch {
      // The callback is executed below exactly once, regardless of telemetry failures.
    }

    return await runCallbackOnce()
  }
}
