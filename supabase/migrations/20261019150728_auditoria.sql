create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  quem text not null,
  acao text not null,
  alvo text not null default '',
  detalhe jsonb not null default '{}'::jsonb,
  constraint auditoria_tamanhos check (char_length(quem) <= 80 and char_length(acao) <= 60 and char_length(alvo) <= 200)
);
comment on table public.auditoria is 'Trilha de auditoria da Central de Manutencao: quem fez o que e quando. So a chave secreta acessa (RLS ligado, sem politicas). Retencao: 12 meses.';
create index if not exists auditoria_em_idx on public.auditoria (em desc);
create index if not exists auditoria_quem_em_idx on public.auditoria (quem, em desc);
alter table public.auditoria enable row level security;
revoke all on table public.auditoria from anon, authenticated;
