import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { createConversationTurnRuntime } from '../apps/brain/src/turn/conversation-turn.mjs'
import { recordModelCall } from '../apps/brain/src/observability/model-call-recorder.mjs'

const execFileAsync = promisify(execFile)
const env = { ...process.env, ...await readDotEnv(new URL('../.env', import.meta.url)) }
const tenant = 'demo'
const conversationId = `conv-${randomUUID()}`

const runtime = createConversationTurnRuntime({
  config: {
    tenant,
    debounceMs: 5,
    model: 'gpt-4.1-mini',
    llmApiKey: env.ZENYA_LLM_API_KEY,
    systemPrompt: 'Você é a Zenya. Responda em português, curto e humano.',
    activeTools: ['agenda']
  },
  recorder: (call) => recordModelCall(call, { env })
})

const first = runtime.enqueueChatwootEvent(payload({ id: 'msg-1', content: 'oi' }))
runtime.enqueueChatwootEvent(payload({ id: 'msg-2', content: 'quero marcar horario' }))
const turn = await runtime.flush(first.queueKey)

assert.equal(turn.messageIds.length, 2)
assert.ok(turn.resposta.length > 0)
assert.equal(turn.turnUnderstanding.messageCount, 2)
assert.deepEqual(turn.turnUnderstanding.offeredTools, ['agenda'])

const { stdout } = await execFileAsync('psql', [
  env.DATABASE_URL,
  '-t',
  '-A',
  '-v',
  'ON_ERROR_STOP=1',
  '-c',
  `select count(*)::int
     from public.model_calls
    where tenant = '${tenant}'
      and conversa_id = '${conversationId}'
      and papel = 'main'
      and modelo = 'gpt-4.1-mini'
      and custo > 0`
])

assert.equal(stdout.trim(), '1')
console.log(`S3 smoke PASS: turno real respondeu e gravou model_calls com custo > 0 para ${tenant}`)

function payload({ id, content }) {
  return {
    event: 'message_created',
    message: {
      id,
      content,
      conversation_id: conversationId,
      sender_id: 'contact-smoke'
    },
    conversation: { id: conversationId },
    sender: { id: 'contact-smoke' }
  }
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
