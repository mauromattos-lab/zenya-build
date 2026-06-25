import { createServer as createHttpServer } from 'node:http'
import { createChatwootClient } from './chatwoot/chatwoot-client.mjs'
import { readBrainConfig, readiness } from './config.mjs'
import { createConversationTurnRuntime } from './turn/conversation-turn.mjs'

export function createBrainServer(options = {}) {
  const config = options.config ?? readBrainConfig()
  const chatwoot = options.chatwoot ?? maybeCreateChatwootClient(config)
  const turnRuntime = options.turnRuntime ?? createConversationTurnRuntime({
    config,
    chatwoot,
    recorder: options.recorder,
    transcriber: options.transcriber,
    sleep: options.sleep,
    deliveryChunker: options.deliveryChunker,
    llmClient: options.llmClient
  })

  return createHttpServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        sendJson(res, 200, {
          ok: true,
          service: 'zenya-brain',
          tenant: config.tenant,
          chatwootBaseUrl: config.chatwootBaseUrl,
          readiness: readiness(config)
        })
        return
      }

      if (req.method === 'POST' && req.url === '/webhooks/chatwoot') {
        const payload = await readJson(req)
        if (!shouldProcessChatwootEvent(payload)) {
          sendJson(res, 200, {
            ok: true,
            accepted: false,
            ignored: true,
            reason: 'not_incoming_message_created'
          })
          return
        }
        const enqueued = turnRuntime.enqueueChatwootEvent(payload)
        sendJson(res, 200, {
          ok: true,
          accepted: true,
          source: 'chatwoot',
          event: payload.event ?? payload.event_type ?? 'unknown',
          tenant: config.tenant,
          queueKey: enqueued.queueKey,
          messageId: enqueued.message.id
        })
        return
      }

      if (req.method === 'GET' && req.url === '/debug/turns') {
        sendJson(res, 200, {
          ok: true,
          turns: turnRuntime.getTurns()
        })
        return
      }

      sendJson(res, 404, { ok: false, error: 'not_found' })
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'bad_request'
      })
    }
  })
}

export function shouldProcessChatwootEvent(payload) {
  const event = payload.event ?? payload.event_type
  const message = payload.message ?? payload
  const messageType = message.message_type ?? payload.message_type
  const senderType = message.sender_type ?? payload.sender_type ?? message.sender?.type ?? payload.sender?.type
  const privateMessage = message.private ?? payload.private
  return event === 'message_created'
    && messageType === 'incoming'
    && senderType !== 'AgentBot'
    && senderType !== 'agent_bot'
    && privateMessage !== true
}

function maybeCreateChatwootClient(config) {
  if (config.chatwootBaseUrl.length === 0 || config.chatwootAccountId.length === 0 || config.chatwootApiToken.length === 0) {
    return undefined
  }
  return createChatwootClient(config)
}

export async function startBrainServer(config = readBrainConfig()) {
  const server = createBrainServer({ config })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(config.port, config.host, () => {
      server.off('error', reject)
      resolve()
    })
  })
  return server
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (chunks.length === 0) return {}
  const body = Buffer.concat(chunks).toString('utf8')
  return JSON.parse(body)
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = readBrainConfig()
  await startBrainServer(config)
  console.log(`zenya-brain listening on ${config.host}:${config.port}`)
}
