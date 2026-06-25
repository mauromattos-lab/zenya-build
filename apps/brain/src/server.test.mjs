import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createBrainServer, shouldProcessChatwootEvent } from './server.mjs'

describe('brain skeleton', () => {
  let server
  let baseUrl

  before(async () => {
    server = createBrainServer({
      config: {
        host: '127.0.0.1',
        port: 0,
        tenant: 'test',
        chatwootBaseUrl: 'http://localhost:3001',
        chatwootAccountId: '',
        chatwootApiToken: '',
        supabaseUrl: '',
        supabaseServiceRoleKey: '',
        llmApiKey: ''
      }
    })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })
    const { port } = server.address()
    baseUrl = `http://127.0.0.1:${port}`
  })

  after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })

  it('reports health without requiring external gates', async () => {
    const response = await fetch(`${baseUrl}/health`)
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.service, 'zenya-brain')
    assert.equal(body.readiness.supabaseConfigured, false)
  })

  it('accepts a Chatwoot webhook stub', async () => {
    const response = await fetch(`${baseUrl}/webhooks/chatwoot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event: 'message_created',
        message: {
          id: 'test-incoming',
          message_type: 'incoming',
          content: 'oi',
          conversation_id: 'conv-test',
          sender_id: 'contact-test',
        },
        conversation: { id: 'conv-test' },
        sender: { id: 'contact-test', type: 'Contact' },
      })
    })
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.accepted, true)
    assert.equal(body.source, 'chatwoot')
    assert.equal(body.event, 'message_created')
  })

  it('nao enfileira conversa pausada por agente-off', async () => {
    const calls = []
    const pausedServer = createBrainServer({
      config: {
        host: '127.0.0.1',
        port: 0,
        tenant: 'test',
        chatwootBaseUrl: 'http://localhost:3001',
        chatwootAccountId: '2',
        chatwootApiToken: 'token-test',
        supabaseUrl: '',
        supabaseServiceRoleKey: '',
        llmApiKey: ''
      },
      chatwoot: {
        getConversationLabels: async () => ['agente-off']
      },
      turnRuntime: {
        enqueueChatwootEvent: () => calls.push('enqueue'),
        getTurns: () => []
      }
    })
    await new Promise((resolve, reject) => {
      pausedServer.once('error', reject)
      pausedServer.listen(0, '127.0.0.1', () => {
        pausedServer.off('error', reject)
        resolve()
      })
    })
    const { port } = pausedServer.address()

    try {
      const response = await fetch(`http://127.0.0.1:${port}/webhooks/chatwoot`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          event: 'message_created',
          message: {
            id: 'test-paused',
            message_type: 'incoming',
            content: 'tem alguem?',
            conversation_id: 'conv-paused',
            sender_id: 'contact-test',
          },
          conversation: { id: 'conv-paused' },
          sender: { id: 'contact-test', type: 'Contact' },
        })
      })
      const body = await response.json()

      assert.equal(response.status, 200)
      assert.equal(body.ignored, true)
      assert.equal(body.reason, 'agente_off')
      assert.deepEqual(calls, [])
    } finally {
      await new Promise((resolve, reject) => pausedServer.close((error) => error ? reject(error) : resolve()))
    }
  })

  it('ignora eventos outgoing para evitar loop infinito', async () => {
    assert.equal(shouldProcessChatwootEvent({
      event: 'message_created',
      message: { message_type: 'outgoing', content: 'bot' }
    }), false)
  })
})
