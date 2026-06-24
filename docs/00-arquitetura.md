# Zenya — Arquitetura do Build Limpo (estrela-guia)

> **Documento de referência.** Tudo volta aqui. Define estrutura, fronteiras, costuras e
> ordem de build. **Implementação NÃO acontece neste doc** — ele é o blueprint; os
> contratos em `docs/contracts/*` e as stories descem dele.
>
> Origem: sessão de arquitetura com Aria (2026-06-23), ancorada no brief *"Zenya build
> limpo"* e nos fluxos n8n **Secretária v3** (provados em produção com cliente real).
> Construtor (Codex / Claude Code / futura workforce Hermes) é trocável — **o contrato é a lei**.

---

## 0. Como usar este doc

- **Este arquivo** = o mapa. Estável, muda pouco.
- **Comportamento detalhado** de cada peça → `docs/contracts/*`.
- **Setup de infra** (Chatwoot, container, Supabase) → `docs/infra-topology.md`.
- O construtor implementa a partir dos contratos. Quanto mais apertado o contrato,
  menos importa quem constrói.

---

## 1. Estrutura em camadas

```
Sparkle (a empresa)
│
├─ Mauro + Lyra ───────────────────────────────── topo
│
├─ FÁBRICA (constrói e opera)
│   Lyra = padrão Trillion ⊕ substrato Hermes (single-user, MIT, self-hosted)
│   └─ workforce: dev / pesquisa / designer = sub-agentes do Hermes
│        ↕ liga no mundo abaixo via ── MCP server + plugin hooks (read-first) ──
│
├─ NÚCLEOS (tipos de produto)
│   • Zenya (atendimento)   • AEO/conteúdo   • tráfego pago   • ...
│
└─ INSTÂNCIAS (1 por cliente, ISOLADAS — "casas")
    Zenya #1 (Thaína) · #2 (Fun) · #3 (Plaka) · #4 (Gustavo) · ...
```

- **Núcleo** = um tipo de pequeno sistema (Zenya, AEO, tráfego…).
- **Instância** = um deploy de um núcleo para um cliente. Isolada.
- **Fábrica** = Lyra + workforce que ergue e mantém instâncias de qualquer núcleo.

---

## 2. Fronteiras inegociáveis

| # | Fronteira | Por quê |
|---|---|---|
| F1 | **Fábrica ≠ Cliente.** Auto-melhoria/autonomia do Hermes roda só na fábrica. O núcleo Zenya é **determinístico, governado, observável**; mudança nele passa pelo loop disciplinado. | Agente que se auto-modifica em cima de cliente vivo = violação de invariante. |
| F2 | **Hermes é single-user.** Lyra = UMA instância Hermes, só na fábrica. **NUNCA** rodar a Zenya sobre Hermes. | A própria doc do Hermes diz: não é multi-tenant. |
| F3 | **Instância-por-cliente.** Código único, deploy/conexão por cliente. Apaga = some, zero influência nos outros. | Isola dado + constrói uma vez. Corrige o multi-tenant que cresceu errado no code. |
| F4 | **Observabilidade no cérebro desde o dia 1** (model-call-recorder). | Foi a cegueira (zero telemetria de LLM) que causou o firefighting. |
| F5 | **Painel = ESSE** (Claude Design), portado **verbatim**. Design muda no Claude Design; dados em camada separada; sync via DesignSync. | Reconstruir "inspirado" é o que deixou o painel "todo cagado" antes. |
| F6 | **Contrato é lei.** O builder é descartável; o contrato dura. | Permite Codex hoje, workforce Hermes amanhã, sem redesenho. |

---

## 3. Núcleo Zenya — o "pequeno sistema"

A Zenya **não é uma agente sozinha**: é uma **voz coordenadora + ferramentas-serviço
discretas**, cada uma com contrato e telemetria — assim dá pra apontar **de onde vem o
problema** quando algo quebra.

**Três planos:**

