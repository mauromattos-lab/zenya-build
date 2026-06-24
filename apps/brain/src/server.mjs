import { createServer as createHttpServer } from 'node:http'
import { readBrainConfig, readiness } from './config.mjs'

export function createBrainServer(options = {}) {
  const config = options.config ?? readBrainConfig()

  return createHttpServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        sendJson(res, 200, {
          ok: true,
          service: 'zenya-brain',
          tenant: config.tenant,
          chatwootBaseUrl: config.chatwootBaseUrl,
          readiness: readiness(config)
        })
        return
      }

      if (req.method === 'POST' && req.url === '/webhooks/chatwoot') {
        const payload = await readJson(req)
        sendJson(res, 200, {
          ok: true,
          accepted: true,
          source: 'chatwoot',
          event: payload.event ?? payload.event_type ?? 'unknown',
          tenant: config.tenant,
          reply: 'stub: brain skeleton received the Chatwoot event'
        })
        return
      }

      sendJson(res, 404, { ok: false, error: 'not_found' })
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'bad_request'
      })
    }
  })
}

export async function startBrainServer(config = readBrainConfig()) {
  const server = createBrainServer({ config })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(config.port, config.host, () => {
      server.off('error', reject)
      resolve()
    })
  })
  return server
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (chunks.length === 0) return {}
  const body = Buffer.concat(chunks).toString('utf8')
  return JSON.parse(body)
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = readBrainConfig()
  await startBrainServer(config)
  console.log(`zenya-brain listening on ${config.host}:${config.port}`)
}
