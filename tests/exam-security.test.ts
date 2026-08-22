import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { parseExamFromSettings, toPublicExam } from "../lib/activities/exam.ts"

test("public exam payload never contains the answer key", () => {
  const exam = parseExamFromSettings({
    exam: {
      version: 1,
      questions: [
        {
          id: "q1",
          order: 0,
          type: "mcq",
          prompt: "Quanto e 2 + 2?",
          options: ["3", "4"],
          correctIndex: 1,
          points: 1,
        },
      ],
    },
  })
  assert.ok(exam)

  const payload = toPublicExam(exam)
  assert.equal("correctIndex" in payload.questions[0], false)
  assert.equal(JSON.stringify(payload).includes("correctIndex"), false)
})

test("student activity boundaries redact answer keys and gate solutions", () => {
  const activities = readFileSync(new URL("../app/actions/classroom-activities.ts", import.meta.url), "utf8")
  const submissions = readFileSync(new URL("../app/actions/activity-submissions.ts", import.meta.url), "utf8")
  assert.match(activities, /listActivitiesForClassroomAsStudent[\s\S]*\.map\(toStudentActivityRow\)/)
  assert.match(activities, /getActivityForStudent[\s\S]*toStudentActivityRow\(row\)/)
  assert.match(submissions, /getMcqSolutionsForActivity[\s\S]*s\.student_id = \$3 and s\.status = 'enviado'/)
  assert.match(submissions, /getExamForStudent[\s\S]*assertActivityWindowAllowed\(data\.starts_at, data\.due_at\)/)
})
