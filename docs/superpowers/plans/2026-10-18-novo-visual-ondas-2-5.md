# Novo visual — Ondas 2 a 5 + pendências da Onda 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Terminar o novo visual: pendências da Onda 1 (barra superior, Kpi com status, campos com erro, contraste),
Início reorganizado (Onda 2), Estoque (Onda 3), Ordens (Onda 4) e Pessoas (Onda 5) bons no celular e no computador.

**Architecture:** Tudo sobre o tema da Onda 1 (tokens em `globals.css`, componentes em `components/ui.tsx`,
`Campos.tsx`, `Shell.tsx`). Lógica nova só onde a tela precisa juntar dados (Início: função pura testada em
`lib/wcm/inicio.ts`); o resto reaproveita as funções de `lib/` já testadas. Cada grupo de tarefas sai num PR próprio.

**Tech Stack:** Next.js 16 (App Router, server components), React 19, Tailwind 4, vitest (node), Playwright para
conferência.

**Spec:** `docs/superpowers/specs/2026-10-18-novo-visual-design.md` (Ondas 1–5). Prévia (caminho B):
https://claude.ai/artifact/EuX5scabBMC8d2VRSBarZz

## Global Constraints

- Tokens e componentes da Onda 1; cores só das logos; nenhum hex novo fora de `globals.css` (exceto as 7 cores da
  `FaixaMarca`).
- Texto ≥ 4,5:1; status sempre com texto; foco global celeste (sem `outline-none`/`focus:ring` novos).
- Celular: alvos ≥ 44 px, ≥ 8 px entre eles, sem rolagem horizontal da página (só dentro de tabelas).
- Nenhuma regra de cálculo, rota, permissão (`podeVer`/`veInteira`) ou dado muda; telas só mostram o que a pessoa já
  pode ver.
- Testes só com dados fictícios. Textos em pt-BR.
- Antes de cada PR: `cd web && npx tsc --noEmit && npx vitest run && npx next build`.

## Review Focus

- Pessoa sem acesso a uma aba não vê o alerta/atalho/número dela no Início (Terceiro, Manutentor) — teste na Task 4.
- Modo demonstração e base faltando (sem IW38, sem MB52, sem cadastro de HH): Início não quebra, mostra "Tudo em dia" ou
  omite o bloco — teste na Task 4.
- Busca da barra superior com texto vazio ou acentos vai para `/busca?q=` corretamente — Task 3.
- Ordens no celular com 0 ordens no filtro e com ordem sem equipamento — Task 6.
- Estoque com o filtro rápido trocado enquanto há busca digitada mantém as duas condições — Task 5.

---

## PR A — pendências da Onda 1

### Task 1: Ajustes de tema e componentes pequenos

**Files:** `web/app/globals.css`, `web/app/layout.tsx`, `web/components/ui.tsx`, `web/components/Marca.tsx`,
`web/app/(app)/estoque/Almoxarifado.tsx`, `web/app/(app)/equipamentos/GestaoAtivos.tsx`,
`web/app/(app)/mro/PecasAtivo.tsx`, páginas com `outline-none`/`focus:ring` em campos; testes
`web/testes/tema.test.ts`, `web/testes/ui-tema.test.ts`.

**Interfaces — Produces:**
- `--texto-4` claro `#6B6D70`, escuro `#8D9A92` (≥ 4,5:1 sobre `--fundo`, `--superficie`, `--superficie-2`).
- `BOTAO_COMPACTO` (novo export em `ui.tsx`): mesmo visual do primário em `h-9 px-3 text-[13px]`, área de toque
  garantida por `min-h-9` + margem vertical do contexto; usado em `GestaoAtivos.tsx:219` e `PecasAtivo.tsx:112`.
- `Pilula` com `href`: `min-h-11 inline-flex items-center` (toque 44 px).
- `Marca`: selo da logo `size-10 p-1` (logo útil 32 px).
- `layout.tsx`: `themeColor` claro `#F4F6F4` (a página de entrada é clara; o celular logado tem cabeçalho verde próprio).
- Mensagem do mínimo em `Almoxarifado.tsx` (≈ linha 236) com `--selo-critico-*`/`--selo-bom-*`.
- `font-bold` em texto de corpo (não `font-display`) vira `font-semibold`; campos das páginas perdem
  `outline-none focus:ring-*` (foco = contorno global) mantendo `focus:border-[var(--acao)]`.

- [ ] Test: em `tema.test.ts`, `--texto-4` ≥ 4,5:1 sobre `--fundo`/`--superficie`/`--superficie-2` nos três blocos;
  em `ui-tema.test.ts`, `BOTAO_COMPACTO` contém `bg-tinta` e `h-9`; `Pilula` com href contém `min-h-11`.
- [ ] Run (FAIL) → implementar → Run (PASS) → `npx vitest run && npx tsc --noEmit` → commit.

### Task 2: Kpi com status e meta; campos com erro

**Files:** `web/components/ui.tsx`, `web/components/Campos.tsx`, `web/testes/ui-tema.test.ts`.