```
Cliente final ─WhatsApp(Z-API/Baileys/Cloud, por tenant)→ CHATWOOT fork (mensageria)
                                                              │ webhook
                                                              ▼
                                  CÉREBRO (código próprio, novo, isolado, observável)
                                    ├ ingress + debounce/dedup/interrupção  (neutro de canal)
                                    ├ conversation-turn (loop) + tools/subagentes
                                    ├ delivery-layer → chama API do Chatwoot
                                    └ ★ observabilidade (model-call-recorder)
                                          │
   PAINEL (Claude Design glass) ◄────────┴──── Supabase (resumo IA, lead, config, agenda)
```

- **Mensageria = Chatwoot fork** (fazer.ai, OSS, self-hosted, multi-account, multi-provider).
  Fornece presença (visto/digitando/gravando), inbox, handoff e a etiqueta **"Agente Off"**.
- **Cérebro = código próprio** (a parte nova que se constrói). Channel-agnostic (fala só com Chatwoot).
- **Superfície = Painel** (Claude Design) + **Supabase** (estado: resumo, categoria de lead, config, agenda).

**Subagentes / tools da Zenya** (cada um = contrato + telemetria):
agenda (Google Calendar) · pagamento (Asaas/Ultracash) · e-commerce (Nuvemshop/Loja Integrada) ·
drive · áudio (TTS/STT) · handoff. Uma capacidade pode ser **tool determinística** OU **subagente**, atrás do mesmo contrato.

---

## 4. As 3 costuras MCP (o que torna tudo forward-compatible)

Memória do Hermes, read-first do Trillion, provisionamento da Lyra **e o login do painel**
dependem das **mesmas três**, expostas como **MCP server**:

1. **Leitura / observabilidade** — telemetria + conversas + estado de negócio.
2. **Escrita governada de config** — = o Hermes configurador = "Configurar com Zenya" do painel.
3. **Provisionamento** — criar/apagar instância = **registro da frota**.

Read-first cravado via **plugin hooks** do Hermes. O login do painel usa o **mesmo registro
da frota** (login → casa). Se as três existem, a Lyra pluga depois **sem redesenho**.

---

## 5. Primitiva "Agente Off" (unifica 4 coisas)

A etiqueta já existente no Chatwoot é, ao mesmo tempo:
**pausa do bot** + **status (aguardando/atendendo)** + **fonte do filtro do painel** + **handoff**.

| Ação | Etiqueta | Efeito |
|---|---|---|
| Zenya escala **ou** humano "Assumir" | liga "Agente Off" | bot para nessa conversa |
| Humano "Devolver para a Zenya" | tira "Agente Off" | bot volta |
| Cliente aperta o filtro | mostra só com "Agente Off" | vê só o que precisa dele |

Estados do painel (derivados, sem campo novo): sem etiqueta → *Zenya respondendo*;
"Agente Off" sem atribuído → *Aguardando*; "Agente Off" com atribuído → *Atendendo*.
**Não renomear a etiqueta interna** (é load-bearing no runtime); nome bonito é só no painel.

---

## 6. Canal — config por tenant

Decisão de canal vive no **Chatwoot** (config do inbox), **não no código**.
**Z-API default**, **Baileys** no tier barato, **Cloud API** onde reduz custo (ex.: Prime).
O cérebro é channel-agnostic.

---

## 7. Decisões travadas

| Tema | Decisão |
|---|---|
| Tenancy | Instância-por-cliente; código único deployado/conectado por cliente. |
| Mensageria | Chatwoot fork (OSS self-hosted) = órgão de mensageria. Não rebuildar. |
| Canal | Per-tenant no Chatwoot. Z-API default / Baileys barato / Cloud onde compensa. |
| Observabilidade | No cérebro, dia 1 (`model-call-recorder`, da story-033 do doador). |
| Painel | ESSE (Claude Design), verbatim, dados em camada separada, sync DesignSync. Um link, Magic Link, casa isolada por login. Vira a área de trabalho do cliente (substitui WhatsApp Web). |
| Lyra | Padrão Trillion sobre substrato Hermes (single-user, só fábrica). Integra via MCP + plugin hooks. |
| Humanização | Extraída do n8n v3 (provado). Ver §11 e `contracts/delivery-layer.md`. |

