# Contrato: conversation-turn (o loop do cérebro)

> Da mensagem do cliente até a resposta entregue. Fonte: n8n Secretária v3 (`01`) + padrão
> "conversation-turn / TurnUnderstanding" do doador. Spec de comportamento.

## Fluxo de um turno

1. **Ingress** — webhook (mensagem incoming do Chatwoot) → normaliza (texto / áudio→transcrição via Whisper / arquivo→descrição) → **enfileira** na fila por contato.
2. **Debounce + agregação** — espera `debounce_ms`, junta o burst numa entrada só. **Guarda de dedup** por `id_mensagem` (ver `delivery-layer.md §3`): execução obsoleta aborta.
3. **Marcar visto** (delega ao delivery-layer/handoff).
4. **Loop do agente** — LLM (`modelo` da config) + **tools** (function calling), com **memória** (histórico da conversa, janela `memory_window`). Produz:
   - `resposta` (texto) → entregue via `delivery-layer.md`.
   - `TurnUnderstanding` (estruturado: intenção, sinais de lead, ações tomadas).
5. **Side-effects** registrados como `AcaoZenya` (audit). Toda chamada LLM → `observability.md`.
6. **Encerramento da conversa** → **Curador (INV-15)**: gera `resumoIA` + `leadCategoria` e grava no Supabase. **Nunca por turno** (custo) — só no fim.

## Tools / subagentes disponíveis

agenda (`agenda.md`) · pagamento (Asaas/Ultracash) · e-commerce (Nuvemshop/Loja Integrada) ·
drive · kb (base de conhecimento) · handoff (`handoff.md`). Cada uma atrás do seu contrato,
ativável por tenant (`active_tools`).

## Invariantes

- **Voz única** — um turno por conversa por vez (a guarda de dedup garante).
- **Nada entre a mensagem e o cérebro** — a entrega não altera conteúdo.
- **Curador só no encerramento** — resumo/lead nunca por turno (INV-15).

## Parâmetros (config do tenant)

`modelo` · `memory_window` (default 50) · `debounce_ms` · `active_tools` · `system_prompt`.

## Critérios de aceite

1. Burst de N mensagens em <`debounce_ms` é processado como **um** turno.
2. Áudio é transcrito antes de entrar no loop.
3. Toda chamada LLM gera registro de telemetria (`observability.md`).
4. `resumoIA`/`leadCategoria` são gerados **só** no encerramento, nunca por turno.
5. Tool desativada no tenant **não** é oferecida ao LLM.
6. `TurnUnderstanding` é produzido e persistido a cada turno.

## Cross-ref

Entrega → `delivery-layer.md` · handoff → `handoff.md` · telemetria → `observability.md` ·
dado pro painel → `painel-data.md`.

---
*conversation-turn v1 — Aria, 2026-06-23.*
