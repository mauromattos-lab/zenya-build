import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { createBrainServer } from '../apps/brain/src/server.mjs'
import { recordModelCall } from '../apps/brain/src/observability/model-call-recorder.mjs'

const execFileAsync = promisify(execFile)
const env = { ...process.env, ...await readDotEnv(new URL('../.env', import.meta.url)) }
const conversationId = `s4i-${randomUUID()}`
const chatwootCalls = []

const chatwootServer = createServer(async (req, res) => {
  const body = await readJson(req)
  chatwootCalls.push({ method: req.method, url: req.url, headers: req.headers, body })
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ ok: true }))
})
await listen(chatwootServer)
const chatwootPort = chatwootServer.address().port

const brain = createBrainServer({
  config: {
    host: '127.0.0.1',
    port: 0,
    tenant: 'demo',
    chatwootBaseUrl: `http://127.0.0.1:${chatwootPort}`,
    chatwootAccountId: '2',
    chatwootApiToken: 'token-smoke',
    supabaseUrl: env.SUPABASE_URL ?? '',
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    databaseUrl: env.DATABASE_URL,
    llmApiKey: env.ZENYA_LLM_API_KEY,
    model: 'gpt-4.1-mini',
    systemPrompt: 'Você é a Zenya. Responda curto, humano e em português.',
    memoryWindow: 50,
    debounceMs: 1,
    delivery: { wordsPerMinute: 150, gapMs: 1, capTextMs: 1, capZapiMs: 1, capAudioMs: 1 },
    activeTools: []
  },
  recorder: (entry) => recordModelCall(entry, { env }),
  deliveryChunker: async (text) => [text],
  sleep: async () => {}
})
await listen(brain)
const brainPort = brain.address().port

try {
  const response = await fetch(`http://127.0.0.1:${brainPort}/webhooks/chatwoot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      event: 'message_created',
      message: {
        id: 'incoming-smoke',
        message_type: 'incoming',
        content: 'Oi, você pode me responder em uma frase?',
        conversation_id: conversationId,
        sender_id: 'contact-smoke'
      },
      conversation: { id: conversationId },
      sender: { id: 'contact-smoke', type: 'Contact' }
    })
  })
  assert.equal(response.status, 200)

  await eventually(() => {
    assert.ok(chatwootCalls.some((call) => call.url.endsWith(`/conversations/${conversationId}/messages`)))
  })

  const outgoing = chatwootCalls.find((call) => call.url.endsWith(`/conversations/${conversationId}/messages`))
  assert.equal(outgoing.headers.api_access_token, 'token-smoke')
  assert.equal(outgoing.body.message_type, 'outgoing')
  assert.ok(outgoing.body.content.length > 0)
  assert.deepEqual(chatwootCalls.slice(0, 3).map((call) => call.url.split('/').at(-1)), ['update_last_seen', 'toggle_typing_status', 'messages'])

  const ignored = await fetch(`http://127.0.0.1:${brainPort}/webhooks/chatwoot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event: 'message_created', message: { id: 'outgoing-smoke', message_type: 'outgoing', content: 'loop' } })
  })
  assert.equal((await ignored.json()).ignored, true)

  const { stdout } = await execFileAsync('psql', [
    env.DATABASE_URL,
    '-t',
    '-A',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `select count(*)::int
       from public.model_calls
      where tenant = 'demo'
        and conversa_id = '${conversationId}'
        and papel = 'main'
        and custo > 0`
  ])
  assert.equal(stdout.trim(), '1')

  console.log('S4i smoke PASS: incoming webhook gerou outgoing Chatwoot + model_calls')
} finally {
  await close(brain)
  await close(chatwootServer)
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
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
  const deadline = Date.now() + 20_000
  let lastError
  while (Date.now() < deadline) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw lastError
}

async function readDotEnv(url) {
  const content = await readFile(url, 'utf8')
  const output = {}
  for (const line of content.split(/\r?\n/)) {
    if (line.trim().length === 0 || line.trimStart().startsWith('#')) continue
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
    if (match === null) continue
    output[match[1]] = match[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
  }
  return output
}
