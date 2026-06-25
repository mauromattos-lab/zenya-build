import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createConversationTurnRuntime, enabledTools, normalizeChatwootMessage, shouldEscalateToHuman } from './conversation-turn.mjs'

describe('conversation-turn', () => {
  it('agrega burst dentro do debounce em um unico turno', async () => {
    const recorded = []
    const runtime = createConversationTurnRuntime({
      config: { tenant: 'tenant-s3', debounceMs: 50, model: 'gpt-4o-mini', activeTools: ['agenda'], credentials: { llm: { apiKey: 'test-key' } } },
      llmClient: fakeLlm,
      delivery: null,
      recorder: async (call) => {
        recorded.push(call)
        return { ok: true }
      }
    })

    const first = runtime.enqueueChatwootEvent(chatwootPayload({ id: 1, content: 'oi' }))
    runtime.enqueueChatwootEvent(chatwootPayload({ id: 2, content: 'quero agenda' }))
    const turn = await runtime.flush(first.queueKey)

    assert.equal(turn.messageIds.length, 2)
    assert.equal(turn.turnUnderstanding.messageCount, 2)
    assert.equal(recorded.length, 1)
    assert.equal(recorded[0].papel, 'main')
    assert.equal(recorded[0].conversaId, 'conv-1')
  })

  it('transcreve audio antes de entrar no loop', () => {
    const message = normalizeChatwootMessage(chatwootPayload({
      id: 3,
      content: '',
      attachments: [{ file_type: 'audio', data_url: 'https://example.test/audio.ogg' }]
    }), {
      tenant: 'tenant-s3',
      transcriber: () => 'audio transcrito'
    })

    assert.equal(message.type, 'audio')
    assert.equal(message.text, 'audio transcrito')
  })

  it('nao oferece tool desativada ao LLM', async () => {
    assert.deepEqual(enabledTools(['agenda', 'tool-inexistente']), ['agenda'])
  })

  it('produz TurnUnderstanding persistido no runtime', async () => {
    const runtime = createConversationTurnRuntime({
      config: { tenant: 'tenant-s3', debounceMs: 1, model: 'gpt-4o-mini', activeTools: [], credentials: { llm: { apiKey: 'test-key' } } },
      llmClient: fakeLlm,
      delivery: null,
      recorder: async () => ({ ok: true })
    })
    const enqueued = runtime.enqueueChatwootEvent(chatwootPayload({ id: 4, content: 'ola' }))
    await runtime.flush(enqueued.queueKey)

    const turns = runtime.getTurns()
    assert.equal(turns.length, 1)
    assert.equal(turns[0].turnUnderstanding.intent, 'message_received')
  })

  it('escala para humano sem entregar resposta quando LLM pede handoff', async () => {
    const delivered = []
    const escalations = []
    const runtime = createConversationTurnRuntime({
      config: { tenant: 'tenant-s5', debounceMs: 1, model: 'gpt-4o-mini', activeTools: ['handoff'], credentials: { llm: { apiKey: 'test-key' } } },
      llmClient: async () => ({
        resposta: 'Vou acionar uma pessoa.',
        turnUnderstanding: {
          intent: 'handoff_requested',
          leadSignals: [],
          actionsTaken: ['handoff']
        },
        usage: { tokensIn: 5, tokensOut: 6 }
      }),
      delivery: {
        deliver: async (entry) => {
          delivered.push(entry)
        }
      },
      handoff: async (entry) => {
        escalations.push(entry)
        return { conversationId: entry.conversationId, labels: ['agente-off'], assigneeId: null }
      },
      recorder: async () => ({ ok: true })
    })
    const enqueued = runtime.enqueueChatwootEvent(chatwootPayload({ id: 5, content: 'quero falar com humano' }))
    await runtime.flush(enqueued.queueKey)

    assert.equal(delivered.length, 0)
    assert.equal(escalations.length, 1)
    assert.equal(escalations[0].conversationId, 'conv-1')
    assert.equal(runtime.getTurns()[0].handoff.assigneeId, null)
  })

  it('detecta sinais comuns de escala humana', () => {
    assert.equal(shouldEscalateToHuman(['handoff']), true)
    assert.equal(shouldEscalateToHuman(['encaminhar_humano']), true)
    assert.equal(shouldEscalateToHuman(['responder']), false)
  })
})

function chatwootPayload({ id, content, attachments = [] }) {
  return {
    event: 'message_created',
    message: {
      id,
      content,
      conversation_id: 'conv-1',
      sender_id: 'contact-1',
      attachments
    },
    conversation: { id: 'conv-1' },
    sender: { id: 'contact-1' }
  }
}

async function fakeLlm({ userText, activeTools }) {
  return {
    resposta: `Resposta real fake para: ${userText}`,
    turnUnderstanding: {
      intent: 'message_received',
      leadSignals: [],
      actionsTaken: []
    },
    usage: {
      tokensIn: 11,
      tokensOut: 7
    },
    activeTools
  }
}