**Interfaces — Produces (opcionais, sem quebrar chamadas atuais):**
- `Kpi({ …, status?: { cor: CorSelo; texto: string }, meta?: string })` — linha abaixo do valor com `<Selo cor>texto</Selo>`
  e `meta` em `text-texto-3 text-[12.5px]`. `CorSelo` = o tipo de `cor` de `Selo` (exportar).
- `Campo`/`Seletor` aceitam `erro?: string`: borda `border-[var(--selo-critico-texto)]`, `aria-invalid="true"`,
  `aria-describedby` apontando para `<span id>` com o erro em `text-[var(--selo-critico-texto)] text-[12px] font-medium`
  logo abaixo do campo (a `dica` some quando há erro). `id` via `useId` só se o componente já for cliente; senão
  derivar do `name`/rótulo.
- Rolagem de tabela: regra global `main :where(table)` não resolve sozinha — garantir que os 8 componentes de tabela
  (`components/graficos.tsx` Tabela, `confiabilidade/_comum/TabelaDados`, `TabelaFicha`, `equipamentos/_ui/Blocos`
  TabelaT, `ordens/_comum/TabelaDados`, `planos/_comum/TabelaLonga`, `execucao/_ui/Tabela`, `TabelaSimples`) estejam
  dentro de um contêiner com `overflow-x-auto`; acrescentar onde faltar.

- [ ] Test: `Kpi` com `status` e `meta` renderiza o selo e a meta; sem eles, markup igual ao de hoje (sem a linha);
  `Campo` com `erro` tem `aria-invalid="true"` e o texto do erro.
- [ ] Run (FAIL) → implementar → Run (PASS) → suíte → commit.

### Task 3: Barra superior no computador e busca no celular (`Shell.tsx`)

**Files:** `web/components/Shell.tsx`, `web/app/(app)/layout.tsx` (passar o título do grupo de cada item, se faltar).

**Interfaces — Produces:**
- Computador (`lg:`): barra no topo do `main` (abaixo da `FaixaMarca`, acima do aviso de demonstração):
  à esquerda "Grupo › Aba" da rota ativa (`text-texto-3` › `text-texto font-medium`; Início = só "Início"); à direita um
  `<form action="/busca" method="get">` com `<input type="search" name="q" placeholder="Buscar ordem, equipamento ou material">`
  (rótulo acessível "Buscar", `h-11`, `max-w-[360px]`) e o botão de tema (sai do rodapé do menu no computador).
- Celular: cabeçalho verde ganha botão "Buscar" (`size-11`, ícone `Search`, link para `/busca`).
- Sem mudança de comportamento do menu (recolher, gaveta, prefetch).

- [ ] Verificação: `npx tsc --noEmit && npx vitest run`; conferência visual fica na Task 8.
- [ ] Commit.

**Publicar PR A** (Task 8 resumida: build, capturas de Painel/Ordens/entrar em 375 e 1440, revisão do Opus, PR,
merge, deploy READY).

---

## PR B — Onda 2: Início

### Task 4: Início reorganizado

**Files:** Create `web/lib/wcm/inicio.ts`, `web/testes/inicio.test.ts`; Modify `web/app/(app)/page.tsx`.

**Interfaces — Produces:**
- `alertasInicio(e: EntradaInicio): Alerta[]` em `lib/wcm/inicio.ts` (pura, sem I/O), com
  `EntradaInicio = { ordens?: { atrasadas: number; altaPrioridade: number } | null; estoque?: { abaixo: number; zerados: number } | null; reciclagens?: { vencendo: number; vencidas: number; titulos: string[] } | null }`
  e `Alerta = { id: "ordens" | "estoque" | "reciclagens"; nivel: "critico" | "serio" | "atencao"; numero: number; titulo: string; detalhe: string; href: string }`.
  Regras: só entra o que vier não-nulo e com número > 0; ordens atrasadas → `critico`, href `/ordens` (com o filtro de
  atrasadas se existir parâmetro de URL para isso; senão `/ordens`); estoque abaixo+zerados → `serio`, href
  `/estoque` (com o filtro "Abaixo do mínimo" se a tela aceitar parâmetro); reciclagens vencidas+vencendo (60 dias) →
  `atencao`, href `/treinamentos_ferias`. Ordem: critico, serio, atencao. Lista vazia = "Tudo em dia".
- `page.tsx` monta `EntradaInicio` só com o que `podeVer(u, aba)` permite (ordens/estoque/treinamentos_ferias), usando
  as funções já existentes (`almoxarifado()`, contexto WCM para backlog atrasado, `reciclagens` de
  `lib/wcm/treinamentos.ts` com o cadastro de HH); qualquer falha de base → `null` para aquele bloco (não quebra a página).
