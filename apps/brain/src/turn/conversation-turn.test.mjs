import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createConversationTurnRuntime, enabledTools, normalizeChatwootMessage } from './conversation-turn.mjs'

describe('conversation-turn', () => {
  it('agrega burst dentro do debounce em um unico turno', async () => {
    const recorded = []
    const runtime = createConversationTurnRuntime({
      config: { tenant: 'tenant-s3', debounceMs: 50, model: 'gpt-4o-mini', activeTools: ['agenda'] },
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
      config: { tenant: 'tenant-s3', debounceMs: 1, model: 'gpt-4o-mini', activeTools: [] },
      recorder: async () => ({ ok: true })
    })
    const enqueued = runtime.enqueueChatwootEvent(chatwootPayload({ id: 4, content: 'ola' }))
    await runtime.flush(enqueued.queueKey)

    const turns = runtime.getTurns()
    assert.equal(turns.length, 1)
    assert.equal(turns[0].turnUnderstanding.intent, 'message_received')
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