---

## 8. Ordem de build + mapa de contratos

**Núcleo → Painel → Hermes/config → Lyra.** Dentro do núcleo: **delivery-layer primeiro**.

`docs/contracts/`:
- `delivery-layer.md` — humanização: ritmo/quebra/debounce/interrupção/presença.
- `conversation-turn.md` — loop do agente + quais subagentes/tools.
- `agenda.md` — mecânica Google Calendar + contrato da aba Agenda.
- `handoff.md` — a primitiva "Agente Off".
- `observability.md` — model-call-recorder.
- `painel-data.md` — 3 fontes + as 8 armadilhas.

---

## 9. Doador (a "zerada") — colher, depois desativar

Em `/srv/zenya/repo` (GitHub: `sparkleai-tech/zenya`, HEAD pushed em 2026-06-16).
**É doador de peças, não a base** (ficou atrás da produção e perdeu a humanização).

**Colher:**
- `packages/database` → o **recorder/observabilidade** (story-033, INV-18) — o ouro.
- `docs/contracts` → **cross-check** dos nossos contratos (opcional).
- `tests/golden` → **harness**, em uso **leve** (check de fidelidade, não re-derivação pesada).

> A humanização NÃO se re-deriva de 16k mensagens. Vem de **portar o mecanismo provado do
> n8n** (§11). Fidelidade é estrutural, não estatística — só mantemos um check leve.

**Serviços vivos na zerada** (⚠️ não wipar cego):
- `zenya-evolution` (Evolution API) — número da **Zenya Prime, idle** (não é cliente pagante).
- `zenya-postgres` (postgres:16).

**Sequência segura:** (1) colher → (2) build limpo **ao lado** → (3) desativar deliberado,
com push manual de confirmação antes. **Nunca wipe-first.**

---

## 10. Ambiente

- **VPS:** `srv1743215` (a nova). Acesso via **cowork-bridge** (user `mauro`, com sudo).
- **Build limpo:** `/srv/zenya-build` — ao lado da zerada, sem tocá-la.
- **Banco:** **Supabase dedicado novo** (não reusar o de produção, nem o postgres local da zerada).
- **Dev/staging:** **Supabase branching** + container de staging na mesma VPS (não 2ª VPS).
  Mudança de config/prompt testa no **tenant demo**; mudança de código/schema testa em staging.

---

## 11. Humanização (resumo — detalhe em `contracts/delivery-layer.md`)

Extraída dos fluxos n8n Secretária v3 (`01`, `07`, `07.1`):
- **Ritmo de digitação:** `tempo = min((chars/4.5)/150*60, CAP)`; CAP 25s texto / 15s Z-API / 12s áudio. Gap 1s entre mensagens.
- **Quebra:** sub-agente LLM, ≤5 partes, nunca quebra listas, tira pontuação final.
- **Debounce + interrupção:** app-level (fila + guard por `id_mensagem` — "mensagem encavalada → para"). Neutro de canal.
- **Presença:** via API do Chatwoot (`update_last_seen`, `toggle_typing_status`, reações).

---

## 12. Pendências (adiadas de propósito)

- Roteamento do diretório central (login → casa) — leaning **Opção A** (um painel compartilhado).
- Compose livre vs travado no "Assumir" — alinhar no **Claude Design** (painel = workspace).
- Painel: dado **ao vivo do Chatwoot** vs **projetado no Supabase**.
- **Backup automático da zerada:** o cron diário **não está no crontab do `mauro`** — confirmar (root? systemd?) antes de confiar.
- Verificar capacidades exatas de presença Cloud API vs Z-API (quando ligar inbox por tenant).
- A prod já roda o fork fazer.ai? (confirmaria convergência, não divergência.)

---

*Estrela-guia v1 — Aria, 2026-06-23. Próximo artefato: `docs/contracts/delivery-layer.md`.*
