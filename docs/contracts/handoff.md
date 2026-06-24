# Contrato: handoff (a primitiva "Agente Off")

> Como o atendimento passa pra humano e volta. Fonte: n8n `05`/`05.1` + a etiqueta de
> produção. Spec de comportamento.

## A primitiva

A etiqueta **"Agente Off"** no Chatwoot é o **interruptor único**: ligada = o bot **não
responde** aquela conversa; desligada = o bot volta.

| Gatilho | Ação | Efeito |
|---|---|---|
| Zenya escala (tentativas > `encaminharHumanoApos`, pedido explícito de humano, ou guardrail) | **liga** "Agente Off" + alerta | bot para; conversa entra em *aguardando* |
| Humano clica **Assumir** no painel | **liga** "Agente Off" + atribui a si | bot para; conversa em *atendendo* |
| Humano clica **Devolver** | **tira** "Agente Off" + desatribui | bot volta |

## INV-05 — não confundir pedido com assunção

Ligar "Agente Off" porque a **Zenya pediu** humano **≠** um **humano assumiu**. São duas
coisas distintas: a **etiqueta** (bot off) e o **atribuído** (quem pegou, se alguém). Se
confundir, o lead congela ("Agente Off" sem ninguém atendendo e o bot calado).

## Estados derivados (sem campo novo)

- sem etiqueta → **Zenya respondendo**
- "Agente Off" + sem atribuído → **Aguardando** (precisa de humano)
- "Agente Off" + com atribuído → **Atendendo**

Filtro do painel = conversas **com** "Agente Off". (Ver `painel-data.md`.)

## Alerta de escalação (n8n `05.1`)

Ao ligar "Agente Off" por escalação, notificar o(s) humano(s) responsável(is)
(`admin_phones` / multi-alerta).

## Critérios de aceite

1. "Agente Off" ligada → o cérebro **não** envia nenhuma resposta naquela conversa.
2. "Agente Off" desligada → o cérebro volta a responder.
3. Escalação da Zenya liga a etiqueta **sem** atribuir (fica *aguardando*) e dispara alerta.
4. "Assumir" liga a etiqueta **e** atribui (fica *atendendo*).
5. Nunca há bot + humano respondendo a mesma conversa ao mesmo tempo.
6. A etiqueta interna **não** é renomeada (nomes amigáveis só no painel).

---
*handoff v1 — Aria, 2026-06-23.*
