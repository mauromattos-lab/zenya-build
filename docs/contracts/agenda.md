# Contrato: agenda (Google Calendar + aba Agenda do painel)

> A capacidade de agenda + o que a aba Agenda do painel consome. Fonte: n8n `03` (buscar
> janelas), `04`/`04.1` (criar/atualizar), `09` (desmarcar), `11` (lembretes) + o componente
> `glass-agenda.jsx`.

## Operações (tool)

- `buscar_janelas_livres(data, duração)` — slots livres respeitando horário do tenant e bloqueios.
- `criar_evento(...)` · `atualizar_evento(...)` · `desmarcar_evento(...)` — Google Calendar.

## Schema do agendamento (formalizado — o `DATA_MODEL` do painel não tinha)

```
Agendamento {
  id, day (0–6, Seg–Dom), start (hora decimal, ex. 14.5), dur (min),
  title (= serviço), client, phone,
  status: 'confirmado' | 'aguardando',
  origin: 'zenya' | 'manual',
  conversaId?,        // obrigatório se origin='zenya' (botão "ver conversa que gerou")
  notes?
}
Servico { id, name, dur }     // catálogo por tenant
Bloqueio { id, day, fullDay?, start?, dur?, reason }
```

## Armadilha #3 — TIMEZONE (a provável raiz dos bugs da Thaína)

Google Calendar é **tz-aware (ISO)**; o painel usa **hora decimal + índice de dia** no fuso
do tenant. Camada de tradução obrigatória: **todo cálculo/armazenamento no fuso do tenant**.
Evento GCal ↔ `{day, start, dur}` sempre convertido pelo TZ do tenant.

## Origem e confirmação

- `origin='zenya'` → criado via conversa; **gravar `conversaId`** (senão "ver conversa" quebra).
- `origin='manual'` → criado no painel.
- `status`: nasce `aguardando`; vira `confirmado` quando o cliente confirma (fluxo de lembrete `11`).

## Critérios de aceite

1. Slot proposto/criado bate no fuso do tenant (sem deslocamento de hora/dia).
2. Agendamento `origin='zenya'` **sempre** tem `conversaId`.
3. Lista nunca quebra: `start` decimal + `dur` renderizam no slot certo da grade.
4. `buscar_janelas_livres` respeita horário do tenant **e** bloqueios.
5. Confirmação do cliente move `aguardando` → `confirmado`.

## Cross-ref

Dado pro painel → `painel-data.md` · criado via conversa → `conversation-turn.md`.

---
*agenda v1 — Aria, 2026-06-23.*
