import assert from 'node:assert/strict'
import { createBrainServer } from '../apps/brain/src/server.mjs'

const server = createBrainServer({
  config: {
    host: '127.0.0.1',
    port: 0,
    tenant: 'smoke',
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

try {
  const { port } = server.address()
  const baseUrl = `http://127.0.0.1:${port}`

  const health = await fetch(`${baseUrl}/health`)
  assert.equal(health.status, 200)
  const healthBody = await health.json()
  assert.equal(healthBody.ok, true)
  assert.equal(healthBody.service, 'zenya-brain')

  const webhook = await fetch(`${baseUrl}/webhooks/chatwoot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event: 'message_created' })
  })
  assert.equal(webhook.status, 200)
  const webhookBody = await webhook.json()
  assert.equal(webhookBody.accepted, true)
  assert.equal(webhookBody.source, 'chatwoot')

  console.log('S1 smoke PASS: brain health + Chatwoot webhook stub')
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}
