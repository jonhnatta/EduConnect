import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const editorPath = "app/dashboard/professor/criar/criar-conteudo-client.tsx"

function source() {
  return readFileSync(editorPath, "utf8")
}

test("content editors expose generate and review Copilot controls for every supported module", () => {
  const editor = source()

  for (const contentModule of ["article", "exercise", "assessment", "simulado", "tip"]) {
    assert.match(editor, new RegExp(`return "${contentModule}"`))
  }
  assert.match(editor, /Gerar com Copilot/)
  assert.match(editor, /Revisar com Copilot/)
})

test("content proposal UI uses the common professor API and preserves an explicit draft-only workflow", () => {
  const editor = source()

  assert.match(editor, /fetch\("\/api\/copilot\/conversations"/)
  assert.match(editor, /fetch\("\/api\/copilot\/content"/)
  assert.match(editor, /\/api\/copilot\/content\/\$\{contentProposal\.id\}\/save/)
  assert.match(editor, /\/api\/copilot\/content\/\$\{contentProposal\.id\}/)
  assert.match(editor, /Salvar como rascunho/)
  assert.match(editor, /Editar proposta/)
  assert.doesNotMatch(editor, /handlePublish(?:Article|Exercise|Assessment|Simulado|Dica)\(\).*saveContentProposal/)
})

test("content proposal UI lets the professor select authorized sources without typing UUIDs", () => {
  const editor = source()

  assert.match(editor, /initialAuthorizedSources/)
  assert.match(editor, /type="checkbox"/)
  assert.match(editor, /Selecione materiais específicos/)
  assert.doesNotMatch(editor, /IDs UUID, separados por virgula/)
})

test("content proposal UI renders the proposal states and never handles teacher answers outside the professor editor", () => {
  const editor = source()

  for (const copy of ["Gerando proposta", "Nao foi possivel gerar a proposta", "Resumo das alteracoes", "Avisos", "Fontes", "Rejeitar"]) {
    assert.match(editor, new RegExp(copy))
  }
  assert.match(editor, /teacherAnswer/)
  assert.doesNotMatch(editor, /\/dashboard\/aluno/)
})
