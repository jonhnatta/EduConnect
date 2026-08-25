import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import type { QueryResultRow } from "pg"
import {
  CopilotServiceError,
  type CopilotServiceApi,
  createCopilotApiHandlers,
} from "../lib/ai/copilot/http.ts"
import { PostgresCopilotRepository } from "../lib/ai/copilot/postgres-repository.ts"
import type {
  CopilotActor,
  CopilotConversation,
  CopilotMessage,
} from "../lib/ai/copilot/types.ts"

const routeFiles = [
  "app/api/copilot/conversations/route.ts",
  "app/api/copilot/conversations/[conversationId]/route.ts",
  "app/api/copilot/conversations/[conversationId]/messages/route.ts",
  "app/api/copilot/conversations/[conversationId]/feedback/route.ts",
  "app/api/copilot/usage/route.ts",
]
const migrateRunner = "scripts/migrate.mjs"
const postgresRepository = "lib/ai/copilot/postgres-repository.ts"

const professor: CopilotActor = {
  userId: "11111111-1111-4111-8111-111111111111",
  userType: "professor",
}
const student: CopilotActor = {
  userId: "22222222-2222-4222-8222-222222222222",
  userType: "aluno",
}
const conversationId = "44444444-4444-4444-8444-444444444444"
const messageId = "55555555-5555-4555-8555-555555555555"

function conversation(overrides: Partial<CopilotConversation> = {}): CopilotConversation {
  return {
    id: conversationId,
    teacherId: professor.userId,
    title: "Planejamento",
    classroomId: null,
    status: "active",
    createdAt: "2026-08-24T12:00:00.000Z",
    updatedAt: "2026-08-24T12:00:00.000Z",
    ...overrides,
  }
}

function publicConversation(overrides: Partial<CopilotConversation> = {}) {
  const { teacherId: _teacherId, ...publicDto } = conversation(overrides)
  return publicDto
}

function assertNoTeacherIdentifier(value: unknown) {
  if (Array.isArray(value)) {
    for (const item of value) assertNoTeacherIdentifier(item)
    return
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      assert.notEqual(key, "teacherId")
      assert.notEqual(key, "teacher_id")
      assertNoTeacherIdentifier(item)
    }
  }
}

function message(overrides: Partial<CopilotMessage> = {}): CopilotMessage {
  return {
    id: messageId,
    conversationId,
    role: "assistant",
    content: "Resposta fundamentada.",
    status: "completed",
    model: "test-model",
    provider: "openai",
    promptVersion: "copilot-professor-v1",
    createdAt: "2026-08-24T12:00:00.000Z",
    completedAt: "2026-08-24T12:00:01.000Z",
    errorCode: null,
    ...overrides,
  }
}

