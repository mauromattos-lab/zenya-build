# Story S5 — Handoff (Agente Off)

> A primitiva "Agente Off" conforme `contracts/handoff.md`. O bot pausa quando a etiqueta
> está na conversa. Chatwoot account 2, inbox 1.

## Já configurado (Aria provê)
- Etiqueta `agente-off` criada no Chatwoot (account 2).
- Agent bot + `CHATWOOT_API_TOKEN`/`CHATWOOT_ACCOUNT_ID` já no `.env`.

## Implementar
1. Estender `apps/brain/src/chatwoot/chatwoot-client.mjs`:
   - `getConversationLabels(conversationId)` → GET `.../conversations/{id}/labels`
   - `setLabels(conversationId, labels[])` → POST `.../conversations/{id}/labels` (a API substitui o conjunto; ao adicionar/remover, **preservar as demais**).
   - `assignConversation(conversationId, assigneeId|null)` → POST `.../conversations/{id}/assignments`.
2. No fluxo do turno (`server.mjs`/`conversation-turn`): **antes** de processar+responder, checar se a conversa tem a etiqueta `agente-off` → se sim, **NÃO responder** (bot pausado), responde 200 e sai.
3. Escalação: função que o cérebro chama pra escalar (tentativas > `encaminharHumanoApos`, pedido explícito de humano, ou guardrail) → liga `agente-off` **sem** atribuir assignee (INV-05: pedido ≠ assunção). Opcional: finding/log.
4. Estados derivados (sem etiqueta=Zenya respondendo / `agente-off` sem assignee=Aguardando / com assignee=Atendendo) — expor pro painel depois.

## Critérios de aceite
1. Conversa COM `agente-off` → cérebro **não** envia resposta (unit + integração).
2. Conversa SEM a etiqueta → responde normal.
3. Escalação liga `agente-off` sem assignee.
4. Nunca bot + humano respondem juntos.
5. `npm run check` + `node --test` verdes.

## Nota
O teste live "bot pausa em mensagem real" depende do mesmo alcance brain↔Chatwoot (SSRF) do S4i — arremata junto com o loop. A **lógica + gestão de etiqueta** Aria verifica via API agora.
