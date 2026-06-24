export async function callOpenAiTurn(input, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: input.model,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: buildSystemPrompt(input)
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: input.userText
            }
          ]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'zenya_turn',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['resposta', 'turnUnderstanding'],
            properties: {
              resposta: { type: 'string' },
              turnUnderstanding: {
                type: 'object',
                additionalProperties: false,
                required: ['intent', 'leadSignals', 'actionsTaken'],
                properties: {
                  intent: { type: 'string' },
                  leadSignals: { type: 'array', items: { type: 'string' } },
                  actionsTaken: { type: 'array', items: { type: 'string' } }
                }
              }
            }
          },
          strict: true
        }
      }
    })
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenAI turn call failed: ${response.status} ${body}`)
  }

  const body = await response.json()
  const parsed = JSON.parse(extractOutputText(body))
  return {
    resposta: String(parsed.resposta ?? ''),
    turnUnderstanding: {
      intent: String(parsed.turnUnderstanding?.intent ?? 'unknown'),
      leadSignals: arrayOfStrings(parsed.turnUnderstanding?.leadSignals),
      actionsTaken: arrayOfStrings(parsed.turnUnderstanding?.actionsTaken)
    },
    usage: {
      tokensIn: body.usage?.input_tokens ?? 0,
      tokensOut: body.usage?.output_tokens ?? 0
    },
    rawModel: body.model
  }
}

export function resolveTenantLlmApiKey(config, tenant) {
  const tenantKey = config.tenantCredentials?.[tenant]?.llm?.apiKey
    ?? config.credentials?.llm?.apiKey
    ?? config.llm?.apiKey
  if (typeof tenantKey === 'string' && tenantKey.length > 0) return tenantKey
  if (tenant === 'demo' && typeof config.llmApiKey === 'string' && config.llmApiKey.length > 0) {
    return config.llmApiKey
  }
  throw new Error(`Missing tenant LLM key for ${tenant}`)
}

function buildSystemPrompt(input) {
  return [
    input.systemPrompt,
    '',
    'Responda somente no JSON solicitado.',
    `Tools habilitadas: ${input.activeTools.length > 0 ? input.activeTools.join(', ') : 'nenhuma'}.`
  ].join('\n')
}

function extractOutputText(body) {
  if (typeof body.output_text === 'string' && body.output_text.length > 0) return body.output_text
  for (const item of body.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text
    }
  }
  throw new Error('OpenAI response missing output_text')
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : []
}
