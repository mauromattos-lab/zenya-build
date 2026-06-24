import { recordModelCall } from '../observability/model-call-recorder.mjs'

const TOOL_CATALOG = ['agenda', 'pagamento', 'ecommerce', 'drive', 'kb', 'handoff']

export function createConversationTurnRuntime(options = {}) {
  const config = options.config ?? {}
  const recorder = options.recorder ?? recordModelCall
  const transcriber = options.transcriber ?? defaultTranscriber
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
      messages,
      activeTools: enabledTools(config.activeTools)
    })
    turns.push(turn)
    return turn
  }
}

export async function runAgentTurn({ config, recorder = recordModelCall, messages, activeTools }) {
  const startedAt = Date.now()
  const tenant = config.tenant ?? messages[0]?.tenant ?? 'demo'
  const conversationId = messages[0]?.conversationId ?? 'unknown'
  const inputText = messages.map((message) => message.text).filter(Boolean).join('\n')
  const resposta = inputText.length > 0
    ? `Recebi ${messages.length} mensagem(ns). Stub do agente pronto para processar.`
    : ''
  const understanding = {
    intent: inferIntent(inputText),
    leadSignals: [],
    actionsTaken: [],
    messageCount: messages.length,
    offeredTools: activeTools
  }
  const latenciaMs = Date.now() - startedAt

  await recorder({
    tenant,
    papel: 'main',
    modelo: config.model ?? 'gpt-4o-mini',
    tokensIn: estimateTokens(inputText),
    tokensOut: estimateTokens(resposta),
    latenciaMs,
    sucesso: resposta.length > 0,
    emptyReply: resposta.length === 0,
    conversaId: conversationId
  })

  return {
    tenant,
    conversationId,
    messageIds: messages.map((message) => message.id),
    inputText,
    resposta,
    turnUnderstanding: understanding,
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
