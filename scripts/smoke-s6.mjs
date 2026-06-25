import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createAgendaTool } from '../apps/brain/src/tools/agenda/agenda-tool.mjs'

const env = { ...process.env, ...await readDotEnv(new URL('../.env', import.meta.url)) }

if (!env.GOOGLE_CALENDAR_SA_JSON || !env.GOOGLE_CALENDAR_ID) {
  console.log('S6 smoke SKIP: GOOGLE_CALENDAR_SA_JSON/GOOGLE_CALENDAR_ID ausentes')
  process.exit(0)
}

const tool = createAgendaTool({
  serviceAccountJson: env.GOOGLE_CALENDAR_SA_JSON,
  calendarId: env.GOOGLE_CALENDAR_ID,
  timeZone: env.ZENYA_TENANT_TZ || 'America/Sao_Paulo'
})

const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
const inicio = `${tomorrow}T15:00:00.000Z`
const fim = `${tomorrow}T15:30:00.000Z`
const event = await tool.criarEvento({
  inicio,
  fim,
  titulo: 'S6 smoke Zenya',
  cliente: 'Smoke',
  telefone: '+550000000000',
  notas: 'Evento criado pelo smoke S6',
  origin: 'zenya',
  conversaId: `smoke-s6-${Date.now()}`
})

try {
  assert.equal(event.extendedProperties.private.origin, 'zenya')
  assert.ok(event.extendedProperties.private.conversaId)
  const slots = await tool.buscarJanelasLivres({ data: tomorrow, duracaoMin: 30 })
  assert.ok(Array.isArray(slots))
  console.log('S6 smoke PASS: evento criado e janelas consultadas no Google Calendar')
} finally {
  if (event.id) await tool.desmarcarEvento(event.id)
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
