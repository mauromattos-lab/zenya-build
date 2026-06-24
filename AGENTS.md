# AGENTS.md — orientação pro construtor (Codex)

Você está construindo o **Zenya build limpo**. Leia isto antes de agir.

## Fonte de verdade (leia nesta ordem)

1. `docs/00-arquitetura.md` — a estrela-guia (estrutura, fronteiras, decisões).
2. `docs/01-build-map.md` — a ordem das stories. Construa **a story pedida**, na ordem.
3. `docs/contracts/*.md` — o contrato de cada peça. **O contrato é a lei.**

## Como trabalhar (anti-gambiarra)

- Implemente **só o que o contrato diz**. Nada a mais "pra parecer pronto".
- **Lacuna no contrato → PARE e pergunte.** Nunca invente comportamento.
- A story só fecha quando os **critérios de aceite do contrato passam** — eles são a definição de pronto. Rode/verifique-os.
- Mudanças mínimas e determinadas. Sem hack pra "parecer que funciona".

## Gates — PARE e peça aprovação humana antes de:

- Criar projeto Supabase (custo).
- Expor porta / configurar DNS.
- Conectar **número real** de WhatsApp.
- **Qualquer** comando que toque `/srv/zenya` ou os containers da zerada
  (`zenya-evolution`, `zenya-postgres`). **Nunca** tocar a zerada.

## Isolamento

Este build vive em `/srv/zenya-build`, isolado. Portas/banco próprios, sem colidir com a
zerada. Banco = Supabase Cloud (projeto `zenya-build`). Observabilidade entra **antes** das
features (story S2).

## Marco

S1→S5 + S8 = Zenya demo respondendo como gente, **observável**.
