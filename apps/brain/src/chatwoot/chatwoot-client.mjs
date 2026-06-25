export function createChatwootClient(config, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch
  const baseUrl = required(config.chatwootBaseUrl, 'CHATWOOT_BASE_URL').replace(/\/+$/, '')
  const accountId = required(config.chatwootAccountId, 'CHATWOOT_ACCOUNT_ID')
  const apiToken = required(config.chatwootApiToken, 'CHATWOOT_API_TOKEN')

  return {
    getConversationLabels(conversationId) {
      return get({
        fetchImpl,
        apiToken,
        url: `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/labels`
      }).then(normalizeLabelsResponse)
    },

    setLabels(conversationId, labels) {
      return post({
        fetchImpl,
        apiToken,
        url: `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/labels`,
        body: { labels }
      }).then(normalizeLabelsResponse)
    },

    assignConversation(conversationId, assigneeId) {
      return post({
        fetchImpl,
        apiToken,
        url: `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/assignments`,
        body: { assignee_id: assigneeId }
      })
    },

    updateLastSeen({ conversationId }) {
      return post({
        fetchImpl,
        apiToken,
        url: `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/update_last_seen`
      })
    },

    toggleTyping({ conversationId }, status) {
      return post({
        fetchImpl,
        apiToken,
        url: `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/toggle_typing_status`,
        body: { typing_status: status }
      })
    },

    sendMessage({ conversationId }, content, opts = {}) {
      return post({
        fetchImpl,
        apiToken,
        url: `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
        body: {
          content,
          message_type: 'outgoing',
          ...(opts.content_attributes ? { content_attributes: opts.content_attributes } : {})
        }
      })
    }
  }
}

async function get({ fetchImpl, apiToken, url }) {
  return request({ fetchImpl, apiToken, url, method: 'GET' })
}

async function post({ fetchImpl, apiToken, url, body }) {
  return request({ fetchImpl, apiToken, url, method: 'POST', body })
}

async function request({ fetchImpl, apiToken, url, method, body }) {
  const response = await fetchImpl(url, {
    method,
    headers: {
      api_access_token: apiToken,
      'content-type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Chatwoot request failed: ${response.status} ${text}`)
  }
  return response.status === 204 ? null : response.json().catch(() => null)
}

function normalizeLabelsResponse(payload) {
  if (Array.isArray(payload)) return payload.map(String)
  if (Array.isArray(payload?.payload)) return payload.payload.map(String)
  if (Array.isArray(payload?.labels)) return payload.labels.map(String)
  return []
}

function required(value, name) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing ${name}`)
  return value
}
