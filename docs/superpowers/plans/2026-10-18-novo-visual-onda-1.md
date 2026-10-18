# Novo visual — Onda 1 (tema da marca) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar o tema da marca (verde SIM + espectro Alpargatas) a todas as telas do site trocando só as peças
compartilhadas: tokens de cor, fonte, componentes de `ui.tsx`/`Campos.tsx` e o `Shell`.

**Architecture:** As 33 telas já desenham com tokens CSS (`globals.css`) e componentes compartilhados; a onda muda os
valores dos tokens (mesmos nomes), acrescenta poucos tokens novos (ação, menu, selos) e ajusta 3 arquivos de
componentes. Nenhuma página, cálculo, rota ou permissão muda. Um teste de contraste lê o `globals.css` e trava os
pares de cor do spec.

**Tech Stack:** Next.js 16, React 19, Tailwind 4 (`@theme`, `@utility`), vitest (ambiente node), `next/font/google`.

**Spec:** `docs/superpowers/specs/2026-10-18-novo-visual-design.md` (seção "Onda 1"). Prévia:
https://claude.ai/artifact/EuX5scabBMC8d2VRSBarZz

## Global Constraints

- Cores só das logos; valores exatos da tabela "Cores" do spec (claro e escuro).
- Texto ≥ 4,5:1 sobre o fundo em que aparece (≥ 3:1 em ≥ 24 px); foco do teclado: contorno 3 px `#6CCCF0`.
- Alvos de toque ≥ 44 px no celular; status sempre com texto, nunca só cor.
- Tokens existentes mantêm o nome (`--fundo`, `--superficie*`, `--borda*`, `--texto*`, `--tinta*`, `--st-*`,
  `--serie-*`, `--seq-*`, `--grade`, `--eixo`); só mudam valores. `--serie-*`/`--seq-*` não mudam.
- Fonte do texto IBM Plex Sans 400/500/600; títulos Space Grotesk; corpo 15 px, mínimo 12 px.
- Sem dados da empresa em testes ou capturas versionadas. Respostas e textos de tela em pt-BR.
- Antes de publicar: `cd web && npx tsc --noEmit && npx vitest run && npx next build`.

## Review Focus

- Tema escuro: os mesmos pares de contraste valem no `[data-tema=escuro]` e no `prefers-color-scheme: dark` — testado
  na Task 1 para os dois blocos.
- Menu recolhido (72 px) e gaveta do celular: logo e item ativo legíveis no verde-escuro — conferido na Task 5.
- Impressão: `.nao-imprimir` continua escondendo menu e faixa; página impressa sem fundo verde — Task 5.
- Títulos longos com a fonte nova quebrando no celular (375 px) sem estourar a largura — Task 5.
- Gráficos (`graficos.tsx`) continuam legíveis sobre o fundo novo `#F4F6F4` (grade/eixo) — Task 5 nas telas Painel,
  Confiabilidade, Custos e Programação semanal.

---

### Task 1: Tokens de cor da marca + teste de contraste

**Files:**
- Modify: `web/app/globals.css` (bloco `:root`, os dois blocos escuros, comentário do topo, `.tom2`, `::selection`)
- Test: `web/testes/tema.test.ts` (novo)

**Interfaces:**
- Produces (CSS custom properties, claro / escuro):
  - valores novos em nomes antigos: `--fundo` `#F4F6F4`/`#0B110D`, `--superficie` `#FFFFFF`/`#121A15`,
    `--superficie-2` `#F1F4F2`/`#18221C`, `--superficie-3` `#E9EEEA`/`#1E2A23`, `--borda` `#E2E7E3`/`#24302A`,
    `--borda-forte` `#C9D2CC`/`#33423A`, `--texto` `#111311`/`#F1F5F2`, `--texto-2` `#45494B`/`#B8C4BD`,
    `--texto-3` `#6D6E71`/`#8D9A92`, `--tinta` `#007A38`/`#22B068`, `--tinta-texto` `#FFFFFF`/`#06140B`,
    `--grade` `#E2E7E3`/`#24302A`.
  - tokens novos: `--acao` (= `--tinta`, links e destaque de título), `--acao-forte` (`#00682F`/`#4CC487`, hover),
    `--menu` `#06331F`/`#072A18`, `--menu-2` `#0B4A2C`/`#0E3D24`, `--menu-texto` `#E8F3EC`, `--menu-apoio` `#A9D3B9`,
    `--menu-marcador` `#A8C024`, `--foco` `#6CCCF0`,
    `--selo-{bom,atencao,serio,critico,info,neutro}-fundo` e `-texto` (valores do spec; neutro `#ECEEED`/`#45494B`,
    escuro conforme a prévia).
  - utilitários `@utility`: `bg-menu`, `bg-menu-2`, `text-menu-texto`, `text-menu-apoio`, `text-acao`, `bg-acao`.
  - `.tom2` passa a `color: var(--acao)`; regra global `:focus-visible { outline: 3px solid var(--foco); outline-offset: 2px }`.
  - tabelas (o site tem 8 componentes de tabela; uma regra global cobre todos, em `@layer base` para as classes de
    cada componente continuarem valendo): `main table thead th { font-size: 11.5px; text-transform: uppercase;
    letter-spacing: .04em; color: var(--texto-3); font-weight: 600 }` e
    `main table tbody tr:hover { background: var(--superficie-2) }`.

