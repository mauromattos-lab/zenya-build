import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createBrainServer } from '../apps/brain/src/server.mjs'
import { createChatwootClient } from '../apps/brain/src/chatwoot/chatwoot-client.mjs'
import { escalateToHuman } from '../apps/brain/src/handoff/handoff.mjs'

const labels = new Map([
  ['conv-off', ['vip', 'agente-off']],
  ['conv-on', ['vip']],
  ['conv-escalate', ['vip']]
])
const calls = []

const chatwootServer = createServer(async (req, res) => {
  const body = await readJson(req)
  calls.push({ method: req.method, url: req.url, headers: req.headers, body })
  const conversationId = req.url.match(/\/conversations\/([^/]+)/)?.[1]

  if (req.method === 'GET' && req.url.endsWith('/labels')) {
    sendJson(res, 200, { payload: labels.get(conversationId) ?? [] })
    return
  }

  if (req.method === 'POST' && req.url.endsWith('/labels')) {
    labels.set(conversationId, body.labels)
    sendJson(res, 200, { labels: body.labels })
    return
  }

  sendJson(res, 200, { ok: true })
})

await listen(chatwootServer)
const chatwootPort = chatwootServer.address().port

const config = {
  host: '127.0.0.1',
  port: 0,
  tenant: 'demo',
  chatwootBaseUrl: `http://127.0.0.1:${chatwootPort}`,
  chatwootAccountId: '2',
  chatwootApiToken: 'token-smoke',
  supabaseUrl: '',
  supabaseServiceRoleKey: '',
  llmApiKey: 'test-key',
  model: 'gpt-4.1-mini',
  systemPrompt: 'Você é a Zenya.',
  memoryWindow: 50,
  debounceMs: 1,
  delivery: { wordsPerMinute: 150, gapMs: 1, capTextMs: 1, capZapiMs: 1, capAudioMs: 1 },
  activeTools: []
}
const brain = createBrainServer({
  config,
  llmClient: async ({ userText }) => ({
    resposta: `Resposta teste: ${userText}`,
    turnUnderstanding: { intent: 'message_received', leadSignals: [], actionsTaken: [] },
    usage: { tokensIn: 4, tokensOut: 5 }
  }),
  recorder: async () => ({ ok: true }),
  deliveryChunker: async (text) => [text],
  sleep: async () => {}
})
await listen(brain)
const brainPort = brain.address().port

try {
  const paused = await sendIncoming(brainPort, 'conv-off', 'incoming-off')
  assert.equal(paused.status, 200)
  assert.equal((await paused.json()).reason, 'agente_off')
  assert.equal(calls.some((call) => call.url.endsWith('/conversations/conv-off/messages')), false)

  const active = await sendIncoming(brainPort, 'conv-on', 'incoming-on')
  assert.equal(active.status, 200)
  assert.equal((await active.json()).accepted, true)
  await eventually(() => {
    assert.ok(calls.some((call) => call.url.endsWith('/conversations/conv-on/messages')))
  })

  const client = createChatwootClient(config)
  const handoff = await escalateToHuman({ chatwoot: client, conversationId: 'conv-escalate' })
  assert.deepEqual(handoff.labels, ['vip', 'agente-off'])
  assert.equal(handoff.assigneeId, null)
  const assignment = calls.find((call) => call.url.endsWith('/conversations/conv-escalate/assignments'))
  assert.deepEqual(assignment.body, { assignee_id: null })

  console.log('S5 smoke PASS: agente-off pausa bot; sem label responde; escalacao preserva labels e sem assignee')
} finally {
  await close(brain)
  await close(chatwootServer)
}

function sendIncoming(port, conversationId, messageId) {
  return fetch(`http://127.0.0.1:${port}/webhooks/chatwoot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      event: 'message_created',
      message: {
        id: messageId,
        message_type: 'incoming',
        content: 'Oi',
        conversation_id: conversationId,
        sender_id: 'contact-smoke'
      },
      conversation: { id: conversationId },
      sender: { id: 'contact-smoke', type: 'Contact' }
    })
  })
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json' })
  res.end(JSON.stringify(payload))
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

async function eventually(assertion) {
  const deadline = Date.now() + 2_000
  let lastError
  while (Date.now() < deadline) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
  }
  throw lastError
}
