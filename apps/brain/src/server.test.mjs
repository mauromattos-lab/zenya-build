import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createBrainServer } from './server.mjs'

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
      body: JSON.stringify({ event: 'message_created' })
    })
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.accepted, true)
    assert.equal(body.source, 'chatwoot')
    assert.equal(body.event, 'message_created')
  })
})
