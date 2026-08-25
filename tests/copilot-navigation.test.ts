import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const professorLayout = "app/dashboard/professor/_layout-client.tsx"
const copilotPage = "app/dashboard/professor/copilot/page.tsx"
const copilotClient = "app/dashboard/professor/copilot/copilot-client.tsx"

function source(path: string): string {
  return readFileSync(path, "utf8")
}

test("professor dashboard exposes Copilot in the sidebar navigation", () => {
  const layout = source(professorLayout)

  assert.match(layout, /name:\s*"Copilot"/)
  assert.match(layout, /href:\s*"\/dashboard\/professor\/copilot"/)
  assert.match(layout, /copilotAvailable/)
  assert.match(layout, /item\.href !== "\/dashboard\/professor\/copilot" \|\| copilotAvailable/)
})

test("professor Copilot route is protected and renders the client experience", () => {
  const page = source(copilotPage)

  assert.match(page, /requireApprovedProfessorAccess\(\)/)
  assert.match(page, /requireDefaultCopilotAccess\(/)
  assert.match(page, /<CopilotClient\s*\/>/)
})

test("professor layout resolves beta access before exposing Copilot navigation", () => {
  const layout = source("app/dashboard/professor/layout.tsx")

  assert.match(layout, /getDefaultCopilotAccess\(/)
  assert.match(layout, /copilotAvailable=\{copilotAccess\.ok\}/)
})

test("Copilot client uses the professor-scoped API without sending teacher_id", () => {
  const client = source(copilotClient)

  assert.match(client, /fetch\("\/api\/copilot\/conversations"/)
  assert.match(client, /fetch\(`\/api\/copilot\/conversations\/\$\{conversationId\}`/)
  assert.match(client, /fetch\(`\/api\/copilot\/conversations\/\$\{conversationId\}\/messages`/)
  assert.match(client, /fetch\(`\/api\/copilot\/conversations\/\$\{conversationId\}\/feedback`/)
  assert.match(client, /fetch\("\/api\/copilot\/usage"/)
  assert.doesNotMatch(client, /teacher_id|teacherId/)
})

test("Copilot usage display is backed by server values", () => {
  const client = source(copilotClient)

  assert.match(client, /usedRequests/)
  assert.match(client, /requestLimit/)
  assert.doesNotMatch(client, /sessionRequests|setSessionRequests/)
})

test("Copilot client renders required states, citations, feedback and usage copy", () => {
  const client = source(copilotClient)

  for (const requiredCopy of [
    "Carregando conversas",
    "Nenhuma conversa ainda",
    "Nao foi possivel carregar o Copilot",
    "Fontes",
    "Resposta util",
    "Resposta ruim",
    "Uso diario",
  ]) {
    assert.match(client, new RegExp(requiredCopy))
  }
})

test("Copilot client sends optional feedback comments with the selected rating", () => {
  const client = source(copilotClient)

  assert.match(client, /feedbackCommentByMessage/)
  assert.match(client, /placeholder="Conte o que ajudou ou faltou na resposta"/)
  assert.match(client, /sendFeedback\(message\.id, "positive", feedbackCommentByMessage\[message\.id\]/)
  assert.match(client, /sendFeedback\(message\.id, "negative", feedbackCommentByMessage\[message\.id\]/)
  assert.match(client, /JSON\.stringify\(\{ messageId, rating, comment: trimmedComment \|\| undefined \}\)/)
})

test("Copilot empty state suggested questions can populate or send the prompt", () => {
  const client = source(copilotClient)

  assert.match(client, /const suggestedQuestions = \[/)
  assert.match(client, /Como posso adaptar a proxima atividade para alunos com dificuldades\?/)
  assert.match(client, /function sendSuggestedQuestion\(question: string\)/)
  assert.match(client, /setInput\(question\)/)
  assert.match(client, /sendPrompt\(question\)/)
  assert.match(client, /Usar/)
  assert.match(client, /Enviar agora/)
})
