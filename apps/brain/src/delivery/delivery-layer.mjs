import { recordModelCall } from '../observability/model-call-recorder.mjs'
import { resolveTenantLlmApiKey } from '../llm/openai-client.mjs'

export function createDeliveryLayer(options = {}) {
  const chatwoot = options.chatwoot
  const recorder = options.recorder ?? recordModelCall
  const chunker = options.chunker ?? createLlmChunker({
    config: options.config,
    recorder,
    fetchImpl: options.fetchImpl
  })
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const latestMessageIdForConversation = options.latestMessageIdForConversation ?? (() => null)

  if (chatwoot === undefined) return null

  return {
    deliver(input) {
      return deliverResponse({
        ...input,
        chatwoot,
        recorder,
        chunker,
        sleep,
        latestMessageIdForConversation
      })
    }
  }
}

export async function deliverResponse(input) {
  const startedAt = Date.now()
  const parts = await input.chunker(input.resposta)
  const messages = normalizeChunks(parts)
  const timings = []
  const context = {
    tenant: input.tenant,
    conversationId: input.conversationId,
    accountId: input.accountId,
    channel: input.channel ?? 'text',
    startedMessageId: input.startedMessageId
  }

  if (messages.length === 0) {
    await recordDeliveryTelemetry(input.recorder, context, {
      success: true,
      partCount: 0,
      timings,
      latencyMs: Date.now() - startedAt
    })
    return { status: 'sent', parts: [], timings }
  }

  for (let index = 0; index < messages.length; index += 1) {
    if (isInterrupted(input.latestMessageIdForConversation, context)) {
      await recordDeliveryTelemetry(input.recorder, context, {
        success: false,
        finding: 'entrega.interrompida',
        error: 'delivery interrupted by newer inbound message',
        partCount: index,
        timings,
        latencyMs: Date.now() - startedAt
      })
      return { status: 'interrupted', partsSent: index, parts: messages.slice(0, index), timings }
    }

    const part = messages[index]
    const typingMs = calculateTypingDelayMs(part, input.config, context.channel, input.outputKind)
    timings.push(typingMs)

    if (index === 0) await input.chatwoot.updateLastSeen(context)

    if (context.channel === 'zapi') {
      await input.sleep(typingMs)
      if (isInterrupted(input.latestMessageIdForConversation, context)) {
        await recordDeliveryTelemetry(input.recorder, context, {
          success: false,
          finding: 'entrega.interrompida',
          error: 'delivery interrupted by newer inbound message',
          partCount: index,
          timings,
          latencyMs: Date.now() - startedAt
        })
        return { status: 'interrupted', partsSent: index, parts: messages.slice(0, index), timings }
      }
      await input.chatwoot.sendMessage(context, part, {
        content_attributes: { zapi_args: { delayTyping: Math.round(typingMs / 1000) } }
      })
    } else {
      await input.chatwoot.toggleTyping(context, input.outputKind === 'audio' ? 'recording' : 'on')
      await input.sleep(typingMs)
      if (isInterrupted(input.latestMessageIdForConversation, context)) {
        await recordDeliveryTelemetry(input.recorder, context, {
          success: false,
          finding: 'entrega.interrompida',
          error: 'delivery interrupted by newer inbound message',
          partCount: index,
          timings,
          latencyMs: Date.now() - startedAt
        })
        return { status: 'interrupted', partsSent: index, parts: messages.slice(0, index), timings }
      }
      await input.chatwoot.sendMessage(context, part)
    }

    if (index < messages.length - 1) await input.sleep(deliveryConfig(input.config).gapMs)
  }

  await recordDeliveryTelemetry(input.recorder, context, {
    success: true,
    partCount: messages.length,
    timings,
    latencyMs: Date.now() - startedAt
  })
  return { status: 'sent', parts: messages, timings }
}

export function calculateTypingDelayMs(text, config = {}, channel = 'text', outputKind = 'text') {
  const normalized = deliveryConfig(config)
  const capMs = channel === 'zapi'
    ? outputKind === 'audio' ? normalized.capAudioMs : normalized.capZapiMs
    : channel === 'audio'
      ? normalized.capAudioMs
      : normalized.capTextMs
  const seconds = (text.length / 4.5) / normalized.wordsPerMinute * 60
  return Math.min(seconds * 1000, capMs)
}

