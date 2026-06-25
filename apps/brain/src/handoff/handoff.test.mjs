import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AGENTE_OFF_LABEL, escalateToHuman, isBotPaused } from './handoff.mjs'

describe('handoff', () => {
  it('pausa o bot quando a conversa tem agente-off', async () => {
    assert.equal(await isBotPaused({
      getConversationLabels: async () => ['vip', AGENTE_OFF_LABEL]
    }, 'conv-1'), true)
  })

  it('mantem o bot ativo quando a conversa nao tem agente-off', async () => {
    assert.equal(await isBotPaused({
      getConversationLabels: async () => ['vip']
    }, 'conv-1'), false)
  })

  it('escala preservando labels existentes e sem assignee', async () => {
    const calls = []
    const result = await escalateToHuman({
      conversationId: 'conv-1',
      chatwoot: {
        getConversationLabels: async () => ['vip'],
        setLabels: async (conversationId, labels) => {
          calls.push({ type: 'labels', conversationId, labels })
        },
        assignConversation: async (conversationId, assigneeId) => {
          calls.push({ type: 'assignment', conversationId, assigneeId })
        }
      }
    })

    assert.deepEqual(calls, [
      { type: 'labels', conversationId: 'conv-1', labels: ['vip', AGENTE_OFF_LABEL] },
      { type: 'assignment', conversationId: 'conv-1', assigneeId: null }
    ])
    assert.deepEqual(result, {
      conversationId: 'conv-1',
      labels: ['vip', AGENTE_OFF_LABEL],
      assigneeId: null
    })
  })
})
