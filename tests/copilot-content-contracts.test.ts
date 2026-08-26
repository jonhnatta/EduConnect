import assert from "node:assert/strict"
import test from "node:test"
import {
  contentGenerationInputSchema,
  contentProposalSchema,
  contentReviewInputSchema,
  studentContentDraftSchema,
  toStudentContentDraft,
} from "../lib/ai/copilot/content-contracts.ts"
import {
  CONTENT_PROMPT_VERSION,
  buildContentGenerationPrompt,
  buildContentReviewPrompt,
} from "../lib/ai/copilot/content-prompts.ts"

const citation = {
  kind: "internal" as const,
  id: "source-1",
  title: "Material autorizado",
  url: "/materiais/source-1",
  retrievedAt: "2026-08-25T12:00:00.000Z",
  excerpt: "A evidência autoriza a explicação do conceito solicitado.",
}

const teacherQuestion = {
  id: "q-1",
  order: 1,
  type: "mcq" as const,
  prompt: "Qual alternativa resume o conceito?",
  options: ["Alternativa correta", "Alternativa incorreta"],
  points: 1,
  teacherAnswer: {
    correctIndex: 0,
    rationale: "A primeira alternativa corresponde à evidência autorizada.",
  },
}

const generationInputs = {
  article: {
    module: "article",
    topic: "Fotossíntese",
    audience: "8º ano",
    objective: "Explicar a transformação de energia nas plantas.",
    sourceIds: ["11111111-1111-4111-8111-111111111111"],
  },
  exercise: {
    module: "exercise",
    topic: "Fotossíntese",
    audience: "8º ano",
    objective: "Verificar a compreensão do processo.",
    questionCount: 3,
    sourceIds: [],
  },
  assessment: {
    module: "assessment",
    topic: "Fotossíntese",
    audience: "8º ano",
    objective: "Avaliar a compreensão do processo.",
    questionCount: 5,
    sourceIds: [],
  },
  simulado: {
    module: "simulado",
    topic: "Fotossíntese",
    audience: "Pré-vestibular",
    objective: "Simular questões de ciências.",
    questionCount: 10,
    sourceIds: [],
  },
  tip: {
    module: "tip",
    topic: "Fotossíntese",
    audience: "8º ano",
    objective: "Reforçar a revisão antes da atividade.",
    sourceIds: [],
  },
  performance: {
    module: "performance",
    classroomId: "11111111-1111-4111-8111-111111111111",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-25",
    objective: "Identificar tendências agregadas para replanejamento.",
  },
  classroom: {
    module: "classroom",
    classroomId: "11111111-1111-4111-8111-111111111111",
    topic: "Fotossíntese",
    objective: "Sugerir uma atividade para a turma.",
    sourceIds: [],
  },
} as const

test("accepts bounded generation input for every generation module", () => {
  for (const input of Object.values(generationInputs)) {
    assert.equal(contentGenerationInputSchema.safeParse(input).success, true, input.module)
  }
})

test("rejects oversized and unknown generation input fields", () => {
  assert.equal(
    contentGenerationInputSchema.safeParse({
      ...generationInputs.article,
      topic: "a".repeat(241),
    }).success,
    false
  )
  assert.equal(
    contentGenerationInputSchema.safeParse({
      ...generationInputs.article,
      teacherId: "must-be-derived-on-the-server",
    }).success,
    false
  )
})

test("requires original content when reviewing a professor draft", () => {
  assert.equal(
    contentReviewInputSchema.safeParse({
      module: "review",
      targetModule: "exercise",
      objective: "Melhorar a clareza das questões.",
      sourceIds: [],
    }).success,
    false
  )
  assert.equal(
    contentReviewInputSchema.safeParse({
      module: "review",
      targetModule: "exercise",
      objective: "Melhorar a clareza das questões.",
      sourceIds: [],
      originalContent: {
        module: "exercise",
        title: "Exercício de fotossíntese",
        instructions: "Responda às questões.",
        questions: [teacherQuestion],
      },
    }).success,
    true
  )
})

test("rejects approved proposals without citations", () => {
  const proposal = {
    module: "exercise",
    mode: "generate",
    draft: {
      module: "exercise",
      title: "Exercício de fotossíntese",
      instructions: "Responda às questões.",
      questions: [teacherQuestion],
    },
    changeSummary: "Cria três questões alinhadas ao objetivo.",
    warnings: [],
    citations: [],
    model: "gpt-test",
    usage: { inputTokens: 100, outputTokens: 80 },
    safety: { decision: "approved", policyVersion: "content-v1" },
  }

  assert.equal(contentProposalSchema.safeParse(proposal).success, false)
  assert.equal(
    contentProposalSchema.safeParse({ ...proposal, citations: [citation] }).success,
    true
  )
})

