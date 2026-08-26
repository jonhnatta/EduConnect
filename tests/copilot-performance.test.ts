import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("analysis surface exposes an explicit aggregate Copilot action", () => {
  const source = readFileSync("app/dashboard/professor/analise/page.tsx", "utf8")
  assert.match(source, /CopilotClassroomAction/)
  assert.match(source, /mode="performance"/)
})
