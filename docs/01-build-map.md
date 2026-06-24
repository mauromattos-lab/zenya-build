# Mapa de Build — stories pro Codex

> Ordem de construção. Cada story é **autossuficiente**: contrato + critérios de aceite +
> arquivos-alvo. Pensada pra **modelo barato** (Codex) executar. Verificação = os critérios
> de aceite do contrato. Gates humanos marcados ⚠️.

| # | Story | Contrato | Saída | Gate |
|---|---|---|---|---|
| S1 | **Infra bring-up** — Chatwoot + Supabase + esqueleto do cérebro, isolados | `infra-topology.md` | ambiente de pé, smoke passa | ⚠️ portas/DNS/Supabase |
| S2 | **Observabilidade** — tabela `model_calls` + recorder no esqueleto | `observability.md` | toda chamada LLM grava | — |
| S3 | **Ingress + turn** — webhook→fila→debounce→loop do agente (stub de tools) | `conversation-turn.md` | burst vira 1 turno; áudio transcrito | — |
| S4 | **Delivery-layer** — quebra + presença + ritmo + interrupção | `delivery-layer.md` | os 7 critérios de aceite | — |
| S5 | **Handoff** — "Agente Off" (escala, assumir, devolver, alerta) | `handoff.md` | nunca bot+humano juntos | — |
| S6 | **Agenda** — tool GCal + schema + timezone | `agenda.md` | TZ certo; `conversaId` gravado | ⚠️ credencial GCal |
| S7 | **Painel** — portar glass verbatim + ligar dados (Conversas+Agenda) | `painel-data.md` | render lado-a-lado bate; tempo real | — |
| S8 | **Tenant demo (Prime)** — seed config + smoke ponta-a-ponta | todos | demo responde como gente, observável | ⚠️ número real |

## Regras de execução (anti-gambiarra)

- O Codex implementa **só o que o contrato diz**. Lacuna no contrato → **perguntar**, não inventar.
- Cada story só fecha quando os **critérios de aceite do contrato passam** (verificáveis).
- Passo ⚠️ exige aprovação do Mauro antes de rodar.
- Humanização: além dos critérios, o **check leve de fidelidade** (alguns casos reais do n8n).

## Marco

**S1→S5 + S8** = a Zenya demo respondendo como gente, **observável**. É o ponto em que o
Mauro para de caçar no escuro e começa a soltar a mão pra ir pra Lyra.

---
*build-map v1 — Aria, 2026-06-23. Ordem: infra → observabilidade → turn → delivery → handoff → agenda → painel → demo.*