export function heuristicChunker(text) {
  const trimmed = String(text ?? '').trim()
  if (trimmed.length === 0) return []
  if (containsList(trimmed)) return [stripFinalPunctuation(trimmed)]

  const sentences = trimmed.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((part) => part.trim()).filter(Boolean) ?? [trimmed]
  const chunks = []
  let current = []
  for (const sentence of sentences) {
    current.push(sentence)
    if (current.length >= 3 && chunks.length < 4) {
      chunks.push(stripFinalPunctuation(current.join(' ')))
      current = []
    }
  }
  if (current.length > 0) chunks.push(stripFinalPunctuation(current.join(' ')))
  return chunks.slice(0, 5)
}

export function createLlmChunker(options = {}) {
  const config = options.config ?? {}
  const recorder = options.recorder ?? recordModelCall
  const fetchImpl = options.fetchImpl ?? fetch
  return async (text) => {
    const startedAt = Date.now()
    const model = config.model ?? 'gpt-4.1-mini'
    const tenant = config.tenant ?? 'demo'
    try {
      const response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${resolveTenantLlmApiKey(config, tenant)}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model,
          input: [
            {
              role: 'system',
              content: [{
                type: 'input_text',
                text: 'Divida a resposta em até 5 mensagens naturais. Nunca divida listas numeradas ou bullets. Não reescreva conteúdo; só separe e remova pontuação final supérflua.'
              }]
            },
            {
              role: 'user',
              content: [{ type: 'input_text', text }]
            }
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'zenya_delivery_chunks',
              strict: true,
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['mensagens'],
                properties: {
                  mensagens: {
                    type: 'array',
                    maxItems: 5,
                    items: { type: 'string' }
                  }
                }
              }
            }
          }
        })
      })
      if (!response.ok) throw new Error(`chunker failed: ${response.status} ${await response.text()}`)
      const body = await response.json()
      const parsed = JSON.parse(extractOutputText(body))
      await recorder({
        tenant,
        papel: 'chunker',
        modelo: model,
        tokensIn: body.usage?.input_tokens ?? estimateTokens(text),
        tokensOut: body.usage?.output_tokens ?? 0,
        latenciaMs: Date.now() - startedAt,
        sucesso: true
      })
      return normalizeChunks(Array.isArray(parsed.mensagens) ? parsed.mensagens : [])
    } catch (error) {
      await recorder({
        tenant,
        papel: 'chunker',
        modelo: model,
        tokensIn: estimateTokens(text),
        tokensOut: 0,
        latenciaMs: Date.now() - startedAt,
        sucesso: false,
        erro: error instanceof Error ? error.message : 'chunker failed',
        finding: 'gateway.failure'
      })
      return heuristicChunker(text)
    }
  }
}

export async function recordDeliveryTelemetry(recorder, context, data) {
  await recorder({
    tenant: context.tenant,
    papel: 'delivery',
    modelo: 'delivery-layer',
    tokensIn: data.partCount,
    tokensOut: Math.round(data.timings.reduce((sum, value) => sum + value, 0)),
    latenciaMs: data.latencyMs,
    sucesso: data.success,
    erro: data.error,
    finding: data.finding,
    conversaId: context.conversationId
  })
}

function normalizeChunks(chunks) {
  return chunks.map((chunk) => stripFinalPunctuation(String(chunk).trim())).filter(Boolean).slice(0, 5)
}

function isInterrupted(latestMessageIdForConversation, context) {
  const latest = latestMessageIdForConversation(context.conversationId)
  return latest !== null && latest !== undefined && String(latest) !== String(context.startedMessageId)
}

function deliveryConfig(config = {}) {
  return {
    wordsPerMinute: config.wordsPerMinute ?? 150,
    gapMs: config.gapMs ?? 1000,
    capTextMs: config.capTextMs ?? 25_000,
    capZapiMs: config.capZapiMs ?? 15_000,
    capAudioMs: config.capAudioMs ?? 12_000
  }
}

function containsList(text) {
  return /^(\s*[-*]\s+|\s*\d+[.)]\s+)/m.test(text)
}

function stripFinalPunctuation(text) {
  return text.replace(/[.!?]+$/u, '')
}

function extractOutputText(body) {
  if (typeof body.output_text === 'string' && body.output_text.length > 0) return body.output_text
  for (const item of body.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text
    }
  }
  throw new Error('OpenAI response missing output_text')
}

function estimateTokens(text) {
  if (text.length === 0) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}
