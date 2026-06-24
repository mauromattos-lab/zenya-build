import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { recordModelCall } from '../apps/brain/src/observability/model-call-recorder.mjs'

const execFileAsync = promisify(execFile)
const env = { ...process.env, ...await readDotEnv(new URL('../.env', import.meta.url)) }
const tenant = `smoke-s2-${randomUUID()}`
const conversaId = `conv-${randomUUID()}`

const result = await recordModelCall({
  tenant,
  papel: 'main',
  modelo: 'gpt-4o-mini',
  tokensIn: 100,
  tokensOut: 50,
  latenciaMs: 12,
  sucesso: true,
  conversaId
}, { env })

assert.equal(result.ok, true, result.error)

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
      and conversa_id = '${conversaId}'
      and papel = 'main'
      and modelo = 'gpt-4o-mini'
      and tokens_in = 100
      and tokens_out = 50
      and custo is not null`
])

assert.equal(stdout.trim(), '1')
console.log(`S2 smoke PASS: model_calls row recorded for tenant ${tenant}`)

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
