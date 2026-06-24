import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildModelCallRow, calculateModelCallCost, recordModelCall } from './model-call-recorder.mjs'

describe('model-call-recorder', () => {
  it('calcula custo por tokens e modelo', () => {
    assert.equal(calculateModelCallCost({
      modelo: 'gpt-4o-mini',
      tokensIn: 1_000_000,
      tokensOut: 1_000_000
    }), 0.75)
  })

  it('monta somente metadados permitidos, sem conteudo da mensagem', () => {
    const row = buildModelCallRow({
      tenant: 'tenant-demo',
      papel: 'main',
      modelo: 'gpt-4o-mini',
      tokensIn: 10,
      tokensOut: 20,
      latenciaMs: 123,
      sucesso: true,
      conversaId: 'conv-1',
      prompt: 'nao persistir',
      resposta: 'nao persistir'
    })

    assert.deepEqual(Object.keys(row).sort(), [
      'conversa_id',
      'custo',
      'erro',
      'finding',
      'latencia_ms',
      'modelo',
      'papel',
      'sucesso',
      'tenant',
      'tokens_in',
      'tokens_out'
    ].sort())
    assert.equal('prompt' in row, false)
    assert.equal('resposta' in row, false)
  })

  it('marca turn.empty_reply quando o modelo retorna vazio', () => {
    const row = buildModelCallRow({
      tenant: 'tenant-demo',
      papel: 'main',
      modelo: 'gpt-4o-mini',
      emptyReply: true
    })

    assert.equal(row.finding, 'turn.empty_reply')
  })

  it('falha de gravacao nao derruba o turno', async () => {
    const result = await recordModelCall({
      tenant: 'tenant-demo',
      papel: 'main',
      modelo: 'gpt-4o-mini'
    }, {
      env: {},
      fetchImpl: async () => {
        throw new Error('should not run')
      }
    })

    assert.equal(result.ok, false)
    assert.match(result.error, /Missing/)
  })
})