- [ ] **Step 1: Write the failing test** `web/testes/tema.test.ts`

Lê `app/globals.css` com `fs`, extrai as variáveis de cada bloco (`:root`, `:root[data-tema="escuro"]`, o
`@media (prefers-color-scheme: dark)`) e calcula o contraste WCAG (luminância relativa sRGB). Casos:

```ts
it("texto principal e de apoio ≥ 4,5:1 sobre fundo, superfície e superfície-2 (claro e escuro)")
  // pares: [--texto, --texto-2, --texto-3] × [--fundo, --superficie, --superficie-2] → ≥ 4.5
it("botão principal: --tinta-texto sobre --tinta ≥ 4,5:1")
it("menu: --menu-texto e --menu-apoio sobre --menu e --menu-2 ≥ 4,5:1")
it("cada selo: -texto sobre -fundo ≥ 4,5:1")            // bom, atencao, serio, critico, info, neutro
it("botão principal deixou de ser preto")               // expect(claro["--tinta"].toLowerCase()).toBe("#007a38")
it("os dois blocos escuros têm os mesmos valores")       // prefers-color-scheme e data-tema=escuro iguais
```

- [ ] **Step 2: Run** `cd web && npx vitest run testes/tema.test.ts` — Expected: FAIL (tokens novos ausentes; `--tinta` preto).
- [ ] **Step 3: Edit `globals.css`** com os valores acima (mantendo `@theme`, `--serie-*`, `--seq-*`, `--st-*`).
- [ ] **Step 4: Run** `npx vitest run testes/tema.test.ts` — Expected: PASS. Se um par do spec ficar < 4,5, escurecer o
  texto (nunca clarear o fundo) e anotar o valor ajustado no commit.
- [ ] **Step 5: Commit** `git add web/app/globals.css web/testes/tema.test.ts && git commit -m "Tema da marca: tokens de cor + teste de contraste"`

### Task 2: Fonte IBM Plex Sans e cor do navegador

**Files:**
- Modify: `web/app/layout.tsx`

**Interfaces:**
- Consumes: `--fonte-texto` (já usado por `--font-sans` em `globals.css`).
- Produces: `--fonte-texto` = IBM Plex Sans; `themeColor` claro `#06331F`, escuro `#072A18`.

- [ ] **Step 1:** Trocar `Inter` por `IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--fonte-texto", display: "swap" })`.
- [ ] **Step 2:** `viewport.themeColor`: claro `#06331F`, escuro `#072A18` (barra do navegador no celular combinando com o menu).
- [ ] **Step 3: Run** `npx tsc --noEmit` — Expected: sem saída.
- [ ] **Step 4: Commit** `git commit -am "Tema da marca: fonte IBM Plex Sans"`

### Task 3: Componentes compartilhados (`ui.tsx`, `Campos.tsx`)

**Files:**
- Modify: `web/components/ui.tsx`, `web/components/Campos.tsx`
- Test: `web/testes/ui-tema.test.ts` (novo; `renderToStaticMarkup` de `react-dom/server`)

**Interfaces:**
- Consumes: tokens da Task 1.
- Produces (assinaturas inalteradas — nenhuma página muda):
  - `BOTAO_PRIMARIO`: `bg-tinta text-tinta-texto hover:bg-[var(--acao-forte)]`, altura `h-11` (44 px).
  - `BOTAO_SECUNDARIO`: borda `border-borda-forte`, fundo `bg-superficie`.
  - `BOTAO_PERIGO` (novo export): fundo `#B5121B`, texto branco, `h-11`.
  - `Pilula` → sobretítulo: texto em caixa alta 12 px, `text-acao`, sem borda (mesma assinatura).
  - `Titulo`: `destaque` em `var(--acao)` via `.tom2`; pesos `font-semibold`.
  - `IconeQuadro`: quadrado com fundo da cor do tom a 12% (`color-mix`) e ícone na cor do tom escurecida para
    contraste (mapa `TOM_TEXTO`: verde `#00632D`, azul `#005799`, ciano `#005E84`, lima `#4D5A0A`, amarelo `#7A5600`,
    laranja `#9A4705`, vermelho `#A4111A`, celeste `#005E84`); sem borda.
  - `Kpi`: fundo `bg-superficie`, borda `border-borda`, raio 16 px.
  - `Selo`: cores pelos tokens `--selo-*` — mapa `verde→bom`, `amarelo→atencao`, `laranja→serio`,
    `vermelho→critico`, `azul|ciano→info`, `cinza→neutro`; formato pílula (`rounded-full`, `px-2.5`, 12 px, semibold).
  - `ENTRADA` (Campos): borda `border-borda-forte`, fundo `bg-superficie`, foco `border-[var(--acao)]`; `Campo`/`Seletor`
    rótulo `text-texto` semibold 13 px.

- [ ] **Step 1: Write the failing test** `web/testes/ui-tema.test.ts`

