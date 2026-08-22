# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: public-smoke.spec.ts >> liveness e paginas publicas essenciais respondem
- Location: e2e/public-smoke.spec.ts:9:1

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
```

# Test source

```ts
  1  | import { expect, test, type Page } from "@playwright/test"
  2  | 
  3  | function failOnPageErrors(page: Page) {
  4  |   const errors: string[] = []
  5  |   page.on("pageerror", (error) => errors.push(error.message))
  6  |   return () => expect(errors, `Erros JavaScript na pagina: ${errors.join(" | ")}`).toEqual([])
  7  | }
  8  | 
  9  | test("liveness e paginas publicas essenciais respondem", async ({ page, request }) => {
  10 |   const live = await request.get("/api/health/live")
> 11 |   expect(live.ok()).toBeTruthy()
     |                     ^ Error: expect(received).toBeTruthy()
  12 |   await expect(live.json()).resolves.toMatchObject({ status: "ok" })
  13 | 
  14 |   const assertNoErrors = failOnPageErrors(page)
  15 |   for (const path of ["/", "/login", "/cadastro", "/cookies"]) {
  16 |     const response = await page.goto(path)
  17 |     expect(response?.ok(), `${path} deve responder 2xx`).toBeTruthy()
  18 |     await expect(page).toHaveTitle(/EduConnect/i)
  19 |   }
  20 |   assertNoErrors()
  21 | })
  22 | 
  23 | test("documentos legais usam configuracao real do ambiente", async ({ page }) => {
  24 |   for (const path of ["/privacidade", "/termos"]) {
  25 |     const response = await page.goto(path)
  26 |     expect(response?.ok(), `${path} deve responder 2xx`).toBeTruthy()
  27 |     await expect(page.getByText("Configuração obrigatória pendente")).toHaveCount(0)
  28 |   }
  29 | })
  30 | 
  31 | test("dashboard anonimo redireciona para login sem open redirect", async ({ page, baseURL }) => {
  32 |   await page.goto("/dashboard/aluno")
  33 |   const expectedUrl = new URL("/login?next=%2Fdashboard%2Faluno", baseURL ?? "http://127.0.0.1:3000")
  34 |   await expect(page).toHaveURL(expectedUrl.toString())
  35 |   await expect(page.getByLabel("E-mail")).toBeVisible()
  36 | })
  37 | 
```