import type { CopilotSafetyAudit } from "./types.ts"

const POLICY_VERSION = "copilot-input-v1"

const PROMPT_INJECTION_PATTERNS = [
  /\bignore\s+(?:all\s+)?(?:(?:previous|prior)\s+)?system\s+(?:instructions?|rules?|prompts?)\b/i,
  /\bignore\s+(?:all\s+)?(?:previous|prior|system)\s+(?:instructions?|rules?|prompts?)\b/i,
  /\bdisregard\s+(?:all\s+)?(?:previous|prior|system)\s+(?:instructions?|rules?|prompts?)\b/i,
  /\b(?:reveal|show|print|repeat)\s+(?:the\s+)?system\s+prompt\b/i,
  /\bignore\s+(?:todas?\s+as\s+)?(?:instrucoes|regras)\s+(?:anteriores|do\s+sistema)\b/i,
  /\b(?:revele|mostre|imprima|repita)\s+(?:o\s+)?prompt\s+do\s+sistema\b/i,
]

function normalizeInput(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export type CopilotInputGuardrailDecision =
  | { ok: true }
  | { ok: false; safety: CopilotSafetyAudit }

export function evaluateCopilotInput(content: string): CopilotInputGuardrailDecision {
  const normalized = normalizeInput(content)
  if (!PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { ok: true }
  }
  return {
    ok: false,
    safety: {
      decision: "blocked",
      policyVersion: POLICY_VERSION,
      reasonCode: "prompt_injection",
    },
  }
}
