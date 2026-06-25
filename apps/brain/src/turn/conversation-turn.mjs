import { recordModelCall } from '../observability/model-call-recorder.mjs'
import { callOpenAiTurn, resolveTenantLlmApiKey } from '../llm/openai-client.mjs'
import { createDeliveryLayer } from '../delivery/delivery-layer.mjs'
import { createAgendaToolSafe } from '../tools/agenda/agenda-tool.mjs'

const TOOL_CATALOG = ['agenda', 'pagamento', 'ecommerce', 'drive', 'kb', 'handoff']

export function createConversationTurnRuntime(options = {}) {
  const config = options.config ?? {}
  const recorder = options.recorder ?? recordModelCall
  const llmClient = options.llmClient ?? callOpenAiTurn
  const transcriber = options.transcriber ?? defaultTranscriber
  const tools = options.tools ?? buildTools(config)
  const latestMessageIds = new Map()
  const delivery = options.delivery ?? createDeliveryLayer({
    config,
    chatwoot: options.chatwoot,
    recorder,
    chunker: options.deliveryChunker,
    sleep: options.sleep,
    latestMessageIdForConversation: (conversationId) => latestMessageIds.get(conversationId)
  })
  const debounceMs = config.debounceMs ?? 800
  const queues = new Map()
  const turns = []

  return {
    enqueueChatwootEvent(payload) {
      const message = normalizeChatwootMessage(payload, {
        tenant: config.tenant ?? 'demo',
        transcriber
      })
      const queueKey = message.conversationId
      latestMessageIds.set(queueKey, message.id)
      const queue = queues.get(queueKey) ?? { messages: [], timer: null, sequence: 0 }
      queue.messages.push(message)
      queue.sequence += 1
      const sequence = queue.sequence
      if (queue.timer !== null) clearTimeout(queue.timer)
      queue.timer = setTimeout(() => {
        void processQueue(queueKey, sequence)
      }, debounceMs)
      queues.set(queueKey, queue)
      return { queueKey, message }
    },

    async flush(queueKey) {
      const queue = queues.get(queueKey)
      if (queue === undefined) return null
      if (queue.timer !== null) clearTimeout(queue.timer)
      return processQueue(queueKey, queue.sequence)
    },

    getTurns() {
      return turns.slice()
    }
  }

  async function processQueue(queueKey, sequence) {
    const queue = queues.get(queueKey)
    if (queue === undefined || queue.sequence !== sequence) return null
    queues.delete(queueKey)
    const messages = queue.messages
    if (messages.length === 0) return null
    const turn = await runAgentTurn({
      config,
      recorder,
      llmClient,
      delivery,
      messages,
      activeTools: enabledTools(config.activeTools)
    })
    turns.push(turn)
    return turn
  }
}

export async function runAgentTurn({ config, recorder = recordModelCall, llmClient = callOpenAiTurn, delivery = null, messages, activeTools }) {
  const startedAt = Date.now()
  const tenant = config.tenant ?? messages[0]?.tenant ?? 'demo'
  const conversationId = messages[0]?.conversationId ?? 'unknown'
  const inputText = messages.map((message) => message.text).filter(Boolean).join('\n')
  const model = config.model ?? 'gpt-4.1-mini'
  let llmResult
  let llmError = null
  try {
    llmResult = await llmClient({
      apiKey: resolveTenantLlmApiKey(config, tenant),
      model,
      systemPrompt: config.systemPrompt ?? 'Você é a Zenya. Responda com clareza, em português.',
      userText: inputText,
      activeTools,
      memoryWindow: config.memoryWindow ?? 50
    })
  } catch (error) {
    llmError = error instanceof Error ? error : new Error('LLM call failed')
    llmResult = {
      resposta: '',
      turnUnderstanding: {
        intent: 'llm_error',
        leadSignals: [],
        actionsTaken: []
      },
      usage: { tokensIn: estimateTokens(inputText), tokensOut: 0 }
    }
  }

  const resposta = llmResult.resposta
  const understanding = {
    ...llmResult.turnUnderstanding,
    messageCount: messages.length,
    offeredTools: activeTools
  }
  const latenciaMs = Date.now() - startedAt
  await recorder({
    tenant,
    papel: 'main',
    modelo: model,
    tokensIn: llmResult.usage.tokensIn,
    tokensOut: llmResult.usage.tokensOut,
    latenciaMs,
    sucesso: llmError === null && resposta.length > 0,
    erro: llmError?.message,
    finding: llmError === null ? undefined : 'gateway.failure',
    emptyReply: llmError === null && resposta.length === 0,
    conversaId: conversationId
  })

  const deliveryResult = delivery === null
    ? null
    : await delivery.deliver({
      tenant,
      conversationId,
      accountId: config.chatwootAccountId,
      startedMessageId: messages.at(-1)?.id,
      channel: messages.at(-1)?.channel ?? 'text',
      outputKind: messages.at(-1)?.type === 'audio' ? 'audio' : 'text',
      resposta,
      config: config.delivery
    })

  return {
    tenant,
    conversationId,
    messageIds: messages.map((message) => message.id),
    inputText,
    resposta,
    turnUnderstanding: understanding,
    llm: {
      model,
      tokensIn: llmResult.usage.tokensIn,
      tokensOut: llmResult.usage.tokensOut
    },
    delivery: deliveryResult,
    createdAt: new Date().toISOString()
  }
}

export function normalizeChatwootMessage(payload, options = {}) {
  const event = payload.event ?? payload.event_type ?? 'unknown'
  const message = payload.message ?? payload
  const conversation = payload.conversation ?? message.conversation ?? {}
  const sender = payload.sender ?? message.sender ?? {}
  const attachments = Array.isArray(message.attachments) ? message.attachments : []
  const audioAttachment = attachments.find((attachment) => String(attachment.file_type ?? attachment.message_type ?? '').includes('audio'))
  const contentType = audioAttachment !== undefined ? 'audio' : 'text'
  const rawText = message.content ?? message.text ?? payload.content ?? ''

  return {
    id: String(message.id ?? payload.id ?? payload.message_id ?? `${Date.now()}`),
    tenant: options.tenant ?? 'demo',
    event,
    conversationId: String(conversation.id ?? payload.conversation_id ?? message.conversation_id ?? sender.id ?? 'unknown'),
    contactId: String(sender.id ?? payload.contact_id ?? message.sender_id ?? 'unknown'),
    type: contentType,
    channel: String(payload.channel ?? message.channel ?? 'text'),
    text: contentType === 'audio'
      ? options.transcriber(audioAttachment, payload)
      : String(rawText),
    receivedAt: new Date().toISOString()
  }
}

export function enabledTools(activeTools = []) {
  const requested = new Set(activeTools)
  return TOOL_CATALOG.filter((tool) => requested.has(tool))
}

export function buildTools(config = {}) {
  const tools = {}
  if (enabledTools(config.activeTools).includes('agenda')) {
    tools.agenda = createAgendaToolSafe({
      serviceAccountJson: config.googleCalendarServiceAccountJson,
      calendarId: config.googleCalendarId,
      timeZone: config.tenantTimeZone
    })
  }
  return tools
}

function defaultTranscriber(attachment) {
  return `[audio transcrito: ${attachment?.data_url ?? attachment?.download_url ?? 'sem-url'}]`
}

function inferIntent(text) {
  return text.trim().length === 0 ? 'unknown' : 'message_received'
}

function estimateTokens(text) {
  if (text.length === 0) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}
