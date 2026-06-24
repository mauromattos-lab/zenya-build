import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const MODEL_PRICES_USD_PER_1M = {
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 5.00, output: 15.00 },
  'gpt-4.1-mini': { input: 0.40, output: 1.60 }
}

const ALLOWED_FINDINGS = new Set([
  'turn.empty_reply',
  'entrega.interrompida',
  'gateway.failure'
])

export function calculateModelCallCost({ modelo, tokensIn = 0, tokensOut = 0 }) {
  const price = MODEL_PRICES_USD_PER_1M[modelo]
  if (price === undefined) return 0
  return roundMoney(((tokensIn * price.input) + (tokensOut * price.output)) / 1_000_000)
}

export function buildModelCallRow(input) {
  const row = {
    tenant: requireText(input.tenant, 'tenant'),
    papel: requireText(input.papel, 'papel'),
    modelo: requireText(input.modelo, 'modelo'),
    tokens_in: integerOrNull(input.tokensIn),
    tokens_out: integerOrNull(input.tokensOut),
    custo: input.custo ?? calculateModelCallCost({
      modelo: input.modelo,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut
    }),
    latencia_ms: integerOrNull(input.latenciaMs),
    sucesso: input.sucesso !== false,
    erro: optionalText(input.erro),
    finding: normalizeFinding(input.finding),
    conversa_id: optionalText(input.conversaId)
  }

  if (input.emptyReply === true) row.finding = 'turn.empty_reply'
  return row
}

export async function recordModelCall(input, options = {}) {
  try {
    const row = buildModelCallRow(input)
    await insertModelCall(row, options)
    return { ok: true, row }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'unknown recorder error'
    }
  }
}

export async function insertModelCall(row, options = {}) {
  const env = options.env ?? process.env
  if (env.SUPABASE_URL !== undefined && env.SUPABASE_SERVICE_ROLE_KEY !== undefined) {
    await insertViaSupabaseRest(row, env, options.fetchImpl ?? fetch)
    return
  }
  if (env.DATABASE_URL !== undefined) {
    await insertViaPsql(row, env.DATABASE_URL, options.execFileImpl)
    return
  }
  throw new Error('Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY or DATABASE_URL for model_calls recorder')
}

export async function insertViaSupabaseRest(row, env, fetchImpl = fetch) {
  const url = new URL('/rest/v1/model_calls', env.SUPABASE_URL)
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=minimal'
    },
    body: JSON.stringify(row)
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Supabase model_calls insert failed: ${response.status} ${body}`)
  }
}

export async function insertViaPsql(row, databaseUrl, execFileImpl = execFileAsync) {
  const sql = `
    insert into public.model_calls
      (tenant, papel, modelo, tokens_in, tokens_out, custo, latencia_ms, sucesso, erro, finding, conversa_id)
    values
      (:'tenant', :'papel', :'modelo', nullif(:'tokens_in', '')::integer, nullif(:'tokens_out', '')::integer,
       :'custo'::numeric, nullif(:'latencia_ms', '')::integer, :'sucesso'::boolean, nullif(:'erro', ''),
       nullif(:'finding', ''), nullif(:'conversa_id', ''))
  `
  const variables = {
    tenant: row.tenant,
    papel: row.papel,
    modelo: row.modelo,
    tokens_in: valueForPsql(row.tokens_in),
    tokens_out: valueForPsql(row.tokens_out),
    custo: String(row.custo),
    latencia_ms: valueForPsql(row.latencia_ms),
    sucesso: row.sucesso ? 'true' : 'false',
    erro: valueForPsql(row.erro),
    finding: valueForPsql(row.finding),
    conversa_id: valueForPsql(row.conversa_id)
  }
  await execFileImpl('psql', [
    databaseUrl,
    '-v',
    'ON_ERROR_STOP=1',
    '-q',
    '-c',
    sql,
    ...Object.entries(variables).flatMap(([key, value]) => ['-v', `${key}=${value}`])
  ])
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`Missing ${field}`)
  return value
}

function optionalText(value) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function integerOrNull(value) {
  if (value === undefined || value === null) return null
  if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid integer metric: ${value}`)
  return value
}

function normalizeFinding(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !ALLOWED_FINDINGS.has(value)) throw new Error(`Invalid finding: ${value}`)
  return value
}

function roundMoney(value) {
  return Number(value.toFixed(6))
}

function valueForPsql(value) {
  return value === null || value === undefined ? '' : String(value)
}
