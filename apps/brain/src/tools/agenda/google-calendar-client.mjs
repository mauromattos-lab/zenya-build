import { createPrivateKey, sign } from 'node:crypto'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_BASE_URL = 'https://www.googleapis.com/calendar/v3'
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar'

export function createGoogleCalendarClient(options = {}) {
  const serviceAccount = parseServiceAccountJson(options.serviceAccountJson ?? process.env.GOOGLE_CALENDAR_SA_JSON)
  const calendarId = required(options.calendarId ?? process.env.GOOGLE_CALENDAR_ID, 'GOOGLE_CALENDAR_ID')
  const fetchImpl = options.fetchImpl ?? fetch
  let tokenCache = null

  async function authHeaders() {
    const token = await getAccessToken({ serviceAccount, fetchImpl, tokenCache })
    tokenCache = token
    return {
      authorization: `Bearer ${token.accessToken}`,
      'content-type': 'application/json'
    }
  }

  return {
    async freebusy({ timeMin, timeMax }) {
      const response = await fetchImpl(`${CALENDAR_BASE_URL}/freeBusy`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          timeMin,
          timeMax,
          items: [{ id: calendarId }]
        })
      })
      return readGoogleResponse(response)
    },

    async insertEvent(event) {
      const response = await fetchImpl(`${CALENDAR_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify(event)
      })
      return readGoogleResponse(response)
    },

    async patchEvent(id, patch) {
      const response = await fetchImpl(`${CALENDAR_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify(patch)
      })
      return readGoogleResponse(response)
    },

    async deleteEvent(id) {
      const response = await fetchImpl(`${CALENDAR_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: await authHeaders()
      })
      if (!response.ok) throw new Error(`Google Calendar delete failed: ${response.status} ${await response.text()}`)
      return { ok: true }
    }
  }
}

export async function getAccessToken({ serviceAccount, fetchImpl, tokenCache }) {
  const now = Math.floor(Date.now() / 1000)
  if (tokenCache !== null && tokenCache.expiresAt - 60 > now) return tokenCache
  const assertion = createJwtAssertion(serviceAccount, now)
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  })
  if (!response.ok) throw new Error(`Google OAuth token failed: ${response.status} ${await response.text()}`)
  const body = await response.json()
  return {
    accessToken: body.access_token,
    expiresAt: now + Number(body.expires_in ?? 3600)
  }
}

export function createJwtAssertion(serviceAccount, now = Math.floor(Date.now() / 1000)) {
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: serviceAccount.client_email,
    scope: CALENDAR_SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now
  }
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(claim)}`
  const signature = sign('RSA-SHA256', Buffer.from(signingInput), createPrivateKey(serviceAccount.private_key))
  return `${signingInput}.${base64Url(signature)}`
}

function parseServiceAccountJson(value) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error('Missing GOOGLE_CALENDAR_SA_JSON')
  const parsed = JSON.parse(value)
  return {
    client_email: required(parsed.client_email, 'serviceAccount.client_email'),
    private_key: required(parsed.private_key, 'serviceAccount.private_key')
  }
}

async function readGoogleResponse(response) {
  const body = await response.json().catch(async () => ({ error: await response.text() }))
  if (!response.ok) throw new Error(`Google Calendar request failed: ${response.status} ${JSON.stringify(body)}`)
  return body
}

function required(value, name) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing ${name}`)
  return value
}

function base64UrlJson(value) {
  return base64Url(Buffer.from(JSON.stringify(value)))
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url')
}
