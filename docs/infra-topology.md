# Infra & Topologia — runbook do ambiente isolado

> Como o ambiente sobe na VPS `srv1743215`, **isolado da zerada**. Design caro (uma vez);
> execução barata (Codex/bridge) com **gates humanos** nos passos de risco.

## Princípio de isolamento

Tudo em `/srv/zenya-build`, **compose próprio, portas próprias, banco próprio**. A zerada
(`zenya-evolution`, `zenya-postgres`) **continua rodando intocada** até desativação deliberada.
**Sem colisão de porta** com o que já roda.

## Componentes

| Componente | O que | Notas |
|---|---|---|
| **Chatwoot fork** | self-host (fazer-ai/chatwoot) via docker-compose | portas próprias (ex. 3001 + PG 5433 + Redis 6380 — confirmar livres). Traz PG+Redis dele. |
| **Supabase** | **Cloud**, projeto novo `zenya-build` | branching pra dev/staging. Tabelas: `model_calls`, config de tenant, agenda, leads/dossiê. |
| **Cérebro** | container/processo próprio | env: Supabase keys, Chatwoot API token, LLM keys, config-loader por tenant. |
| **Webhook** | Chatwoot → cérebro (URL interna) | provider WhatsApp → Chatwoot. |

## Gates humanos (Mauro aprova)

- Expor porta / configurar DNS.
- Conectar **número real** de WhatsApp.
- Criar projeto Supabase (custo).
- **Qualquer** comando que toque os containers da zerada.

## Runbook (ordem; execução barata)

1. Conferir portas livres (não colidir com a zerada): `docker ps`, `ss -tlnp`.
2. `git clone` do fork do Chatwoot em `/srv/zenya-build/chatwoot`; ajustar `.env` + portas.
3. `docker compose up -d` do Chatwoot; criar conta admin; criar 1 inbox (tenant demo).
4. Criar projeto Supabase Cloud `zenya-build`; aplicar migrations (`model_calls` primeiro).
5. Esqueleto do cérebro (container) + `.env`; webhook Chatwoot→cérebro.
6. Smoke: mensagem de teste entra, telemetria grava, resposta sai.

## Desativação da zerada (depois — passo consciente)

Pré: (1) doador colhido, (2) `git push` manual de confirmação, (3) confirmar que nada vivo
depende. Então: parar `zenya-evolution`/`zenya-postgres`, arquivar, remover. **Nunca antes.**

## Pendência

Confirmar fuso/portas livres no 1º acesso; confirmar se a prod roda o mesmo fork (convergência).

---
*infra-topology v1 — Aria, 2026-06-23.*
