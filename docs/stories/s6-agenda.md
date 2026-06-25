# Story S6 — Agenda (Google Calendar)

> Tool de agenda do núcleo, conforme `contracts/agenda.md`. Credencial via env (service account).

## Config (Aria provê a credencial; código só lê do env)
- `GOOGLE_CALENDAR_SA_JSON` — conteúdo do JSON da service account (Calendar).
- `GOOGLE_CALENDAR_ID` — id do calendário do tenant demo.
- `ZENYA_TENANT_TZ` — fuso do tenant (default `America/Sao_Paulo`).
- Podem estar vazios agora; o smoke live roda condicional (pula se credencial ausente).

## Implementar — `apps/brain/src/tools/agenda/`
1. Cliente GCal autenticado por **service account (JWT → OAuth token)** lendo `GOOGLE_CALENDAR_SA_JSON`. Pode usar `googleapis` OU JWT manual + REST (`https://www.googleapis.com/calendar/v3`). Calendar id de `GOOGLE_CALENDAR_ID`.
2. Operações:
   - `buscarJanelasLivres({ data, duracaoMin })` → slots livres (freebusy) respeitando horário do tenant + eventos.
   - `criarEvento({ inicio, fim, titulo, cliente, telefone, notas, origin, conversaId })` → cria evento; grava `origin`/`conversaId` em `extendedProperties.private`.
   - `atualizarEvento(id, {...})` · `desmarcarEvento(id)`.
3. Mapeamento p/ painel (`agenda.md`): evento GCal (ISO tz-aware) ↔ `{ day 0–6, start hora decimal, dur min, status, origin, conversaId }` **sempre no fuso do tenant**.
4. Registrar como tool do `conversation-turn` (disponível quando `'agenda'` está em `activeTools`).

## Critérios de aceite
1. Com credencial válida: `criarEvento` cria no calendário real e `buscarJanelasLivres` lista certo (smoke live; condicional se cred ausente).
2. TZ: hora/dia batem no fuso do tenant (sem deslocamento) — teste unitário do mapeamento.
3. `origin='zenya'` grava `conversaId` em extendedProperties.
4. Sem credencial → erro claro, **não derruba o turno** (best-effort).
5. `npm run check` + `node --test` verdes.

## Fora de escopo
Painel (S7). Confirmação aguardando→confirmado (lembrete) = incremento depois.
