# Story S4i — Integração brain ↔ Chatwoot (ao vivo)

> Liga o encanamento: evento do Chatwoot (agent bot) → conversation-turn → delivery-layer →
> resposta REAL no Chatwoot. Testável com **mensagem simulada** (sem WhatsApp).
> Contratos: `contracts/conversation-turn.md`, `contracts/delivery-layer.md`.

## Já configurado (não mexer)

- Agent Bot "Zenya Brain" conectado ao **inbox 1**, **account 2**.
- `.env` do brain: `CHATWOOT_BASE_URL=http://chatwoot-rails:3000`, `CHATWOOT_API_TOKEN` (token do bot),
  `CHATWOOT_ACCOUNT_ID=2`, `ZENYA_LLM_API_KEY` (chave do tenant demo).
- Chatwoot POSTa eventos do bot em `http://brain:3101/webhooks/chatwoot`.

## Implementar

**1. `apps/brain/src/chatwoot/chatwoot-client.mjs`** — cliente real que implementa a interface
que o `delivery-layer` injeta (`updateLastSeen`, `toggleTyping`, `sendMessage`). Auth por header
`api_access_token: <CHATWOOT_API_TOKEN>`. Endpoints (base = `CHATWOOT_BASE_URL`, acc = `CHATWOOT_ACCOUNT_ID`):
- `updateLastSeen({conversationId})` → `POST {base}/api/v1/accounts/{acc}/conversations/{conversationId}/update_last_seen`
- `toggleTyping({conversationId}, status)` → `POST .../conversations/{conversationId}/toggle_typing_status` body `{ typing_status: status }` (`'on'|'off'|'recording'`)
- `sendMessage({conversationId}, content, opts={})` → `POST .../conversations/{conversationId}/messages` body `{ content, message_type: 'outgoing', ...(opts.content_attributes ? { content_attributes: opts.content_attributes } : {}) }`

**2. `apps/brain/src/server.mjs`** — handler real do `POST /webhooks/chatwoot`:
- Parse do evento do agent-bot. Processar **apenas** `event === 'message_created'` com `message_type === 'incoming'`.
- **IGNORAR** outgoing / mensagens do próprio bot (loop-guard) — responder 200 e sair.
- Extrair `{ conversationId, contactId, content }` (e áudio se houver) do payload.
- Enfileirar no **runtime conversation-turn** (singleton no processo). Ao fechar o turno, passar a
  `resposta` pro **delivery-layer** (injetando o chatwoot-client real) → ele entrega humanizado
  (visto → digitando → quebra → envia), gravando telemetria de entrega.
- Sempre responder **200** rápido ao webhook (processar async).

**3. Config:** tenant `demo`; `config.llmApiKey = process.env.ZENYA_LLM_API_KEY`; debounce/wpm/caps default.

## Critérios de aceite

1. POST simulado de `message_created`/`incoming` em `/webhooks/chatwoot` → gera ≥1 turno → grava linha em `model_calls` (LLM real, custo>0) → e **envia uma mensagem `outgoing`** na conversa via API do Chatwoot.
2. Eventos `outgoing`/bot são ignorados (sem loop infinito).
3. A resposta aparece na conversa (verificável via API do Chatwoot).
4. Entrega humanizada (delivery-layer: ordem visto→digitando→envio).
5. `npm run check` + `node --test` verdes.

## Fora de escopo

WhatsApp real (o número conecta depois; a trilha é a mesma). Handoff/Agente Off = story própria.
