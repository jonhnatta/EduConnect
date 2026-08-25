"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { AlertCircle, Bot, Check, Loader2, MessageSquare, Plus, Send, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

type Conversation = {
  id: string
  title: string
  status: "active" | "archived" | "deleted"
  createdAt: string
  updatedAt: string
}

type Message = {
  id: string
  conversationId: string
  role: "user" | "assistant" | "system" | "tool"
  content: string
  status: "pending" | "streaming" | "completed" | "failed" | "cancelled" | "blocked"
}

type Citation = {
  sourceId: string
  sourceKind: "internal" | "web"
  title: string
  excerpt: string
  url: string
  retrievedAt: string
  displayOrder: number
}

type ConversationState = {
  conversation: Conversation
  messages: Message[]
  citationsByMessage: Record<string, Citation[]>
  feedbackByMessage: Record<string, Feedback>
  loaded: boolean
}

type Feedback = {
  rating: "positive" | "negative"
  comment: string | null
}

type Usage = {
  usedRequests: number
  requestLimit: number
}

const suggestedQuestions = [
  "Como posso adaptar a proxima atividade para alunos com dificuldades?",
  "Quais materiais da minha turma precisam de reforco?",
  "Sugira um plano de aula a partir dos meus conteudos recentes.",
] as const

const errorCopy: Record<string, string> = {
  unauthorized: "Sua sessao expirou. Entre novamente para usar o Copilot.",
  forbidden: "O Copilot esta disponivel apenas para professores autorizados.",
  copilot_unavailable: "O Copilot ainda nao esta liberado para sua conta.",
  quota_exceeded: "Voce atingiu o limite de uso do Copilot hoje.",
  invalid_payload: "Revise a mensagem antes de enviar.",
  not_found: "Nao encontramos essa conversa.",
}

function apiError(error: string | undefined, fallback: string): string {
  if (!error) return fallback
  return errorCopy[error] ?? fallback
}

function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}

