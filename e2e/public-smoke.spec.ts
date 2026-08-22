import { expect, test, type Page } from "@playwright/test"

function failOnPageErrors(page: Page) {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  return () => expect(errors, `Erros JavaScript na pagina: ${errors.join(" | ")}`).toEqual([])
}

test("liveness e paginas publicas essenciais respondem", async ({ page, request }) => {
  const live = await request.get("/api/health/live")
  expect(live.ok()).toBeTruthy()
  await expect(live.json()).resolves.toMatchObject({ status: "ok" })

  const assertNoErrors = failOnPageErrors(page)
  for (const path of ["/", "/login", "/cadastro", "/cookies"]) {
    const response = await page.goto(path)
    expect(response?.ok(), `${path} deve responder 2xx`).toBeTruthy()
    await expect(page).toHaveTitle(/EduConnect/i)
  }
  assertNoErrors()
})

test("documentos legais usam configuracao real do ambiente", async ({ page }) => {
  for (const path of ["/privacidade", "/termos"]) {
    const response = await page.goto(path)
    expect(response?.ok(), `${path} deve responder 2xx`).toBeTruthy()
    await expect(page.getByText("Configuração obrigatória pendente")).toHaveCount(0)
  }
})

test("dashboard anonimo redireciona para login sem open redirect", async ({ page, baseURL }) => {
  await page.goto("/dashboard/aluno")
  const expectedUrl = new URL("/login?next=%2Fdashboard%2Faluno", baseURL ?? "http://127.0.0.1:3000")
  await expect(page).toHaveURL(expectedUrl.toString())
  await expect(page.getByLabel("E-mail")).toBeVisible()
})