- Layout (prévia "B · Início"): sobretítulo com data; título "Bom dia/tarde/noite, <primeiro nome>. **Isto pede atenção agora.**";
  busca grande (`form` GET `/busca`, `h-12`); cartões de alerta (borda esquerda na cor do nível via sombra inset,
  ícone tingido, número grande, título, detalhe, link inteiro clicável `min-h-11`); "Suas abas" em cartões
  (grid `auto-fill minmax(180px,1fr)`, ícone + nome + grupo); quadro verde-escuro "A semana em números"
  (aderência, ordens concluídas, HH disponível, pessoas fora hoje) só com os números que a pessoa pode ver, e some se
  nenhum. O objeto mosaico e a faixa "Almoxarifado agora" saem (viram o alerta de estoque).

- [ ] Test `inicio.test.ts`: (1) tudo zero → `[]`; (2) ordem dos níveis critico, serio, atencao; (3) bloco `null`
  (sem acesso/sem base) não gera alerta; (4) detalhe de ordens cita a quantidade de alta prioridade; (5) detalhe de
  reciclagens cita até 2 títulos.
- [ ] Run (FAIL) → implementar `inicio.ts` → Run (PASS) → `page.tsx` → suíte + tsc → commit.

**Publicar PR B** (capturas do Início em 375/1440 claro/escuro, com perfil demonstração; revisão Opus; PR; merge; deploy).

---

## PR C — Onda 3: Estoque

### Task 5: Estoque no celular

**Files:** `web/app/(app)/estoque/Almoxarifado.tsx` (e `Catalogo.tsx` só se compartilhar a barra de busca).

**Interfaces — Produces:**
- Barra de busca + filtros rápidos fixa no topo no celular (`sticky top-[cabeçalho] z-20 bg-fundo`, sem cobrir o
  cabeçalho verde); filtros rápidos em pílulas de um toque com contagem: "Todos · N", "Abaixo do mínimo · N",
  "Zerados · N" (contagem sobre o resultado da busca atual), ligados ao mesmo estado `situacao` existente.
- Em cada linha: barra de cobertura `estoque ÷ mínimo` (0–100%, cor do selo da situação), só quando há mínimo.
- Computador: mesma lista atual, com as pílulas no lugar do controle de situação atual (mesma lógica).

- [ ] Test (se houver lógica nova extraída, ex.: `cobertura(estoque, minimo)` em `lib/dados/materiais.ts`): 0 mínimo →
  null; estoque ≥ mínimo → 100; zerado → 0.
- [ ] Suíte + tsc → commit. **Publicar PR C** (capturas Estoque 375/1440).

---

## PR D — Onda 4: Ordens

### Task 6: Ordens no celular

**Files:** `web/app/(app)/ordens/page.tsx`, `web/app/(app)/ordens/_comum/TabelaDados.tsx`,
`web/app/(app)/ordens/_comum/FiltrosLocais.tsx`.

**Interfaces — Produces:**
- Celular (`< md`): filtros locais dentro de uma gaveta aberta pelo botão "Filtros · N" (N = filtros ativos), usando
  `components/Gaveta.tsx`; linha-resumo do recorte ("Outubro · MEC · 42 ordens").
- `TabelaDados` no celular vira lista de cartões: campo de ordenação/equipamento em destaque, selo de prioridade,
  ordem · tipo, situação, atraso; o cartão inteiro é o link que já existe (`hrefLinha`) e abre o detalhe atual
  (gaveta com operações e histórico). Computador: tabela atual.
- 0 ordens: mensagem `vazio` atual nos dois formatos.
- Ruling registrado: "abrir no próprio cartão" do spec = abrir o detalhe existente (gaveta), sem duplicar a tela de
  operações.

- [ ] Suíte + tsc → commit. **Publicar PR D** (capturas Ordens 375/1440 + gaveta de filtros).

---

## PR E — Onda 5: Pessoas

### Task 7: Gestão de HH e Treinamentos e férias no celular

**Files:** `web/app/(app)/gestao_hh/GestaoHh.tsx`, `EquipeCadastro.tsx`, `FormAusencia.tsx`,
`web/app/(app)/treinamentos_ferias/page.tsx`.

**Interfaces — Produces:**
- Listas (pessoas, ausências, reciclagens) no celular como cartões (nome, especialidade/centro, selo de situação,
  datas); tabelas continuam no computador.
- Formulários em uma coluna no celular, campos `h-11`, `inputMode="decimal"` em carga horária/HH,
  botão principal fixo embaixo no celular (`sticky bottom-0` com fundo `bg-superficie` e borda superior).
- Mensagens de erro de validação junto do campo com o `erro` da Task 2 quando a ação devolver o campo.

- [ ] Suíte + tsc → commit. **Publicar PR E** (capturas HH e Treinamentos 375/1440).

---

### Task 8 (a cada PR): verificação e publicação

- Build; capturas Playwright (modo demonstração, `executablePath: /opt/pw-browsers/chromium`) das telas do PR em 375 e
  1440, claro e escuro, checando `scrollWidth <= innerWidth` e console sem erro; revisão do Opus do diff do PR com as
  capturas; uma rodada de correções se houver Important; PR → CI verde → merge → realinhar ramo → deploy READY (Vercel).
