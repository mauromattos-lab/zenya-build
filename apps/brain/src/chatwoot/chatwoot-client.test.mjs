import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createChatwootClient } from './chatwoot-client.mjs'

describe('chatwoot-client', () => {
  it('envia update_last_seen, typing e outgoing com token do bot', async () => {
    const calls = []
    const client = createChatwootClient({
      chatwootBaseUrl: 'http://chatwoot.test',
      chatwootAccountId: '2',
      chatwootApiToken: 'token-test'
    }, {
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init })
        return { ok: true, status: 200, async json() { return { ok: true } } }
      }
    })

    await client.updateLastSeen({ conversationId: '10' })
    await client.toggleTyping({ conversationId: '10' }, 'on')
    await client.sendMessage({ conversationId: '10' }, 'oi', { content_attributes: { x: true } })

    assert.equal(calls[0].url, 'http://chatwoot.test/api/v1/accounts/2/conversations/10/update_last_seen')
    assert.equal(calls[1].url, 'http://chatwoot.test/api/v1/accounts/2/conversations/10/toggle_typing_status')
    assert.equal(JSON.parse(calls[1].init.body).typing_status, 'on')
    assert.equal(calls[2].url, 'http://chatwoot.test/api/v1/accounts/2/conversations/10/messages')
    assert.equal(JSON.parse(calls[2].init.body).message_type, 'outgoing')
    assert.equal(calls.every((call) => call.init.headers.api_access_token === 'token-test'), true)
  })
})
