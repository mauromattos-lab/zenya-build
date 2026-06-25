import { createGoogleCalendarClient } from './google-calendar-client.mjs'
import { calendarEventToPanelAppointment, zonedDateTimeToUtcIso } from './timezone.mjs'

const DEFAULT_WORK_START = '09:00'
const DEFAULT_WORK_END = '18:00'

export function createAgendaTool(options = {}) {
  const timeZone = options.timeZone ?? process.env.ZENYA_TENANT_TZ ?? 'America/Sao_Paulo'
  const client = options.client ?? createGoogleCalendarClient(options)
  return {
    buscarJanelasLivres(input) {
      return buscarJanelasLivres({ ...input, timeZone, client, bloqueios: options.bloqueios ?? [] })
    },
    criarEvento(input) {
      return criarEvento({ ...input, timeZone, client })
    },
    atualizarEvento(id, patch) {
      return atualizarEvento({ id, patch, timeZone, client })
    },
    desmarcarEvento(id) {
      return client.deleteEvent(id)
    },
    toPanel(event) {
      return calendarEventToPanelAppointment(event, timeZone)
    }
  }
}

export async function buscarJanelasLivres({ data, duracaoMin, timeZone, client, bloqueios = [], workStart = DEFAULT_WORK_START, workEnd = DEFAULT_WORK_END }) {
  const dayStartIso = zonedDateTimeToUtcIso({ date: data, time: workStart, timeZone })
  const dayEndIso = zonedDateTimeToUtcIso({ date: data, time: workEnd, timeZone })
  const busyResponse = await client.freebusy({ timeMin: dayStartIso, timeMax: dayEndIso })
  const busy = [
    ...(Object.values(busyResponse.calendars ?? {})[0]?.busy ?? []),
    ...bloqueios.map((bloqueio) => ({ start: bloqueio.start, end: bloqueio.end }))
  ].sort((left, right) => Date.parse(left.start) - Date.parse(right.start))

  const slots = []
  let cursor = Date.parse(dayStartIso)
  const dayEnd = Date.parse(dayEndIso)
  for (const block of busy) {
    const blockStart = Date.parse(block.start)
    const blockEnd = Date.parse(block.end)
    pushSlots(slots, cursor, Math.min(blockStart, dayEnd), duracaoMin)
    cursor = Math.max(cursor, blockEnd)
  }
  pushSlots(slots, cursor, dayEnd, duracaoMin)
  return slots
}

export async function criarEvento({ inicio, fim, titulo, cliente, telefone, notas, origin = 'manual', conversaId, timeZone, client }) {
  if (origin === 'zenya' && (typeof conversaId !== 'string' || conversaId.length === 0)) {
    throw new Error('conversaId is required when origin=zenya')
  }
  const event = {
    summary: titulo,
    description: notas,
    start: { dateTime: inicio, timeZone },
    end: { dateTime: fim, timeZone },
    extendedProperties: {
      private: {
        origin,
        status: 'aguardando',
        cliente: cliente ?? '',
        telefone: telefone ?? '',
        ...(conversaId ? { conversaId } : {})
      }
    }
  }
  return client.insertEvent(event)
}

export async function atualizarEvento({ id, patch, timeZone, client }) {
  const eventPatch = {
    ...(patch.titulo ? { summary: patch.titulo } : {}),
    ...(patch.notas ? { description: patch.notas } : {}),
    ...(patch.inicio ? { start: { dateTime: patch.inicio, timeZone } } : {}),
    ...(patch.fim ? { end: { dateTime: patch.fim, timeZone } } : {}),
    ...(patch.status || patch.origin || patch.conversaId ? {
      extendedProperties: {
        private: {
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.origin ? { origin: patch.origin } : {}),
          ...(patch.conversaId ? { conversaId: patch.conversaId } : {})
        }
      }
    } : {})
  }
  return client.patchEvent(id, eventPatch)
}

export function createAgendaToolSafe(options = {}) {
  try {
    return createAgendaTool(options)
  } catch (error) {
    return {
      unavailable: true,
      error: error instanceof Error ? error.message : 'Agenda unavailable',
      async buscarJanelasLivres() { throw new Error(this.error) },
      async criarEvento() { throw new Error(this.error) },
      async atualizarEvento() { throw new Error(this.error) },
      async desmarcarEvento() { throw new Error(this.error) }
    }
  }
}

function pushSlots(slots, fromMs, toMs, duracaoMin) {
  const durationMs = duracaoMin * 60_000
  for (let start = fromMs; start + durationMs <= toMs; start += durationMs) {
    slots.push({
      inicio: new Date(start).toISOString(),
      fim: new Date(start + durationMs).toISOString()
    })
  }
}