```ts
it("Selo usa os tokens de status, com texto")  // renderToStaticMarkup(<Selo cor="vermelho">Crítico</Selo>) contém "var(--selo-critico-texto)" e "Crítico"
it("Selo cinza usa o neutro")                    // contém "var(--selo-neutro-fundo)"
it("botão principal usa a cor de ação e 44 px")  // BOTAO_PRIMARIO contém "bg-tinta" e "h-11"; não contém "bg-marca-500"
it("BOTAO_PERIGO existe com 44 px")              // contém "h-11"
it("IconeQuadro com tom tem fundo tingido")      // markup contém "color-mix" e "#a4111a" para tom="vermelho" (case-insensitive)
```

- [ ] **Step 2: Run** `npx vitest run testes/ui-tema.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** as mudanças da lista Produces.
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit` — Expected: todos PASS, tsc sem saída.
- [ ] **Step 5: Commit** `git add web/components/ui.tsx web/components/Campos.tsx web/testes/ui-tema.test.ts && git commit -m "Tema da marca: botões, selos, indicadores e campos"`

### Task 4: Menu e topo (`Shell.tsx`, `Marca.tsx`) + faixa da marca

**Files:**
- Modify: `web/components/Shell.tsx`, `web/components/Marca.tsx`
- Modify: `web/components/ui.tsx` (export `FaixaMarca`)
- Test: `web/testes/ui-tema.test.ts` (acrescenta casos)

**Interfaces:**
- Consumes: tokens `--menu*`, `--acao`, `--foco` (Task 1).
- Produces: `export function FaixaMarca({ altura }: { altura?: number }): JSX.Element` — 7 faixas na ordem vermelho
  `#E41824`, laranja `#F07818`, amarelo `#FCB40C`, lima `#A8C024`, verde `#009C48`, ciano `#009CD8`, azul `#006CB4`;
  `aria-hidden`, classe `nao-imprimir`, altura padrão 5 px.
- `Marca`: logo SIM num selo branco (`bg-white rounded-[10px] p-1.5`) + "Central de Manutenção" (branco) e "PCM · F26"
  (`text-menu-apoio`); prop `compacta` mantém só o selo da logo.
- `Shell`:
  - computador: `aside` `bg-menu text-menu-texto` (sem `border-r`); rótulo de grupo caixa alta 11 px `text-menu-apoio`;
    item 44 px de altura (`min-h-11`), hover `bg-white/8`, ativo `bg-menu-2 font-semibold text-white` com marcador
    `shadow-[inset_3px_0_0_var(--menu-marcador)]` (no lugar da barrinha verde atual); botões do rodapé (tema,
    recolher, sair) `size-11` em `text-menu-texto`; cartão da pessoa `bg-menu-2`, iniciais em `bg-[var(--menu-marcador)]`
    texto `#11240F`.
  - conteúdo (`main`): `<FaixaMarca />` no topo, antes do aviso de demonstração.
  - celular: `header` `bg-menu text-white` (sem transparência), botões `size-11`; gaveta `bg-menu` com a mesma navegação.

- [ ] **Step 1: Write the failing test** (em `ui-tema.test.ts`)

```ts
it("FaixaMarca tem as 7 cores na ordem e é decorativa")  // markup contém as 7 cores na ordem do Produces, "aria-hidden" e "nao-imprimir"
```

- [ ] **Step 2: Run** `npx vitest run testes/ui-tema.test.ts` — Expected: FAIL (`FaixaMarca` não existe).
- [ ] **Step 3: Implement** `FaixaMarca`, `Marca` e `Shell` conforme Produces.
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit` — Expected: PASS, tsc sem saída.
- [ ] **Step 5: Commit** `git add web/components && git commit -m "Tema da marca: menu verde, logo e faixa Alpargatas"`

### Task 5: Verificação no navegador, revisão e publicação

**Files:** nenhum de produto (capturas só no scratchpad, nunca no repositório).

- [ ] **Step 1: Build** `cd web && npx next build` — Expected: "Compiled successfully".
- [ ] **Step 2: Navegador** — `npx next start` em modo demonstração (sem variáveis de dados); Playwright
  (`executablePath: /opt/pw-browsers/chromium`) captura, em 375 px e 1440 px, claro e escuro: Início, Estoque, Ordens,
  Painel, Confiabilidade, Custos, Programação semanal, Gestão de HH, Usuários e a tela de entrada. Conferir os 5 itens
  de Review Focus (menu recolhido, gaveta, impressão via `emulateMedia({ media: "print" })`, títulos a 375 px sem
  rolagem horizontal — `document.documentElement.scrollWidth <= innerWidth` —, gráficos legíveis).
- [ ] **Step 3: Corrigir** o que a Step 2 mostrar (cada correção com `npx vitest run && npx tsc --noEmit` antes do commit).
- [ ] **Step 4: Revisão do Opus** do diff da onda (CLAUDE.md); aplicar o que for erro real.
- [ ] **Step 5: Publicar** — commit, push no ramo de trabalho, PR para `main`, merge com `expectedHeadSha`, realinhar o
  ramo; conferir deploy de produção READY pelo conector da Vercel.
