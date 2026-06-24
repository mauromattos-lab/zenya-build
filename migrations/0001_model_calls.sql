-- 0001_model_calls — observabilidade (INV-18). Sem conteúdo de mensagem; só metadados.
create table if not exists public.model_calls (
  id          bigint generated always as identity primary key,
  tenant      text not null,
  papel       text not null,                 -- main | curador | chunker | ...
  modelo      text not null,
  tokens_in   integer,
  tokens_out  integer,
  custo       numeric(12,6),
  latencia_ms integer,
  sucesso     boolean not null default true,
  erro        text,
  finding     text,                          -- turn.empty_reply | entrega.interrompida | gateway.failure | null
  conversa_id text,
  criado_em   timestamptz not null default now()
);
create index if not exists idx_model_calls_tenant_time on public.model_calls (tenant, criado_em desc);
alter table public.model_calls enable row level security;  -- só service_role (server-side) acessa
comment on table public.model_calls is 'Telemetria de chamadas LLM (INV-18). Sem conteudo de mensagem.';
