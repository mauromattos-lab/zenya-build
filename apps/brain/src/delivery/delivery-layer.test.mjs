import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calculateTypingDelayMs, createLlmChunker, deliverResponse, heuristicChunker } from './delivery-layer.mjs'

describe('delivery-layer', () => {
  it('calcula tempo de digitacao pela formula respeitando cap', () => {
    assert.equal(calculateTypingDelayMs('a'.repeat(45), { wordsPerMinute: 150, capTextMs: 25_000 }, 'text'), 4000)
    assert.equal(calculateTypingDelayMs('a'.repeat(10_000), { wordsPerMinute: 150, capTextMs: 25_000 }, 'text'), 25_000)
  })

  it('quebra em no maximo 5 partes e nao divide lista numerada', async () => {
    const chunks = await heuristicChunker('Uma. Duas. Três. Quatro. Cinco. Seis. Sete. Oito. Nove. Dez.')
    assert.ok(chunks.length <= 5)

    const listChunks = await heuristicChunker('1. Primeiro item\n2. Segundo item\n3. Terceiro item')
    assert.equal(listChunks.length, 1)
    assert.match(listChunks[0], /2\. Segundo item/)
  })

  it('chunker LLM normaliza resposta para no maximo 5 partes', async () => {
    const chunker = createLlmChunker({
      config: { tenant: 'tenant-s4', model: 'gpt-4.1-mini', credentials: { llm: { apiKey: 'test-key' } } },
      recorder: async () => ({ ok: true }),
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return {
            output_text: JSON.stringify({ mensagens: ['1', '2', '3', '4', '5', '6'] }),
            usage: { input_tokens: 10, output_tokens: 8 }
          }
        }
      })
    })

    assert.deepEqual(await chunker('texto'), ['1', '2', '3', '4', '5'])
  })

  it('faz update_last_seen antes do primeiro digitando', async () => {
    const calls = []
    await deliverResponse(baseInput({
      chatwoot: chatwootMock(calls),
      chunker: async () => ['Oi'],
      sleep: async () => {}
    }))

    assert.deepEqual(calls.slice(0, 2).map((call) => call.type), ['seen', 'typing'])
  })

  it('aguarda gap de 1s entre partes', async () => {
    const sleeps = []
    await deliverResponse(baseInput({
      chunker: async () => ['Oi', 'Tudo bem'],
      sleep: async (ms) => { sleeps.push(ms) }
    }))

    assert.ok(sleeps.includes(1000))
  })

  it('mensagem nova no meio cancela a entrega sem partes orfas', async () => {
    const calls = []
    const telemetry = []
    let latest = 'msg-start'
    const result = await deliverResponse(baseInput({
      chatwoot: chatwootMock(calls),
      chunker: async () => ['Oi'],
      sleep: async () => { latest = 'msg-new' },
      latestMessageIdForConversation: () => latest,
      recorder: async (entry) => { telemetry.push(entry); return { ok: true } }
    }))

    assert.equal(result.status, 'interrupted')
    assert.deepEqual(calls.map((call) => call.type), ['seen', 'typing'])
    assert.equal(calls.some((call) => call.type === 'send'), false)
    assert.equal(telemetry[0].finding, 'entrega.interrompida')
  })

  it('gera telemetria de entrega sem conteudo', async () => {
    const telemetry = []
    await deliverResponse(baseInput({
      chunker: async () => ['Conteudo sensivel'],
      sleep: async () => {},
      recorder: async (entry) => { telemetry.push(entry); return { ok: true } }
    }))

    assert.equal(telemetry.length, 1)
    assert.equal(telemetry[0].papel, 'delivery')
    assert.equal(JSON.stringify(telemetry).includes('Conteudo sensivel'), false)
  })

  it('audio usa recording e zapi usa delayTyping com caps corretos', async () => {
    const audioCalls = []
    await deliverResponse(baseInput({
      channel: 'audio',
      outputKind: 'audio',
      chatwoot: chatwootMock(audioCalls),
      chunker: async () => ['a'.repeat(10_000)],
      sleep: async () => {}
    }))
    assert.equal(audioCalls.find((call) => call.type === 'typing').status, 'recording')

    const zapiCalls = []
    await deliverResponse(baseInput({
      channel: 'zapi',
      chatwoot: chatwootMock(zapiCalls),
      chunker: async () => ['a'.repeat(10_000)],
      sleep: async () => {}
    }))
    const send = zapiCalls.find((call) => call.type === 'send')
    assert.equal(send.options.content_attributes.zapi_args.delayTyping, 15)

    const zapiAudioCalls = []
    await deliverResponse(baseInput({
      channel: 'zapi',
      outputKind: 'audio',
      chatwoot: chatwootMock(zapiAudioCalls),
      chunker: async () => ['a'.repeat(10_000)],
      sleep: async () => {}
    }))
    const audioSend = zapiAudioCalls.find((call) => call.type === 'send')
    assert.equal(audioSend.options.content_attributes.zapi_args.delayTyping, 12)
  })
})

function baseInput(overrides = {}) {
  return {
    tenant: 'tenant-s4',
    conversationId: 'conv-s4',
    accountId: 'acct-s4',
    startedMessageId: 'msg-start',
    channel: overrides.channel ?? 'text',
    outputKind: overrides.outputKind ?? 'text',
    resposta: 'Oi',
    config: { wordsPerMinute: 150, gapMs: 1000, capTextMs: 25_000, capZapiMs: 15_000, capAudioMs: 12_000 },
    chatwoot: overrides.chatwoot ?? chatwootMock([]),
    chunker: overrides.chunker ?? (async () => ['Oi']),
    sleep: overrides.sleep ?? (async () => {}),
    latestMessageIdForConversation: overrides.latestMessageIdForConversation ?? (() => 'msg-start'),
    recorder: overrides.recorder ?? (async () => ({ ok: true }))
  }
}

function chatwootMock(calls) {
  return {
    async updateLastSeen(context) {
      calls.push({ type: 'seen', context })
    },
    async toggleTyping(context, status) {
      calls.push({ type: 'typing', status, context })
    },
    async sendMessage(context, text, options = {}) {
      calls.push({ type: 'send', text, options, context })
    }
  }
}
