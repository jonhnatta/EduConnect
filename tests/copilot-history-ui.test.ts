import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const client = readFileSync("app/dashboard/professor/copilot/copilot-client.tsx", "utf8")

test("professor Copilot exposes filtered proposal history and pagination", () => {
  assert.match(client, /\/api\/copilot\/content\/history/)
  assert.match(client, /Filtrar modulo/)
  assert.match(client, /Filtrar status/)
  assert.match(client, /Proxima/)
  assert.match(client, /Anterior/)
})

test("history supports reuse, explicit save and rejection actions", () => {
  assert.match(client, /Reutilizar/)
  assert.match(client, /Salvar rascunho/)
  assert.match(client, /Rejeitar proposta/)
  assert.match(client, /method: action === "save" \? "POST" : "DELETE"/)
})
