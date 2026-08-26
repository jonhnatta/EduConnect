import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("classroom Copilot action is explicit and does not auto-create content", () => {
  const source = readFileSync("components/dashboard/copilot-classroom-action.tsx", "utf8")
  assert.match(source, /module: mode/)
  assert.match(source, /sem criar ou publicar automaticamente/)
  assert.doesNotMatch(source, /\/save/)
})
