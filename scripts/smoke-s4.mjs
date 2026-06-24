import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { deliverResponse } from '../apps/brain/src/delivery/delivery-layer.mjs'
import { recordModelCall } from '../apps/brain/src/observability/model-call-recorder.mjs'

const execFileAsync = promisify(execFile)
const env = { ...process.env, ...await readDotEnv(new URL('../.env', import.meta.url)) }
const conversationId = `delivery-${randomUUID()}`
const calls = []

const result = await deliverResponse({
  tenant: 'demo',
  conversationId,
  accountId: 'account-smoke',
  startedMessageId: 'msg-start',
  channel: 'text',
  outputKind: 'text',
  resposta: 'Olá! Consigo te ajudar por aqui. Me conta o que você precisa hoje?',
  config: { wordsPerMinute: 150, gapMs: 1, capTextMs: 25_000, capZapiMs: 15_000, capAudioMs: 12_000 },
  chatwoot: {
    async updateLastSeen(context) { calls.push({ type: 'seen', context }) },
    async toggleTyping(context, status) { calls.push({ type: 'typing', status, context }) },
    async sendMessage(context, text) { calls.push({ type: 'send', text, context }) }
  },
  chunker: async () => ['Olá', 'Consigo te ajudar por aqui'],
  sleep: async () => {},
  latestMessageIdForConversation: () => 'msg-start',
  recorder: (entry) => recordModelCall(entry, { env })
})

assert.equal(result.status, 'sent')
assert.deepEqual(calls.slice(0, 3).map((call) => call.type), ['seen', 'typing', 'send'])

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
      and papel = 'delivery'
      and modelo = 'delivery-layer'`
])

assert.equal(stdout.trim(), '1')
console.log('S4 smoke PASS: delivery enviou em ordem e gravou telemetria')

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