test("rejects unknown fields in proposal usage, safety, and citations", () => {
  const proposal = {
    module: "article",
    mode: "generate",
    draft: {
      module: "article",
      title: "Fotossíntese",
      bodyHtml: "<p>Texto baseado na evidência.</p>",
    },
    changeSummary: "Cria um artigo conciso.",
    warnings: [],
    citations: [citation],
    model: "gpt-test",
    usage: { inputTokens: 100, outputTokens: 80 },
    safety: { decision: "approved", policyVersion: "content-v1" },
  }

  assert.equal(contentProposalSchema.safeParse({
    ...proposal,
    usage: { ...proposal.usage, providerCost: 0.01 },
  }).success, false)
  assert.equal(contentProposalSchema.safeParse({
    ...proposal,
    safety: { ...proposal.safety, internalReason: "not-for-client" },
  }).success, false)
  assert.equal(contentProposalSchema.safeParse({
    ...proposal,
    citations: [{ ...citation, rawDocument: "do-not-return" }],
  }).success, false)
})

test("bounds citation metadata and safety policy versions", () => {
  const proposal = {
    module: "article",
    mode: "generate",
    draft: {
      module: "article",
      title: "Fotossíntese",
      bodyHtml: "<p>Texto baseado na evidência.</p>",
    },
    changeSummary: "Cria um artigo conciso.",
    warnings: [],
    citations: [citation],
    model: "gpt-test",
    usage: { inputTokens: 100, outputTokens: 80 },
    safety: { decision: "approved", policyVersion: "content-v1" },
  }

  for (const invalidCitation of [
    { ...citation, id: "i".repeat(161) },
    { ...citation, title: "t".repeat(301) },
    { ...citation, url: `/${"u".repeat(2_048)}` },
    { ...citation, retrievedAt: "2026-08-25T12:00:00.000Z".repeat(4) },
    { ...citation, excerpt: "e".repeat(2_001) },
  ]) {
    assert.equal(contentProposalSchema.safeParse({
      ...proposal,
      citations: [invalidCitation],
    }).success, false)
  }
  assert.equal(contentProposalSchema.safeParse({
    ...proposal,
    safety: { ...proposal.safety, policyVersion: "p".repeat(101) },
  }).success, false)
})

test("accepts abstained and blocked proposals with a null factual draft", () => {
  for (const decision of ["abstain", "blocked"] as const) {
    assert.equal(contentProposalSchema.safeParse({
      module: "article",
      mode: "generate",
      draft: null,
      changeSummary: "Não foi possível gerar conteúdo com segurança.",
      warnings: ["Faltam evidências autorizadas para sustentar uma proposta."],
      citations: [],
      model: "gpt-test",
      usage: { inputTokens: 20, outputTokens: 0 },
      safety: { decision, policyVersion: "content-v1" },
    }).success, true, decision)
  }
})

test("rejects citations on abstained and blocked proposals", () => {
  for (const decision of ["abstain", "blocked"] as const) {
    assert.equal(contentProposalSchema.safeParse({
      module: "article",
      mode: "generate",
      draft: null,
      changeSummary: "Não foi possível gerar conteúdo com segurança.",
      warnings: ["Faltam evidências autorizadas para sustentar uma proposta."],
      citations: [citation],
      model: "gpt-test",
      usage: { inputTokens: 20, outputTokens: 0 },
      safety: { decision, policyVersion: "content-v1" },
    }).success, false, decision)
  }
})

test("creates a strict student DTO that never includes teacher answers", () => {
  const teacherDraft = {
    module: "assessment" as const,
    title: "Avaliação de fotossíntese",
    instructions: "Responda individualmente.",
    questions: [teacherQuestion],
  }

  const studentDraft = toStudentContentDraft(teacherDraft)
  assert.ok("questions" in studentDraft)
  assert.equal("teacherAnswer" in studentDraft.questions[0]!, false)
  assert.equal(studentContentDraftSchema.safeParse(studentDraft).success, true)
  assert.equal(
    studentContentDraftSchema.safeParse({
      ...studentDraft,
      questions: [teacherQuestion],
    }).success,
    false
  )
})

test("versioned prompts require strict JSON, authorized context, and abstention", () => {
  const generationPrompt = buildContentGenerationPrompt({
    input: contentGenerationInputSchema.parse(generationInputs.article),
    evidence: [citation],
  })
  const reviewPrompt = buildContentReviewPrompt({
    input: contentReviewInputSchema.parse({
      module: "review",
      targetModule: "article",
      objective: "Tornar a explicação mais objetiva.",
      sourceIds: [],
      originalContent: {
        module: "article",
        title: "Fotossíntese",
        bodyHtml: "<p>Texto original.</p>",
      },
    }),
    evidence: [citation],
  })

  assert.match(CONTENT_PROMPT_VERSION, /^content-copilot-v\d+$/)
  for (const prompt of [generationPrompt.system, generationPrompt.user, reviewPrompt.system, reviewPrompt.user]) {
    assert.match(prompt, /JSON/i)
    assert.match(prompt, /autorizad/i)
    assert.match(prompt, /absten/i)
  }
})
