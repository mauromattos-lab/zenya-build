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

  it('consulta e substitui labels da conversa', async () => {
    const calls = []
    const client = createChatwootClient({
      chatwootBaseUrl: 'http://chatwoot.test',
      chatwootAccountId: '2',
      chatwootApiToken: 'token-test'
    }, {
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init })
        return {
          ok: true,
          status: 200,
          async json() {
            return init.method === 'GET'
              ? { payload: ['vip', 'agente-off'] }
              : { labels: JSON.parse(init.body).labels }
          }
        }
      }
    })

    assert.deepEqual(await client.getConversationLabels('10'), ['vip', 'agente-off'])
    assert.deepEqual(await client.setLabels('10', ['vip']), ['vip'])

    assert.equal(calls[0].init.method, 'GET')
    assert.equal(calls[0].url, 'http://chatwoot.test/api/v1/accounts/2/conversations/10/labels')
    assert.equal(calls[1].init.method, 'POST')
    assert.deepEqual(JSON.parse(calls[1].init.body), { labels: ['vip'] })
  })

  it('atribui e desatribui conversa preservando o formato da API', async () => {
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

    await client.assignConversation('10', null)

    assert.equal(calls[0].url, 'http://chatwoot.test/api/v1/accounts/2/conversations/10/assignments')
    assert.deepEqual(JSON.parse(calls[0].init.body), { assignee_id: null })
  })
})
