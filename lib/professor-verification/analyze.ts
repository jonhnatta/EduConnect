// Análise automática do documento de verificação de professor.
//
// PLUGÁVEL: o provedor é escolhido por env `PROFESSOR_VERIFICATION_PROVIDER`.
//   - ausente / "none"  -> nada de IA: tudo vai para análise manual (padrão atual).
//   - "xai"             -> usa o Grok (visão) com a XAI_API_KEY já existente (apenas imagens).
//   - "anthropic"       -> ponto de extensão (Claude lê PDF e imagem nativamente).
//
// Regra de produto: PDF NÃO passa pela IA de visão -> sempre análise manual.
// Só imagens (JPEG/PNG/WebP) são candidatas à aprovação automática.

export type VerificationDecision = {
  decision: "approved" | "manual"
  reason: string
}

export type AnalyzeInput = {
  contentType: string
  fullName: string | null
  interests: string[] | null
  /** Base64 puro (sem prefixo data:) da imagem — presente apenas para imagens. */
  imageBase64?: string | null
}

function isImageType(contentType: string): boolean {
  return /^image\/(jpeg|png|webp)$/i.test(contentType)
}

export async function analyzeProfessorDocument(
  input: AnalyzeInput
): Promise<VerificationDecision> {
  // PDFs (e qualquer não-imagem) vão direto para a fila humana.
  if (!isImageType(input.contentType)) {
    return {
      decision: "manual",
      reason: "Documento em PDF — encaminhado para análise manual.",
    }
  }

  const provider = (process.env.PROFESSOR_VERIFICATION_PROVIDER ?? "none").toLowerCase()

  try {
    if (provider === "openai") return await analyzeWithOpenAI(input)
    if (provider === "xai") return await analyzeWithXai(input)
    if (provider === "anthropic") return await analyzeWithAnthropic(input)
  } catch (err) {
    console.error("[professor-verification] erro na análise automática:", err)
    return {
      decision: "manual",
      reason: "Não foi possível concluir a análise automática — encaminhado para análise manual.",
    }
  }

  // provider "none"/desconhecido: ainda não configurado.
  return {
    decision: "manual",
    reason: "Análise automática ainda não configurada — encaminhado para análise manual.",
  }
}

const DOC_SYSTEM_PROMPT = `Você é um verificador de identidade profissional da EduConnect, uma plataforma educacional brasileira.
Você recebe a IMAGEM de um documento enviado por alguém que afirma ser professor (ex.: diploma, certificado de licenciatura, carteira funcional, contracheque de instituição de ensino, registro em conselho).
Sua tarefa: decidir se o documento comprova razoavelmente que a pessoa é professor/educador.

Responda APENAS com um JSON válido, sem markdown:
{
  "is_teacher": <true|false>,
  "confidence": <número 0 a 1>,
  "reason": "<frase curta em português explicando a decisão>"
}
Seja conservador: se a imagem for ilegível, não for um documento, ou não comprovar atuação docente, use is_teacher=false.`

// ─── OpenAI (visão) — modelo barato (gpt-4o-mini por padrão). Apenas imagens. ──
async function analyzeWithOpenAI(input: AnalyzeInput): Promise<VerificationDecision> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { decision: "manual", reason: "Análise automática indisponível — encaminhado para análise manual." }
  }
  const model = process.env.PROFESSOR_VERIFICATION_OPENAI_MODEL || "gpt-4o-mini"
  const dataUrl = `data:${input.contentType};base64,${input.imageBase64 ?? ""}`

  // Timeout defensivo para não pendurar o processamento em background.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: DOC_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Nome informado: ${input.fullName ?? "(não informado)"}. Disciplinas: ${(input.interests ?? []).join(", ") || "(não informadas)"}.`,
              },
              // detail "low" reduz o custo de tokens da imagem.
              { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
            ],
          },
        ],
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`OpenAI status ${res.status}: ${body.slice(0, 200)}`)
    }
    const data = await res.json()
    const content: string = data.choices?.[0]?.message?.content ?? "{}"
    return decisionFromModelJson(content)
  } finally {
    clearTimeout(timeout)
  }
}

// ─── xAI (Grok visão) — usa a chave já existente. Apenas imagens. ──────────────
async function analyzeWithXai(input: AnalyzeInput): Promise<VerificationDecision> {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    return { decision: "manual", reason: "Análise automática indisponível — encaminhado para análise manual." }
  }
  const model = process.env.PROFESSOR_VERIFICATION_XAI_MODEL || "grok-2-vision-1212"
  const dataUrl = `data:${input.contentType};base64,${input.imageBase64 ?? ""}`

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: "system", content: DOC_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Nome informado: ${input.fullName ?? "(não informado)"}. Disciplinas: ${(input.interests ?? []).join(", ") || "(não informadas)"}.`,
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`xAI status ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  const content: string = data.choices?.[0]?.message?.content ?? "{}"
  return decisionFromModelJson(content)
}

// ─── Anthropic (Claude) — PONTO DE EXTENSÃO ───────────────────────────────────
// Claude lê PDF e imagem nativamente. Para implementar: consultar a skill `claude-api`
// para o formato atual da Messages API (image/document blocks) e o model id vigente,
// montar o POST https://api.anthropic.com/v1/messages com a ANTHROPIC_API_KEY e
// reaproveitar `decisionFromModelJson(content)` no texto retornado.
async function analyzeWithAnthropic(_input: AnalyzeInput): Promise<VerificationDecision> {
  return {
    decision: "manual",
    reason: "Provedor Anthropic ainda não implementado — encaminhado para análise manual.",
  }
}

function decisionFromModelJson(content: string): VerificationDecision {
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = (jsonMatch ? jsonMatch[1] : content).trim()
  let parsed: { is_teacher?: unknown; confidence?: unknown; reason?: unknown } = {}
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    return { decision: "manual", reason: "Resposta da IA ilegível — encaminhado para análise manual." }
  }
  const isTeacher = parsed.is_teacher === true
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0))
  const reason =
    typeof parsed.reason === "string" && parsed.reason.trim()
      ? parsed.reason.trim()
      : ""

  // Só aprova automaticamente com alta confiança; o resto vai para análise manual.
  if (isTeacher && confidence >= 0.75) {
    return { decision: "approved", reason: reason || "Documento aprovado automaticamente." }
  }
  return {
    decision: "manual",
    reason: reason
      ? `Análise automática não confirmou: ${reason}`
      : "Análise automática não confirmou — encaminhado para análise manual.",
  }
}
