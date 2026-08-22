import test from "node:test"
import assert from "node:assert/strict"
import {
  authRedirectPath,
  canonicalAuthPageUrl,
  dashboardPathForUserType,
  profileRedirectPath,
  safeInternalPath,
} from "../lib/auth/redirect.ts"

test("keeps OAuth start and callback on the configured canonical origin", () => {
  assert.equal(
    canonicalAuthPageUrl(
      "http://127.0.0.1:3000/login?next=%2Fdashboard%2Faluno",
      "http://localhost:3000",
    ),
    "http://localhost:3000/login?next=%2Fdashboard%2Faluno",
  )
  assert.equal(
    canonicalAuthPageUrl("http://localhost:3000/login", "http://localhost:3000"),
    null,
  )
  assert.equal(
    canonicalAuthPageUrl("http://127.0.0.1:3000/login", "javascript:alert(1)"),
    null,
  )
})

test("redirects alunos to the student dashboard", () => {
  assert.equal(dashboardPathForUserType("aluno"), "/dashboard/aluno")
  assert.equal(authRedirectPath("aluno"), "/dashboard/aluno")
})

test("redirects professores to the professor dashboard", () => {
  assert.equal(dashboardPathForUserType("professor"), "/dashboard/professor")
  assert.equal(authRedirectPath("professor"), "/dashboard/professor")
})

test("redirects missing user type to profile completion", () => {
  assert.equal(authRedirectPath(null), "/cadastro/tipo-conta")
  assert.equal(authRedirectPath(undefined), "/cadastro/tipo-conta")
  assert.equal(authRedirectPath(""), "/cadastro/tipo-conta")
})

test("redirects professor by verification status", () => {
  assert.equal(
    profileRedirectPath({ user_type: "professor", professor_verification_status: "approved" }),
    "/dashboard/professor",
  )
  assert.equal(
    profileRedirectPath({ user_type: "professor", professor_verification_status: "pending" }),
    "/dashboard/professor?status=pendente",
  )
  assert.equal(
    profileRedirectPath({ user_type: "professor", professor_verification_status: "none" }),
    "/cadastro/tipo-conta",
  )
  assert.equal(
    profileRedirectPath({ user_type: "professor", professor_verification_status: "rejected" }),
    "/cadastro/tipo-conta",
  )
})

test("accepts only internal next paths", () => {
  assert.equal(safeInternalPath("/dashboard/aluno"), "/dashboard/aluno")
  assert.equal(safeInternalPath("/dashboard/aluno?tab=turmas#materiais"), "/dashboard/aluno?tab=turmas#materiais")
  assert.equal(safeInternalPath("https://example.com"), null)
  assert.equal(safeInternalPath("//example.com/path"), null)
  assert.equal(safeInternalPath("/\\example.com/path"), null)
  assert.equal(safeInternalPath("/%5cexample.com/path"), null)
  assert.equal(safeInternalPath("/%255cexample.com/path"), null)
  assert.equal(safeInternalPath("/%0d%0aLocation:%20https://example.com"), null)
  assert.equal(safeInternalPath(null), null)
})