function conversationDetail() {
  return {
    conversation: conversation(),
    messages: [
      message({
        id: "66666666-6666-4666-8666-666666666666",
        role: "user",
        content: "Ajude",
        model: null,
        provider: null,
        promptVersion: null,
      }),
      message(),
    ],
    citationsByMessage: {
      [messageId]: [{
        sourceId: "material-1",
        sourceKind: "internal" as const,
        title: "Sequencia didatica",
        excerpt: "Pratica guiada ajuda a consolidar o conteudo.",
        url: "/materiais/material-1",
        retrievedAt: "2026-08-24T12:00:00.000Z",
        displayOrder: 0,
      }],
    },
    feedbackByMessage: {
      [messageId]: {
        rating: "positive" as const,
        comment: "util",
      },
    },
  }
}

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`https://educonnect.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function params() {
  return { params: { conversationId } }
}

function setup(options: {
  actor?: CopilotActor | null
  service?: Partial<CopilotServiceApi>
} = {}) {
  const calls: Record<string, unknown[]> = {
    create: [],
    list: [],
    get: [],
    send: [],
    feedback: [],
    usage: [],
  }
  const service: CopilotServiceApi = {
    createConversation: async (input) => {
      calls.create.push(input)
      return conversation({ title: input.title ?? "Nova conversa" })
    },
    listConversations: async (input) => {
      calls.list.push(input)
      return [conversation()]
    },
    getConversation: async (input) => {
      calls.get.push(input)
      return conversationDetail()
    },
    sendMessage: async (input) => {
      calls.send.push(input)
      return {
        userMessage: message({
          id: "66666666-6666-4666-8666-666666666666",
          role: "user",
          content: input.content,
          model: null,
          provider: null,
          promptVersion: null,
        }),
        assistantMessage: message(),
        citations: [],
      }
    },
    saveFeedback: async (input) => {
      calls.feedback.push(input)
    },
    getDailyUsage: async (input) => {
      calls.usage.push(input)
      return {
        usedRequests: 4,
        requestLimit: 20,
      }
    },
    ...options.service,
  }
  const handlers = createCopilotApiHandlers({
    resolveActor: async () => options.actor === undefined ? professor : options.actor,
    service,
  })
  return { calls, handlers }
}

test("exposes the required App Router copilot route files", () => {
  for (const file of routeFiles) {
    const source = readFileSync(file, "utf8")
    assert.match(source, /createDefaultCopilotApiHandlers/)
  }
})

test("usage route is wired to the default App Router handlers", () => {
  const source = readFileSync("app/api/copilot/usage/route.ts", "utf8")

  assert.match(source, /createDefaultCopilotApiHandlers/)
  assert.match(source, /handlers\.getDailyUsage/)
})

test("registers the feedback migration used by the feedback route", () => {
  const source = readFileSync(migrateRunner, "utf8")
  assert.match(source, /\["00580", "ai_copilot_feedback", "scripts\/054_ai_copilot_feedback\.sql"\]/)
})

test("message persistence updates conversation recency in the same repository operation", () => {
  const source = readFileSync(postgresRepository, "utf8")
  assert.match(source, /update public\.ai_conversations\s+set updated_at = timezone\('utc'::text, now\(\)\)/i)
})

test("appendMessage updates conversation recency in the same transaction", async () => {
  const calls: { sql: string; params?: unknown[] }[] = []
  const repository = new PostgresCopilotRepository({
    query: async () => {
      throw new Error("appendMessage must use the injected transaction")
    },
    transaction: async (work) => {
      const client = {
        query: async <Row extends QueryResultRow = QueryResultRow>(
          sql: string,
          params?: unknown[]
        ) => {
          calls.push({ sql, params })
          if (/insert into public\.ai_messages/i.test(sql)) {
            const rows = [{
              id: messageId,
              conversation_id: conversationId,
              role: "user",
              content: "Ajude",
              status: "completed",
              model: null,
              provider: null,
              prompt_version: null,
              created_at: "2026-08-24T12:00:00.000Z",
              completed_at: "2026-08-24T12:00:01.000Z",
              error_code: null,
            }] as unknown as Row[]
            return {
              rows,
            }
          }
          return { rows: [] }
        },
      }
      return work(client)
    },
  })

  const result = await repository.appendMessage({
    teacherId: professor.userId,
    conversationId,
    role: "user",
    content: "Ajude",
    status: "completed",
    model: null,
    provider: null,
    promptVersion: null,
    errorCode: null,
  })

  assert.equal(result.content, "Ajude")
  assert.equal(calls.length, 2)
  assert.match(calls[0]!.sql, /insert into public\.ai_messages/i)
  assert.match(calls[1]!.sql, /update public\.ai_conversations\s+set updated_at = timezone\('utc'::text, now\(\)\)/i)
  assert.deepEqual(calls[1]!.params, [conversationId, professor.userId])
})

test("returns 401 when there is no authenticated session", async () => {
  const { calls, handlers } = setup({ actor: null })

  const response = await handlers.listConversations()

  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { ok: false, error: "unauthorized" })
  assert.equal(calls.list.length, 0)
})

test("returns 403 for an authenticated non-professor", async () => {
  const { calls, handlers } = setup({ actor: student })

  const response = await handlers.createConversation(
    jsonRequest("/api/copilot/conversations", { title: "Plano" })
  )

  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), { ok: false, error: "forbidden" })
  assert.equal(calls.create.length, 0)
})

test("creates and lists conversations using only the server-side professor actor", async () => {
  const { calls, handlers } = setup()

  const created = await handlers.createConversation(
    jsonRequest("/api/copilot/conversations", {
      title: "  Plano semanal  ",
      teacher_id: "99999999-9999-4999-8999-999999999999",
    })
  )
  const listed = await handlers.listConversations()

  assert.equal(created.status, 201)
  const createdBody = await created.json()
  assert.deepEqual(createdBody, { ok: true, conversation: publicConversation({ title: "Plano semanal" }) })
  assertNoTeacherIdentifier(createdBody)
  assert.equal(listed.status, 200)
  const listedBody = await listed.json()
  assert.deepEqual(listedBody, { ok: true, conversations: [publicConversation()] })
  assertNoTeacherIdentifier(listedBody)
  assert.deepEqual(calls.create[0], { actor: professor, title: "Plano semanal" })
  assert.deepEqual(calls.list[0], { actor: professor })
})

test("reads a conversation and hides conversations owned by another professor", async () => {
  const missing = setup({
    service: {
      getConversation: async () => {
        throw new CopilotServiceError("conversation_not_found")
      },
    },
  })
  const otherProfessor = setup({
    service: {
      getConversation: async () => {
        throw new CopilotServiceError("conversation_not_found")
      },
    },
  })
  const ok = setup()

  const okResponse = await ok.handlers.getConversation(new Request("https://educonnect.test"), params())
  const missingResponse = await missing.handlers.getConversation(new Request("https://educonnect.test"), params())
  const otherResponse = await otherProfessor.handlers.getConversation(new Request("https://educonnect.test"), params())

  assert.equal(okResponse.status, 200)
  const okBody = await okResponse.json()
  assert.deepEqual(okBody, {
    ok: true,
    ...conversationDetail(),
    conversation: publicConversation(),
  })
  assertNoTeacherIdentifier(okBody)
  assert.equal(missingResponse.status, 404)
  assert.equal(otherResponse.status, 404)
  assert.deepEqual(await missingResponse.json(), await otherResponse.json())
})

test("returns daily usage using only the server-side professor actor", async () => {
  const { calls, handlers } = setup()

  const response = await handlers.getDailyUsage()

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    ok: true,
    usage: {
      usedRequests: 4,
      requestLimit: 20,
    },
  })
  assert.deepEqual(calls.usage[0], { actor: professor })
})

test("returns 422 for invalid JSON or invalid payloads", async () => {
  const { handlers } = setup()

  const invalidJson = await handlers.createConversation(
    new Request("https://educonnect.test/api/copilot/conversations", {
      method: "POST",
      body: "{",
    })
  )
  const invalidTitle = await handlers.createConversation(
    jsonRequest("/api/copilot/conversations", { title: " " })
  )
  const invalidMessage = await handlers.sendMessage(
    jsonRequest(`/api/copilot/conversations/${conversationId}/messages`, { content: "" }),
    params()
  )
  const invalidFeedback = await handlers.saveFeedback(
    jsonRequest(`/api/copilot/conversations/${conversationId}/feedback`, {
      messageId,
      rating: "neutral",
    }),
    params()
  )

  for (const response of [invalidJson, invalidTitle, invalidMessage, invalidFeedback]) {
    assert.equal(response.status, 422)
    assert.deepEqual(await response.json(), { ok: false, error: "invalid_payload" })
  }
})

test("returns 422 for invalid conversation ids before calling the service", async () => {
  const invalidParams = { params: { conversationId: "not-a-uuid" } }
  const { calls, handlers } = setup()

  const get = await handlers.getConversation(new Request("https://educonnect.test"), invalidParams)
  const messageResponse = await handlers.sendMessage(
    jsonRequest("/api/copilot/conversations/not-a-uuid/messages", { content: "Ajude" }),
    invalidParams
  )
  const feedbackResponse = await handlers.saveFeedback(
    jsonRequest("/api/copilot/conversations/not-a-uuid/feedback", {
      messageId,
      rating: "positive",
    }),
    invalidParams
  )

  for (const response of [get, messageResponse, feedbackResponse]) {
    assert.equal(response.status, 422)
    assert.deepEqual(await response.json(), { ok: false, error: "invalid_payload" })
  }
  assert.equal(calls.get.length, 0)
  assert.equal(calls.send.length, 0)
  assert.equal(calls.feedback.length, 0)
})

test("maps quota failures to 429 without exposing service internals", async () => {
  const { handlers } = setup({
    service: {
      sendMessage: async () => {
        throw new CopilotServiceError("daily_quota_exceeded")
      },
    },
  })

  const response = await handlers.sendMessage(
    jsonRequest(`/api/copilot/conversations/${conversationId}/messages`, { content: "Ajude" }),
    params()
  )

  assert.equal(response.status, 429)
  assert.deepEqual(await response.json(), { ok: false, error: "quota_exceeded" })
})

test("sends messages and saves feedback idempotently", async () => {
  const { calls, handlers } = setup()

  const sent = await handlers.sendMessage(
    jsonRequest(`/api/copilot/conversations/${conversationId}/messages`, { content: "  Ajude  " }),
    params()
  )
  const firstFeedback = await handlers.saveFeedback(
    jsonRequest(`/api/copilot/conversations/${conversationId}/feedback`, {
      messageId,
      rating: "positive",
      comment: "  útil  ",
    }),
    params()
  )
  const repeatedFeedback = await handlers.saveFeedback(
    jsonRequest(`/api/copilot/conversations/${conversationId}/feedback`, {
      messageId,
      rating: "positive",
      comment: "  útil  ",
    }),
    params()
  )

  assert.equal(sent.status, 201)
  assert.deepEqual(await sent.json(), {
    ok: true,
    userMessage: message({
      id: "66666666-6666-4666-8666-666666666666",
      role: "user",
      content: "Ajude",
      model: null,
      provider: null,
      promptVersion: null,
    }),
    assistantMessage: message(),
    citations: [],
  })
  assert.equal(firstFeedback.status, 204)
  assert.equal(repeatedFeedback.status, 204)
  assert.deepEqual(calls.send[0], { actor: professor, conversationId, content: "Ajude" })
  assert.deepEqual(calls.feedback, [
    { actor: professor, conversationId, messageId, rating: "positive", comment: "útil" },
    { actor: professor, conversationId, messageId, rating: "positive", comment: "útil" },
  ])
})
