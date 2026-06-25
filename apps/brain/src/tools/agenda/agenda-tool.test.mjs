import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buscarJanelasLivres, criarEvento, createAgendaToolSafe } from './agenda-tool.mjs'
import { calendarEventToPanelAppointment, zonedDateTimeToUtcIso } from './timezone.mjs'

describe('agenda-tool', () => {
  it('mapeia evento Google para painel no fuso do tenant sem deslocar dia/hora', () => {
    const panel = calendarEventToPanelAppointment({
      id: 'evt-1',
      summary: 'Consulta',
      description: 'Notas',
      start: { dateTime: '2026-06-24T17:30:00.000Z' },
      end: { dateTime: '2026-06-24T18:15:00.000Z' },
      extendedProperties: {
        private: {
          status: 'aguardando',
          origin: 'zenya',
          conversaId: 'conv-1',
          cliente: 'Mauro',
          telefone: '+55'
        }
      }
    }, 'America/Sao_Paulo')

    assert.equal(panel.day, 2)
    assert.equal(panel.start, 14.5)
    assert.equal(panel.dur, 45)
    assert.equal(panel.conversaId, 'conv-1')
  })

  it('converte horario local do tenant para ISO UTC', () => {
    assert.equal(
      zonedDateTimeToUtcIso({ date: '2026-06-24', time: '09:00', timeZone: 'America/Sao_Paulo' }),
      '2026-06-24T12:00:00.000Z'
    )
  })

  it('criarEvento origin zenya grava conversaId em extendedProperties', async () => {
    let inserted
    await criarEvento({
      inicio: '2026-06-24T12:00:00.000Z',
      fim: '2026-06-24T12:30:00.000Z',
      titulo: 'Demo',
      cliente: 'Mauro',
      telefone: '+55',
      origin: 'zenya',
      conversaId: 'conv-123',
      timeZone: 'America/Sao_Paulo',
      client: { async insertEvent(event) { inserted = event; return event } }
    })

    assert.equal(inserted.extendedProperties.private.origin, 'zenya')
    assert.equal(inserted.extendedProperties.private.conversaId, 'conv-123')
  })

  it('origin zenya sem conversaId falha com erro claro', async () => {
    await assert.rejects(() => criarEvento({
      inicio: '2026-06-24T12:00:00.000Z',
      fim: '2026-06-24T12:30:00.000Z',
      titulo: 'Demo',
      origin: 'zenya',
      timeZone: 'America/Sao_Paulo',
      client: {}
    }), /conversaId/)
  })

  it('buscarJanelasLivres respeita horario, eventos ocupados e bloqueios', async () => {
    const slots = await buscarJanelasLivres({
      data: '2026-06-24',
      duracaoMin: 60,
      timeZone: 'America/Sao_Paulo',
      workStart: '09:00',
      workEnd: '12:00',
      bloqueios: [{ start: '2026-06-24T14:00:00.000Z', end: '2026-06-24T15:00:00.000Z' }],
      client: {
        async freebusy() {
          return { calendars: { demo: { busy: [{ start: '2026-06-24T13:00:00.000Z', end: '2026-06-24T14:00:00.000Z' }] } } }
        }
      }
    })

    assert.deepEqual(slots, [
      { inicio: '2026-06-24T12:00:00.000Z', fim: '2026-06-24T13:00:00.000Z' }
    ])
  })

  it('sem credencial retorna tool indisponivel sem derrubar setup do turno', async () => {
    const tool = createAgendaToolSafe({ serviceAccountJson: '', calendarId: '' })
    assert.equal(tool.unavailable, true)
    await assert.rejects(() => tool.buscarJanelasLivres(), /GOOGLE_CALENDAR/)
  })
})
