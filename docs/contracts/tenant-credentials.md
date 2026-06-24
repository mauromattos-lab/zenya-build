# Contrato: tenant-credentials (chaves por cliente)

> Cada tenant tem suas PRÓPRIAS credenciais, encriptadas. Nenhuma chamada client-bound usa
> chave global. Fonte: produção (`tenant/credentials` + `crypto`). Spec de comportamento.

## Princípio

- **Uma chave por cliente, por provider** (LLM, canal, TTS, pagamento, …).
- Credenciais **encriptadas em repouso**; carregadas pelo **config-loader** no runtime.
- O loop do agente e cada tool resolvem a credencial **do tenant atual** — nunca uma global.
- A `ZENYA_LLM_API_KEY` global do `.env` é **só semente do tenant demo**, não o padrão.

## Por que

- **COGS exato por cliente** (LLM + TTS + canal) → margem real → pricing.
- **Isolamento**: chave de um cliente comprometida/limitada não afeta os outros.
- **Cap/limite por cliente** no provider.
- **Teardown**: apagar cliente = apagar as chaves dele.

## Modelo

- Vault de credenciais por tenant (no Supabase, encriptado — `crypto`).
- Resolução: `config-loader(tenant)` → `{ llm, canal, tts, pagamento, ... }`.
- **Provider-side (knob por tenant):** idealmente uma **chave/projeto separado por cliente**
  no provider (ex.: OpenAI project-key) → atribuição e cap no próprio provider. Onde não
  houver chave separada, cai numa chave de pool com rastreio por `model_calls.tenant`.

## Segurança

- Chave **nunca** em log, telemetria ou git. `model_calls` grava `tenant`, jamais a chave.
- Encriptada no banco; rotação por tenant sem afetar outros.

## Critérios de aceite

1. Nenhuma chamada client-bound usa chave global — sempre a do tenant.
2. `config-loader(tenantA)` e `(tenantB)` resolvem chaves distintas.
3. Trocar/rotacionar a chave de um tenant não afeta outro.
4. Chave nunca aparece em log/telemetria/commit.
5. Custo por tenant é atribuível (via `model_calls.tenant` + chave separada quando houver).

## Cross-ref

Loop usa a chave do tenant → `conversation-turn.md` · custo por tenant → `observability.md`.

---
*tenant-credentials v1 — Aria, 2026-06-24.*
