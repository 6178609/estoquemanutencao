-- Cadastros do site (antes app/<nome>.json no repositório de dados): um documento JSON por cadastro.
create sequence public.cadastros_versao_seq;

create table public.cadastros (
  nome text primary key,
  conteudo jsonb not null,
  versao bigint not null default nextval('public.cadastros_versao_seq'),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

-- Cópia de segurança: a versão anterior de cada cadastro, uma por dia (60 dias).
create table public.cadastros_historico (
  nome text not null,
  dia date not null,
  conteudo jsonb not null,
  versao bigint not null,
  guardado_em timestamptz not null default now(),
  primary key (nome, dia)
);

alter table public.cadastros enable row level security;
alter table public.cadastros_historico enable row level security;
revoke all on public.cadastros, public.cadastros_historico from public, anon, authenticated;
revoke all on sequence public.cadastros_versao_seq from public, anon, authenticated;
grant all on public.cadastros, public.cadastros_historico to service_role;
grant usage, select on sequence public.cadastros_versao_seq to service_role;

create function public.guardar_historico() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into public.cadastros_historico (nome, dia, conteudo, versao)
  values (old.nome, hoje, old.conteudo, old.versao) on conflict (nome, dia) do nothing;
  if found then
    delete from public.cadastros_historico where nome = old.nome and dia < hoje - 60;
  end if;
  return new;
end $$;

create trigger cadastros_historico_trg before update on public.cadastros
for each row when (old.conteudo is distinct from new.conteudo) execute function public.guardar_historico();

-- Grava só se a versão ainda é a esperada (null = cadastro novo). Devolve a versão nova ou null (alguém gravou antes).
create function public.gravar_cadastro(p_nome text, p_conteudo jsonb, p_versao_esperada bigint, p_por text)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare v bigint;
begin
  if p_versao_esperada is null then
    insert into public.cadastros (nome, conteudo, atualizado_por)
    values (p_nome, p_conteudo, p_por) on conflict (nome) do nothing returning versao into v;
  else
    update public.cadastros
       set conteudo = p_conteudo, versao = nextval('public.cadastros_versao_seq'), atualizado_em = now(), atualizado_por = p_por
     where nome = p_nome and versao = p_versao_esperada
    returning versao into v;
  end if;
  return v;
end $$;

revoke execute on function public.gravar_cadastro(text, jsonb, bigint, text) from public, anon, authenticated;
revoke execute on function public.guardar_historico() from public, anon, authenticated;
grant execute on function public.gravar_cadastro(text, jsonb, bigint, text) to service_role;
