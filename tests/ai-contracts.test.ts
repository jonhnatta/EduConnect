import assert from "node:assert/strict"
import test from "node:test"
import { copilotResponseSchema } from "../lib/ai/contracts.ts"

const validResponse = {
  text: "A aprendizagem baseada em projetos pode aumentar o engajamento.",
  citations: [
    {
      kind: "web",
      id: "unesco-project-learning",
      title: "Project-based learning",
      url: "https://www.unesco.org/en/education/project-based-learning",
      retrievedAt: "2026-08-24T12:00:00.000Z",
      excerpt: "A abordagem conecta problemas reais ao desenvolvimento de competências.",
    },
  ],
  usage: {
    inputTokens: 120,
    outputTokens: 48,
  },
  safety: {
    decision: "approved",
    policyVersion: "2026-08-24",
  },
}

test("accepts a complete Copilot response with a web citation", () => {
  assert.deepEqual(copilotResponseSchema.parse(validResponse), validResponse)
})

test("rejects incomplete web citations", () => {
  for (const missingField of ["retrievedAt", "excerpt", "url"] as const) {
    const citation = { ...validResponse.citations[0] }
    delete citation[missingField]

    assert.equal(
      copilotResponseSchema.safeParse({
        ...validResponse,
        citations: [citation],
      }).success,
      false,
      `expected a citation without ${missingField} to be rejected`
    )
  }
})

test("rejects unsupported safety decisions", () => {
  assert.equal(
    copilotResponseSchema.safeParse({
      ...validResponse,
      safety: {
        ...validResponse.safety,
        decision: "publish",
      },
    }).success,
    false
  )
})