async function parseJson(response: Response) {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

export function CopilotClient() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [stateById, setStateById] = useState<Record<string, ConversationState>>({})
  const [input, setInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({})
  const [sending, setSending] = useState(false)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [feedbackCommentByMessage, setFeedbackCommentByMessage] = useState<Record<string, string>>({})
  const [creating, startCreating] = useTransition()

  const activeState = activeId ? stateById[activeId] ?? null : null
  const activeMessages = activeState?.messages ?? []
  const activeFeedback = activeState?.feedbackByMessage ?? {}
  const activeLoaded = activeState?.loaded ?? false
  const activeLoading = activeId ? loadingDetails[activeId] === true : false
  const sortedConversations = useMemo(() => sortConversations(conversations), [conversations])

  const loadUsage = useCallback(async () => {
    const response = await fetch("/api/copilot/usage", {
      headers: { accept: "application/json" },
      cache: "no-store",
    })
    const data = await parseJson(response)
    if (!response.ok || !data.ok) {
      setError(apiError(data.error, "Nao foi possivel carregar o uso do Copilot."))
      return
    }
    setUsage(data.usage)
  }, [])

  const loadConversationDetail = useCallback(async (conversationId: string) => {
    setLoadingDetails((current) => ({ ...current, [conversationId]: true }))
    const response = await fetch(`/api/copilot/conversations/${conversationId}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    })
    const data = await parseJson(response)
    if (!response.ok || !data.ok) {
      setError(apiError(data.error, "Nao foi possivel carregar a conversa."))
      setLoadingDetails((current) => ({ ...current, [conversationId]: false }))
      return
    }
    setConversations((current) =>
      sortConversations(current.map((item) => item.id === conversationId ? data.conversation : item))
    )
    setStateById((current) => ({
      ...current,
      [conversationId]: {
        conversation: data.conversation,
        messages: data.messages ?? [],
        citationsByMessage: data.citationsByMessage ?? {},
        feedbackByMessage: data.feedbackByMessage ?? {},
        loaded: true,
      },
    }))
    setLoadingDetails((current) => ({ ...current, [conversationId]: false }))
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadConversations() {
      setLoading(true)
      setError(null)

      const response = await fetch("/api/copilot/conversations", {
        headers: { accept: "application/json" },
        cache: "no-store",
      })
      const data = await parseJson(response)

      if (cancelled) return
      if (!response.ok || !data.ok) {
        setError(apiError(data.error, "Nao foi possivel carregar o Copilot."))
        setLoading(false)
        return
      }

      const loaded = sortConversations(data.conversations ?? [])
      setConversations(loaded)
      setStateById((current) => {
        const next = { ...current }
        for (const conversation of loaded) {
          next[conversation.id] ??= {
            conversation,
            messages: [],
            citationsByMessage: {},
            feedbackByMessage: {},
            loaded: false,
          }
        }
        return next
      })
      setActiveId((current) => current ?? loaded[0]?.id ?? null)
      setLoading(false)
    }

    loadConversations().catch(() => {
      if (!cancelled) {
        setError("Nao foi possivel carregar o Copilot.")
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    async function refreshUsage() {
      await loadUsage()
    }

    refreshUsage().catch(() => {
      setError("Nao foi possivel carregar o uso do Copilot.")
    })
  }, [loadUsage])

  useEffect(() => {
    if (!activeId || activeLoaded) return
    async function refreshConversationDetail(conversationId: string) {
      await loadConversationDetail(conversationId)
    }

    refreshConversationDetail(activeId).catch(() => {
      setError("Nao foi possivel carregar a conversa.")
      setLoadingDetails((current) => ({ ...current, [activeId]: false }))
    })
  }, [activeId, activeLoaded, loadConversationDetail])

  function upsertConversation(conversation: Conversation) {
    setConversations((current) => {
      const withoutCurrent = current.filter((item) => item.id !== conversation.id)
      return sortConversations([conversation, ...withoutCurrent])
    })
    setStateById((current) => ({
      ...current,
      [conversation.id]: current[conversation.id] ?? {
        conversation,
        messages: [],
        citationsByMessage: {},
        feedbackByMessage: {},
        loaded: true,
      },
    }))
    setActiveId(conversation.id)
  }

  function createConversation() {
    startCreating(async () => {
      setError(null)
      const response = await fetch("/api/copilot/conversations", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ title: "Nova conversa" }),
      })
      const data = await parseJson(response)
      if (!response.ok || !data.ok) {
        setError(apiError(data.error, "Nao foi possivel criar a conversa."))
        return
      }
      upsertConversation(data.conversation)
    })
  }

  async function ensureConversation(): Promise<Conversation | null> {
    if (activeState?.conversation) return activeState.conversation

    const response = await fetch("/api/copilot/conversations", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ title: "Nova conversa" }),
    })
    const data = await parseJson(response)
    if (!response.ok || !data.ok) {
      setError(apiError(data.error, "Nao foi possivel criar a conversa."))
      return null
    }
    upsertConversation(data.conversation)
    return data.conversation
  }

  async function sendPrompt(prompt: string) {
    const content = prompt.trim()
    if (!content || sending) return

    setSending(true)
    setError(null)

    const conversation = await ensureConversation()
    if (!conversation) {
      setSending(false)
      return
    }

    setInput("")
    const conversationId = conversation.id
    const response = await fetch(`/api/copilot/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ content }),
    })
    const data = await parseJson(response)

    if (!response.ok || !data.ok) {
      setError(apiError(data.error, "Nao foi possivel enviar sua mensagem."))
      setInput(content)
      setSending(false)
      return
    }

    const userMessage = data.userMessage as Message
    const assistantMessage = data.assistantMessage as Message
    const citations = (data.citations ?? []) as Citation[]
    setConversations((current) =>
      sortConversations(current.map((item) => item.id === conversationId ? { ...item, updatedAt: new Date().toISOString() } : item))
    )
    setStateById((current) => {
      const previous = current[conversationId] ?? {
        conversation,
        messages: [],
        citationsByMessage: {},
        feedbackByMessage: {},
        loaded: true,
      }
      return {
        ...current,
        [conversationId]: {
          ...previous,
          messages: [...previous.messages, userMessage, assistantMessage],
          citationsByMessage: {
            ...previous.citationsByMessage,
            [assistantMessage.id]: citations,
          },
          loaded: true,
        },
      }
    })
    await loadUsage().catch(() => {})
    setSending(false)
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await sendPrompt(input)
  }

  function sendSuggestedQuestion(question: string) {
    setInput(question)
    void sendPrompt(question)
  }

  async function sendFeedback(messageId: string, rating: "positive" | "negative", comment?: string) {
    if (!activeId) return
    const trimmedComment = comment?.trim() ?? ""
    const previousFeedback = activeFeedback[messageId]
    setStateById((current) => {
      const previous = current[activeId]
      if (!previous) return current
      return {
        ...current,
        [activeId]: {
          ...previous,
          feedbackByMessage: {
            ...previous.feedbackByMessage,
            [messageId]: { rating, comment: trimmedComment || null },
          },
        },
      }
    })

    const conversationId = activeId
    const response = await fetch(`/api/copilot/conversations/${conversationId}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ messageId, rating, comment: trimmedComment || undefined }),
    })

    if (!response.ok) {
      setStateById((current) => {
        const previous = current[conversationId]
        if (!previous) return current
        const nextFeedback = { ...previous.feedbackByMessage }
        if (previousFeedback) {
          nextFeedback[messageId] = previousFeedback
        } else {
          delete nextFeedback[messageId]
        }
        return {
          ...current,
          [conversationId]: {
            ...previous,
            feedbackByMessage: nextFeedback,
          },
        }
      })
      const data = await parseJson(response)
      setError(apiError(data.error, "Nao foi possivel salvar o feedback."))
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-20 lg:pb-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50">
            <Sparkles className="h-5 w-5 text-[#1D4ED8]" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-gray-900">Copilot</h1>
            <p className="text-sm text-gray-500">Converse com apoio dos seus materiais autorizados.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="bg-blue-50 text-[#1D4ED8]">
            Uso diario: {usage ? `${usage.usedRequests}/${usage.requestLimit}` : "carregando"}
          </Badge>
          <Button onClick={createConversation} disabled={creating} className="gap-2 bg-[#1D4ED8] hover:bg-[#1E3A8A]">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Nova conversa
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid min-h-[640px] overflow-hidden rounded-xl border border-gray-100 bg-white lg:grid-cols-[280px_1fr]">
        <aside className="border-b border-gray-100 bg-gray-50/80 lg:border-b-0 lg:border-r">
          <div className="border-b border-gray-100 p-4">
            <h2 className="font-display font-semibold text-gray-900">Conversas</h2>
          </div>
          <div className="max-h-64 overflow-y-auto p-2 lg:max-h-[590px]">
            {loading ? (
              <div className="flex items-center gap-2 p-4 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando conversas
              </div>
            ) : sortedConversations.length === 0 ? (
              <div className="p-6 text-center">
                <MessageSquare className="mx-auto mb-3 h-8 w-8 text-gray-300" />
                <p className="text-sm font-medium text-gray-900">Nenhuma conversa ainda</p>
                <p className="mt-1 text-xs text-gray-500">Comece uma pergunta para criar seu historico.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {sortedConversations.map((conversation) => {
                  const active = conversation.id === activeId
                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => setActiveId(conversation.id)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        active ? "bg-white text-[#1D4ED8] shadow-sm" : "text-gray-600 hover:bg-white"
                      }`}
                    >
                      <span className="block truncate font-medium">{conversation.title}</span>
                      <span className="mt-0.5 block text-xs text-gray-400">
                        {new Date(conversation.updatedAt).toLocaleDateString("pt-BR")}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </aside>

        <section className="flex min-h-[640px] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-4 lg:p-6">
            {activeLoading ? (
              <div className="flex h-full min-h-[360px] items-center justify-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando mensagens
              </div>
            ) : !loading && activeMessages.length === 0 ? (
              <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center">
                <Bot className="mb-4 h-12 w-12 text-gray-300" />
                <p className="font-display text-lg font-semibold text-gray-900">Pergunte sobre suas turmas e materiais</p>
                <p className="mt-2 max-w-md text-sm text-gray-500">
                  O Copilot responde somente com base no contexto autorizado e mostra as fontes usadas.
                </p>
                <div className="mt-6 grid w-full max-w-2xl gap-3">
                  {suggestedQuestions.map((question) => (
                    <div
                      key={question}
                      className="flex flex-col gap-3 rounded-lg border border-gray-100 bg-white p-3 text-left shadow-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="text-sm font-medium text-gray-700">{question}</span>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setInput(question)}
                        >
                          Usar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={sending}
                          className="bg-[#1D4ED8] hover:bg-[#1E3A8A]"
                          onClick={() => sendSuggestedQuestion(question)}
                        >
                          Enviar agora
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              activeMessages.map((message) => {
                const assistant = message.role === "assistant"
                const citations = activeState?.citationsByMessage[message.id] ?? []
                const feedback = activeFeedback[message.id]?.rating
                const feedbackComment = feedbackCommentByMessage[message.id] ?? activeFeedback[message.id]?.comment ?? ""
                return (
                  <article
                    key={message.id}
                    className={`rounded-xl border p-4 ${
                      assistant ? "border-blue-100 bg-blue-50/40" : "ml-auto max-w-[85%] border-gray-100 bg-gray-50"
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      {assistant ? <Bot className="h-4 w-4 text-[#1D4ED8]" /> : <MessageSquare className="h-4 w-4 text-gray-400" />}
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        {assistant ? "Copilot" : "Voce"}
                      </span>
                      {message.status === "blocked" && <Badge variant="outline">Sem evidencia suficiente</Badge>}
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-gray-800">{message.content}</p>

                    {assistant && citations.length > 0 && (
                      <div className="mt-4 rounded-lg border border-blue-100 bg-white p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Fontes</p>
                        <div className="space-y-2">
                          {citations.map((citation) => (
                            <a
                              key={`${message.id}-${citation.sourceId}`}
                              href={citation.url}
                              className="block rounded-md border border-gray-100 p-3 hover:border-[#1D4ED8]/40"
                            >
                              <span className="text-sm font-medium text-gray-900">{citation.title}</span>
                              <span className="mt-1 block text-xs leading-5 text-gray-500">{citation.excerpt}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {assistant && (
                      <div className="mt-3 space-y-2">
                        <Textarea
                          value={feedbackComment}
                          onChange={(event) =>
                            setFeedbackCommentByMessage((current) => ({
                              ...current,
                              [message.id]: event.target.value,
                            }))
                          }
                          placeholder="Conte o que ajudou ou faltou na resposta"
                          className="min-h-16 resize-none bg-white"
                          maxLength={1000}
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant={feedback === "positive" ? "default" : "outline"}
                            size="sm"
                            className="gap-2"
                            onClick={() => sendFeedback(message.id, "positive", feedbackCommentByMessage[message.id] ?? feedbackComment)}
                          >
                            {feedback === "positive" ? <Check className="h-4 w-4" /> : <ThumbsUp className="h-4 w-4" />}
                            Resposta util
                          </Button>
                          <Button
                            type="button"
                            variant={feedback === "negative" ? "default" : "outline"}
                            size="sm"
                            className="gap-2"
                            onClick={() => sendFeedback(message.id, "negative", feedbackCommentByMessage[message.id] ?? feedbackComment)}
                          >
                            {feedback === "negative" ? <Check className="h-4 w-4" /> : <ThumbsDown className="h-4 w-4" />}
                            Resposta ruim
                          </Button>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })
            )}

            {sending && (
              <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/40 p-4 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin text-[#1D4ED8]" />
                Buscando evidencias e gerando resposta
              </div>
            )}
          </div>

          <form onSubmit={sendMessage} className="border-t border-gray-100 p-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Pergunte algo sobre seus conteudos, alunos ou planejamento..."
                className="min-h-24 resize-none"
                maxLength={8000}
              />
              <Button
                type="submit"
                disabled={sending || input.trim().length === 0}
                className="h-12 gap-2 bg-[#1D4ED8] hover:bg-[#1E3A8A] sm:self-end"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar
              </Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
