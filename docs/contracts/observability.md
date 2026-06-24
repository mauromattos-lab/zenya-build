# Contrato: observability (model-call-recorder)

> A telemetria que mata a cegueira (a causa-raiz do firefighting). Fonte: story-033 do
> doador (INV-18). É o **fundamento** — entra no esqueleto, antes de qualquer feature.

## O que registra

**Toda chamada de LLM** gera um registro (`model_calls`):
- `tenant`, `papel` (main / curador / chunker / outro), `modelo`
- `tokens_in`, `tokens_out`, `custo`, `latencia_ms`, `sucesso` (bool), `erro?`
- `conversa_id` (ref), `timestamp`
- **NUNCA o conteúdo da mensagem** — só metadados (privacidade).

## Findings (sinais de problema)

- `turn.empty_reply` — modelo retornou vazio.
- `entrega.interrompida` — guarda do delivery-layer abortou (ver `delivery-layer.md`).
- `gateway.failure` — falha de provider/gateway.

## Armazenamento

Tabela `model_calls` no Supabase. **Cuidados do doador:** precisa de `GRANT INSERT` e gravar
**dentro do contexto do tenant**. Gravação não pode derrubar o turno (best-effort, async).

## Por que importa

Quando algo quebra ("a Zenya da Thaína respondeu errado"), você **consulta isto** — não caça
log no escuro. É a metade que faltava pra você parar de apagar incêndio.

## Exposição

Lida pela **costura 1 (MCP read)** — pro painel e, depois, pra Lyra assistir a frota.

## Critérios de aceite

1. **Toda** chamada LLM gera exatamente uma linha em `model_calls`.
2. `custo` é calculado (tokens × tabela de preço do modelo).
3. **Zero** conteúdo de mensagem persistido — só metadados.
4. `turn.empty_reply` dispara quando o modelo retorna vazio.
5. Falha ao gravar telemetria **não** derruba o turno (best-effort).
6. Consulta por `tenant` + intervalo retorna tokens/custo/latência/sucesso agregados.

---
*observability v1 — Aria, 2026-06-23. Derivado de story-033 (INV-18).*
