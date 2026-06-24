# S1 Infra Bring-Up

Este runbook executa a S1 de forma isolada em `/srv/zenya-build`.

## Gates humanos

Peça aprovação do Mauro antes de:

- criar o projeto Supabase Cloud `zenya-build`
- expor porta pública ou configurar DNS
- conectar número real de WhatsApp
- executar qualquer comando que toque `/srv/zenya` ou containers da zerada

## Artefatos criados

- `infra/docker-compose.yml`: stack isolada com brain, Postgres/Redis do Chatwoot e perfil `chatwoot`
- `apps/brain`: esqueleto HTTP do cérebro, com `/health` e webhook Chatwoot stub
- `.env.example` e `.env.chatwoot.example`: variáveis esperadas
- `scripts/smoke-s1.mjs`: smoke local sem recursos externos

## Execução segura sem gates

```bash
cd /srv/zenya-build
npm run check
```

Esse smoke não cria Supabase, não expõe portas públicas e não toca a zerada.

## Bring-up real após aprovação

1. Confirmar portas livres:

   ```bash
   ss -tlnp | grep -E ':(3001|3101|5433|6380)\b' || true
   ```

2. Clonar o fork do Chatwoot no caminho ignorado pelo Git:

   ```bash
   git clone https://github.com/fazer-ai/chatwoot.git /srv/zenya-build/chatwoot
   ```

3. Copiar templates e preencher segredos:

   ```bash
   cp .env.example .env
   cp .env.chatwoot.example .env.chatwoot
   ```

4. Subir primeiro o brain e dependências locais:

   ```bash
   docker compose -f infra/docker-compose.yml up -d brain chatwoot-postgres chatwoot-redis
   curl -fsS http://127.0.0.1:3101/health
   ```

5. Com o fork do Chatwoot clonado e `.env.chatwoot` preenchido, subir o perfil Chatwoot:

   ```bash
   docker compose -f infra/docker-compose.yml --profile chatwoot up -d
   ```

6. Criar Supabase Cloud `zenya-build` e preencher `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`.

7. Configurar no Chatwoot o webhook interno do brain:

   ```text
   http://brain:3101/webhooks/chatwoot
   ```

## Critério de smoke S1

- `GET /health` do brain retorna `ok=true`
- `POST /webhooks/chatwoot` aceita evento stub
- Chatwoot real e Supabase Cloud ficam bloqueados por gate até aprovação explícita
