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
})

test("professor Copilot route is protected and renders the client experience", () => {
  const page = source(copilotPage)

  assert.match(page, /requireProfessorAccess\(\)/)
  assert.match(page, /<CopilotClient\s*\/>/)
})

test("Copilot client uses the professor-scoped API without sending teacher_id", () => {
  const client = source(copilotClient)

  assert.match(client, /fetch\("\/api\/copilot\/conversations"/)
  assert.match(client, /fetch\(`\/api\/copilot\/conversations\/\$\{conversationId\}\/messages`/)
  assert.match(client, /fetch\(`\/api\/copilot\/conversations\/\$\{conversationId\}\/feedback`/)
  assert.doesNotMatch(client, /teacher_id|teacherId/)
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
