# Contrato: painel-data (o que alimenta o painel)

> O painel é **ESSE** (Claude Design), portado verbatim. Aqui está **só o dado** que ele
> recebe. 3 fontes; **todo bug mora nas junções**.

## As 3 fontes

| Aba/peça | Fonte |
|---|---|
| Conversas (lista, thread, contato) | **Chatwoot** |
| Agenda | **tool de agenda** (`agenda.md`) |
| Resumo IA, categoria de lead, status próprio, origin | **núcleo + Supabase** |

## Conversas — contrato

- **Lista:** `{ name, channel: wa|ig|site, lastMsg, time, status, unread, tag }`.
- **Thread (mensagem):** `{ from: 'cliente'|'zenya'|'humano', text, time }`.
- **Painel do contato:** `resumoIA` + `leadCategoriaRazao` (gerados pelo Curador no encerramento).
- **Assumir/Devolver** → `handoff.md` (Agente Off).

## As 8 armadilhas, viradas em regra

1. **Assumir pausa o bot** de verdade → `handoff.md`.
2. **`zenya` vs `humano`** nas bolhas → rastrear o autor de cada mensagem outbound (bot vs agente humano).
3. **Timezone da agenda** → `agenda.md`.
4. **`resumoIA`/`leadCategoria`** não existem no Chatwoot → gerados pelo Curador no encerramento (`conversation-turn.md`), gravados no Supabase.
5. **Status `aguardando_humano`** → derivar de "Agente Off" + atribuído (`handoff.md`).
6. **`conversaId` de origem** do agendamento → `agenda.md`.
7. **Schema de agendamento** formalizado → `agenda.md`.
8. **Tempo real** → push (websocket do Chatwoot ou realtime do Supabase). Sem isso não é "natural".

## Autorização por papel (do `AGENT_ACTIONS`)

`admin` (tudo) · `vendedor` (conversas/leads/agenda) · `atendente` (assumir/responder) ·
`visualizador` (só lê). Front esconde; **backend valida sempre**.

## Critérios de aceite

1. Bolha colore `zenya` ≠ `humano` corretamente (autor rastreado).
2. Filtro "Agente Off" mostra exatamente aguardando + atendendo.
3. `resumoIA` aparece após o encerramento; nunca vazio quando há conversa encerrada.
4. Mensagem nova aparece no painel **ao vivo** (push), sem refresh.
5. Ação bloqueada pelo papel é rejeitada no backend (não só escondida no front).

## Cross-ref

Conversas/handoff → `handoff.md` · agenda → `agenda.md` · resumo/lead → `conversation-turn.md`.

---
*painel-data v1 — Aria, 2026-06-23.*
