import assert from "node:assert/strict"
import test from "node:test"
import {
  lessonPlanDraftSchema,
  lessonPlanInputSchema,
  lessonPlanProposalSchema,
} from "../lib/ai/copilot/lesson-plan.ts"

const validInput = {
  topic: "Revolução Industrial",
  audience: "Ensino médio",
  durationMinutes: 90,
  objective: "Compreender as transformações sociais e econômicas do período.",
  notes: "Relacionar o conteúdo à realidade local.",
  contentIds: ["123e4567-e89b-12d3-a456-426614174000"],
}

const validDraft = {
  title: "Revolução Industrial: causas e impactos",
  objectives: ["Identificar as principais transformações do período."],
  prerequisites: ["Conhecer a organização da sociedade europeia moderna."],
  durationMinutes: 90,
  steps: [
    {
      title: "Aquecimento",
      minutes: 10,
      description: "Levantar conhecimentos prévios da turma sobre industrialização.",
    },
  ],
  materials: ["Quadro e imagens históricas"],
  activity: "Em grupos, comparar duas imagens de fábricas e registrar diferenças.",
  assessment: "Observar a comparação e recolher uma síntese individual.",
  adaptations: ["Oferecer imagens com legendas e leitura compartilhada."],
  citations: [
    {
      kind: "internal",
      id: "material-1",
      title: "Material sobre industrialização",
      url: "/materiais/material-1",
      retrievedAt: "2026-08-25T12:00:00.000Z",
      excerpt: "A industrialização alterou o trabalho e a vida urbana.",
    },
  ],
}

test("accepts valid lesson plan input with defaults and UUID references", () => {
  assert.deepEqual(
    lessonPlanInputSchema.parse({
      topic: validInput.topic,
      durationMinutes: validInput.durationMinutes,
      objective: validInput.objective,
    }),
    { topic: validInput.topic, audience: "", durationMinutes: 90, objective: validInput.objective, notes: "", contentIds: [] }
  )
  assert.deepEqual(lessonPlanInputSchema.parse(validInput), validInput)
})

test("rejects invalid required input and duration bounds", () => {
  for (const value of [
    { ...validInput, topic: undefined },
    { ...validInput, topic: "" },
    { ...validInput, topic: "   " },
    { ...validInput, topic: "ab" },
    { ...validInput, objective: "ab" },
    { ...validInput, durationMinutes: 14 },
    { ...validInput, durationMinutes: 301 },
    { ...validInput, durationMinutes: 90.5 },
    { ...validInput, contentIds: ["not-a-uuid"] },
  ]) {
    assert.equal(lessonPlanInputSchema.safeParse(value).success, false)
  }
})

test("rejects oversized input fields and content references", () => {
  assert.equal(lessonPlanInputSchema.safeParse({ ...validInput, audience: "a".repeat(161) }).success, false)
  assert.equal(lessonPlanInputSchema.safeParse({ ...validInput, notes: "a".repeat(2_001) }).success, false)
  assert.equal(
    lessonPlanInputSchema.safeParse({
      ...validInput,
      contentIds: Array.from({ length: 21 }, (_, index) => `123e4567-e89b-12d3-a456-42661417${String(index).padStart(4, "0")}`),
    }).success,
    false
  )
})

test("accepts a bounded lesson plan draft with citations", () => {
  assert.deepEqual(lessonPlanDraftSchema.parse(validDraft), validDraft)
})

test("rejects lesson plan drafts beyond objective, step, material and text limits", () => {
  assert.equal(lessonPlanDraftSchema.safeParse({ ...validDraft, objectives: Array.from({ length: 9 }, () => "Objetivo válido") }).success, false)
  assert.equal(lessonPlanDraftSchema.safeParse({ ...validDraft, steps: Array.from({ length: 13 }, () => validDraft.steps[0]) }).success, false)
  assert.equal(lessonPlanDraftSchema.safeParse({ ...validDraft, materials: Array.from({ length: 13 }, () => "Material") }).success, false)
  assert.equal(lessonPlanDraftSchema.safeParse({ ...validDraft, steps: [{ ...validDraft.steps[0], description: "a".repeat(1_001) }] }).success, false)
})

test("accepts a lesson plan proposal with status, usage, safety and optional saved item", () => {
  const proposal = {
    id: "123e4567-e89b-12d3-a456-426614174001",
    conversationId: "123e4567-e89b-12d3-a456-426614174002",
    status: "proposed",
    draft: validDraft,
    citations: validDraft.citations,
    usage: { inputTokens: 120, outputTokens: 240 },
    safety: { decision: "approved", policyVersion: "2026-08-25" },
    contentItemId: null,
  }

  assert.deepEqual(lessonPlanProposalSchema.parse(proposal), proposal)
})

test("requires proposal citations to match the draft citations", () => {
  const proposal = {
    id: "123e4567-e89b-12d3-a456-426614174001",
    conversationId: "123e4567-e89b-12d3-a456-426614174002",
    status: "proposed",
    draft: validDraft,
    citations: [],
    usage: { inputTokens: 120, outputTokens: 240 },
    safety: { decision: "approved", policyVersion: "2026-08-25" },
    contentItemId: null,
  }

  assert.equal(lessonPlanProposalSchema.safeParse(proposal).success, false)
})

test("requires a saved proposal to have a content item and other statuses not to have one", () => {
  const base = {
    id: "123e4567-e89b-12d3-a456-426614174001",
    conversationId: "123e4567-e89b-12d3-a456-426614174002",
    draft: validDraft,
    citations: validDraft.citations,
    usage: { inputTokens: 120, outputTokens: 240 },
    safety: { decision: "approved", policyVersion: "2026-08-25" },
  }

  assert.equal(
    lessonPlanProposalSchema.safeParse({ ...base, status: "saved", contentItemId: null }).success,
    false
  )
  assert.equal(
    lessonPlanProposalSchema.safeParse({ ...base, status: "saved", contentItemId: "123e4567-e89b-12d3-a456-426614174003" }).success,
    true
  )
  for (const status of ["proposed", "rejected", "blocked", "failed"] as const) {
    assert.equal(
      lessonPlanProposalSchema.safeParse({ ...base, status, contentItemId: "123e4567-e89b-12d3-a456-426614174003" }).success,
      false,
      `expected ${status} to reject a content item`
    )
  }
})
