# Contrato: delivery-layer (humanização da entrega)

> Como o cérebro da Zenya entrega mensagens ao cliente de forma humana, via Chatwoot.
> **Spec de comportamento, neutra de implementação.** Fonte: fluxos n8n Secretária v3
> (`01`, `07`, `07.1`, provados em produção) + API do Chatwoot.
> O builder implementa daqui; os **critérios de aceite** no fim são a prova de que ficou
> certo — não gambiarra.

## Por que este contrato existe

A humanização foi **o que quebrou** quando a Zenya saiu do n8n pra código a 1ª vez. Aqui ela
é **portada do mecanismo provado**, não reinventada. Cumprido este contrato, a Zenya "parece
gente" igual ao n8n.

## Invariantes

- **Voz única:** as mensagens de uma conversa saem em ordem, de uma só "boca". Nunca duas entregas concorrentes na mesma conversa.
- **Nada entre a mensagem e o cérebro:** a entrega não altera o conteúdo — só fatia e ritma.
- **Ritmo e interrupção:** o cliente vê visto → digitando → mensagens em ritmo humano; mensagem nova no meio replaneja.

## Entrada

`resposta` (texto completo do cérebro) + `conversa` (id_conta, id_conversa, canal, contato) + `config` (do tenant).

## 1. Quebra (chunking)

Sub-agente LLM divide `resposta` em `mensagens[]`:
- **≤ 5 partes.** Nunca mais.
- Quebras naturais (pontuação/pausas), 1–4 frases por parte.
- **NUNCA quebra listas** (itens numerados/bullets ficam juntos numa parte).
- Remove pontuação final supérflua. Não reescreve conteúdo (só separa).

## 2. Entrega por parte (outbound)

Para cada parte, em ordem:
1. *(só na 1ª parte)* marcar como visto — Chatwoot `update_last_seen`.
2. digitando ON — Chatwoot `toggle_typing_status` (`on`; `recording` se áudio).
3. esperar `tempo_digitando`.
4. enviar a parte — Chatwoot `POST .../messages`.
5. gap de `gap_entre_partes` (default 1s).

**Fórmula do tempo de digitação:**
```
tempo_digitando = min( (chars / 4.5) / palavras_por_minuto * 60 , CAP )
```
- `palavras_por_minuto` = 150 (default, config). `4.5` = tamanho médio de palavra PT.
- `CAP` por canal: **texto 25s · Z-API 15s · áudio 12s**.
- **Z-API:** o tempo vai em `content_attributes.zapi_args.delayTyping` no próprio envio (não há toggle separado).

## 3. Interrupção / debounce (entrada)

- Toda mensagem do cliente entra numa **fila por contato** (ver `conversation-turn.md`).
- Antes de processar, espera a janela `debounce_ms` e **agrega o burst**.
- **Guarda:** se chegou mensagem mais nova durante o processamento (`id_mensagem` no topo da
  fila ≠ o que iniciou esta execução) → **aborta esta entrega** ("mensagem encavalada"). A
  execução mais nova entrega o burst completo.
- Efeito: áudio/texto novo no meio = a Zenya não dispara resposta órfã; ela se reorganiza.

## 4. Preferência áudio/texto

Por contato (`preferencia_audio_texto`): responde em áudio ou texto. Default: espelha o tipo
da última mensagem do cliente.

## 5. Parâmetros (config do tenant — nunca hardcode)

`palavras_por_minuto` (150) · `gap_entre_partes` (1s) · `cap_texto/cap_zapi/cap_audio` ·
`first_message_delay_s` · `debounce_ms`. Vêm do **config governado** (costura 2).

## 6. Observabilidade (liga em `observability.md`)

Cada entrega registra: conversa, nº de partes, tempo por parte, canal, sucesso/erro. Finding
`entrega.interrompida` quando a guarda aborta. **Sem conteúdo de mensagem no log** (privacidade)
— só metadados.

## Critérios de aceite (a prova de que ficou certo)

1. Texto de N chars → `tempo_digitando` = fórmula (±0.5s), respeitando o CAP do canal.
2. Quebra nunca passa de 5 partes; lista numerada nunca é dividida.
3. `update_last_seen` ocorre **antes** do 1º `digitando`.
4. Gap de 1s entre partes.
5. Mensagem nova no meio **cancela** a entrega em andamento — zero partes órfãs enviadas.
6. Toda entrega gera registro de telemetria (metadados, sem conteúdo).
7. Áudio usa `recording` + `delayTyping=12`.

## Fora de escopo (cross-ref)

- Conteúdo da resposta → `conversation-turn.md`.
- Canal concreto (Z-API/Baileys/Cloud) → config do inbox no Chatwoot.
- Onde a telemetria é gravada → `observability.md`.
- Handoff / "Agente Off" → `handoff.md`.

---
*delivery-layer v1 — Aria, 2026-06-23. Derivado de n8n Secretária v3 (01 / 07 / 07.1).*
