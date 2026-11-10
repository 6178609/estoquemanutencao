# Programação de paradas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Use superpowers:test-driven-development em cada tarefa (teste primeiro, ver falhar, implementar, ver passar).

**Goal:** Aba "Programação de paradas" (grupo Planejamento) que lê IP19/IW38/IW38OP/IH08 das bases do site, completa
o HH, agrupa ativos e roda um motor de regras puro para programar paradas por dia e turno (GAL1, Componentes), com as
visões e conferências da planilha do planejador, edição com alertas na hora e exportação IW32.

**Architecture:** Lógica pura em `web/lib/paradas/` (sem `server-only` exceto `dados.ts`), testada em
`web/testes/paradas-*.test.ts`; leitura das bases e do cadastro em `lib/paradas/dados.ts` (servidor); página em
`web/app/(app)/programacao_paradas/` (servidor + componentes cliente); gravações por ações de servidor no cadastro
`programacao_paradas.json`.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Tailwind 4, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-programacao-paradas-design.md` (as referências §x são dela).

## Global Constraints

- pt-BR em todo texto de tela e mensagem; cores só pelos tokens do site (`--marca-*`, `--serie-*`, `--st-*`, `--seq-*`).
- **Nenhum dado da empresa** no código, testes ou commits: só regras e nomes de grupos de máquinas (§0). Testes com
  dados fictícios (equipamentos "EQ-1", campos "C-100", ordens "9000001", denominações tipo "INJETORA EXP 21 TESTE").
  Nunca nomes de pessoas, números reais de ordem/campo/equipamento, HH reais. **Não ler `/tmp/plan` durante a implementação.**
- `lib/paradas/*.ts` (fora `dados.ts`) não importa `server-only`, `next/*` nem nada com I/O — roda no cliente também.
- Datas sempre `Dia` (`lib/wcm/util.ts`); semana = `semanaIso` (`lib/wcm/planos.ts`); nunca `new Date()` no motor.
- Ler `web/AGENTS.md` e a doc do Next em `node_modules/next/dist/docs/` antes de criar página/ação.
- Antes de cada publicação (fim de cada parte): `cd web && npx tsc --noEmit && npx vitest run && npx eslint . && npx next build`
  e `npx playwright test` quando houver tela (Playwright local: `PW_CHROMIUM=$(ls /opt/pw-browsers/chromium-1194/chrome-linux*/chrome | head -1)`).
- Cada parte é publicável sozinha (commit → push → PR → merge → conferir deploy READY na Vercel), conforme CLAUDE.md.
- Mobile: página sem rolagem horizontal em 390 px (tabelas largas dentro de contêiner com rolagem própria).
- Não usar `pkill -f`; servidor só pelo PID.

## Review Focus

1. Determinismo do motor: mesma entrada → mesmas linhas (teste rodando duas vezes e comparando com `toEqual`).
2. Nenhum item em duas linhas; Σ demandas = Σ linhas + Σ sem HH + Σ retirados (C5/C6) — teste de propriedade com
   entradas fictícias variadas.
3. Semana ISO atravessando o mês (prensa da última semana de um mês x 1ª semana do seguinte) — teste na Task 8.
4. Estouro ≤ 4 h só quando MEC ≤ 4 **e** ELE ≤ 4; 2ª parada nunca na mesma semana — testes na Task 10.
5. DRY BLEND sozinha no T1; T2 do mesmo dia aceita não crítico; saldo p/ backlog sem o T1 desse dia — Tasks 8 e 13.
6. Fixações: parada movida leva exatamente os itens da passada A; fixação órfã reportada — Task 12.
7. Leitura tolerante: base sem coluna de localização/unidade usa IH08 e o padrão `MIN` — Task 3.
8. Segurança: grep no diff por números de 8 dígitos, "@", nomes próprios antes de cada commit.

---

# PARTE 1 — Dados + motor de regras + 11 conferências (publicável: aba com Programação em lista e Verificação)

### Task 1: Tipos e parâmetros padrão

**Files:**
- Create: `web/lib/paradas/tipos.ts` (exatamente os tipos da spec §3), `web/lib/paradas/parametros.ts`,
  `web/testes/paradas-parametros.test.ts`

**Interfaces (parametros.ts):**
- `export const PARAMETROS_PADRAO: Parametros` — valores da spec §10/§4 (turnos: t1 {pessoasMec 6, pessoasEle 2,
  horasPorPessoa 6.5, inicio "05:30", fim "14:00"}, t2 {5, 1, 3, "14:00", "17:00"}, sabado {6, 2, 6.5, "05:30", "11:30"};
  feriados nacionais fixos de 2026 e 2027: 01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 20/11, 25/12; `classes` e
  `agrupamentos` da tabela §2.6, nessa ordem).
- `export function parametrosDe(cad: Record<string, Record<string, unknown>> | null | undefined): { p: Parametros; avisos: string[] }`
  — lê `cad.parametros`, mescla raso por chave sobre o padrão (objetos `turnos.*` mesclados por turno), valida:
  números finitos ≥ 0 (pessoas inteiras), `maxAtivosDia` ≥ 1, `maxParadasMes` ∈ {1,2}, regex de `classes`/`agrupamentos`
  compila (`new RegExp`), feriado `AAAA-MM-DD` válido (`dia()` não null), `inicio` null ou data válida. Campo inválido →
  fica o padrão e entra um aviso `"Parâmetro <campo> inválido; usado o padrão."`.
- `export function capTurno(t: CapTurno): HH` → `{ mec: pessoasMec*horasPorPessoa, ele: pessoasEle*horasPorPessoa }`.

- [ ] **Step 1: Testes** (`paradas-parametros.test.ts`):
  - `capTurno(PARAMETROS_PADRAO.turnos.t1)` → `{mec: 39, ele: 13}`; t2 → `{15, 3}`; sabado → `{39, 13}`.
  - `parametrosDe(null).p` `toEqual(PARAMETROS_PADRAO)` e `avisos` `[]`.
  - `parametrosDe({ parametros: { maxAtivosDia: 5, turnos: { t2: { pessoasMec: 4 } } } })` → `maxAtivosDia` 5,
    `turnos.t2.pessoasMec` 4, `turnos.t2.horasPorPessoa` 3 (resto do turno preservado), `turnos.t1` igual ao padrão.
  - `{ parametros: { maxAtivosDia: -1 } }` → 7 e 1 aviso contendo "maxAtivosDia".
  - `{ parametros: { classes: [{ padrao: "(", nome: "X", tipo: "X" }] } }` → classes = padrão, 1 aviso.
  - `{ parametros: { feriados: [{ data: "2026-02-31", nome: "x" }] } }` → feriados = padrão, 1 aviso.
  - `PARAMETROS_PADRAO.padraoSemanal[3]` `toEqual(["PRENSA/MOINHO SF"])`; `[1]` `toEqual(["DRY BLEND","BANBURY"])`.
- [ ] **Step 2:** `npx vitest run testes/paradas-parametros.test.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** PASS; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(paradas): tipos e parâmetros da programação de paradas`.

### Task 2: Calendário de trabalho e capacidade

**Files:** Create `web/lib/paradas/calendario.ts`, `web/testes/paradas-calendario.test.ts`

**Interfaces:**
- `export type Condicao = "util" | "sabado" | "domingo" | "feriado" | "antes"`
- `export interface DiaTrabalho { data: Dia; condicao: Condicao; feriado?: string; semana: string /* "2026-W46" */; diaSemana: number /*0 dom..6 sáb*/; mes: string; cap: { t1: HH; t2: HH } }`
- `export function chaveMes(d: Dia): string` → `"AAAA-MM"`; `export function chaveSemana(d: Dia): string` (de `semanaIso`, `W` + 2 dígitos)
- `export function diaDeIso(s: string): Dia | null` ("AAAA-MM-DD")
- `export function diasDoMes(mes: string, p: Parametros, inicio: Dia): DiaTrabalho[]` — todos os dias do mês; cap zero fora de útil/sábado; sábado `t2` zero.
- `export function mesesDoHorizonte(inicio: Dia, meses: number): string[]`
- `export function capacidadeDoMes(dias: DiaTrabalho[]): HH`
- `export const NOME_DIA = ["DOM","SEG","TER","QUA","QUI","SEX","SÁB"]`

- [ ] **Step 1: Testes** (usar `D = (a,m,d) => dia(a,m,d)!`):
  - `chaveSemana(D(2026,11,2))` = `"2026-W45"`; `D(2026,11,9)` = `"2026-W46"`; `D(2027,1,1)` = `"2026-W53"`.
  - `diasDoMes("2026-11", PARAMETROS_PADRAO, D(2026,11,3))`: 30 dias; 01/11 `domingo`; 02/11 `antes` (início é 03/11 — "antes" tem prioridade sobre feriado); 15/11 `domingo`; 20/11 `feriado` com nome "Consciência Negra"; 07/11 `sabado` cap `{t1:{39,13}, t2:{0,0}}`; 03/11 `util` cap t1 39/13, t2 15/3.
  - `capacidadeDoMes(...)` desse mês = `{mec: 1182, ele: 356}` (19 úteis × 54/16 + 4 sábados × 39/13).
  - Feriado no sábado → `feriado` e cap zero.
  - `mesesDoHorizonte(D(2026,11,10), 3)` = `["2026-11","2026-12","2027-01"]`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(paradas): calendário de trabalho e capacidade por turno`.

### Task 3: Leitura da IP19 em itens

**Files:**
- Modify: `web/lib/wcm/planos.ts` — exportar `COLUNAS` como `COLUNAS_IP19` e `EXCLUIR` como `EXCLUIR_IP19` (só `export const` + alias; sem mudar comportamento; `npx vitest run testes/planos.test.ts` continua verde).
- Create: `web/lib/paradas/leitura.ts`, `web/testes/paradas-leitura.test.ts`

**Interfaces:**
- `export function disciplinaDoCentro(centro: string): Disciplina | null | "vazio"` — `^ELE_`→ELE; `^MEC_|^COMPONEN$|^UTILIDAD$`→MEC; `""`→"vazio"; outro→null.
- `export interface LeituraIp19 { itens: ItemPlano[]; descartes: Record<string, number>; semCentro: number }`
- `export function itensDaIp19(cru: Crua[], p: Parametros, eqs: Map<string, Equipamento>, meses: Set<string>): LeituraIp19`
  - colunas por `COLUNAS_IP19` + `localizacao: ["^LOCALIZACAO$"]`, `equipSuperior: ["EQUIPAMENTO SUPERIOR"]` (mesmo esquema
    "sem repetir coluna" de `prepararIp19`; datas pelo mesmo `dataDe` — exportar `dataDe` de planos.ts também).
  - regras L1–L8 da spec; `campo`/`ativo` ficam `""` (preenchidos na Task 5); `chave` = `${plano}|${item}|${dataIp19}|${n}` (n = índice da operação dentro da chamada, a partir de 0);
  - `descartes` com chaves exatas: `"sem plano ou data"`, `"concluída ou ignorada"`, `"outra localização"`, `"outro grupo de planejamento"`, `"centro eliminado"`, `"fora de Componentes"`, `"fora do horizonte"`.
  - centro vazio: item entra com `disciplina "MEC"`, `centroAssumido: true`, `centro ""` (a Task 4 pode corrigir).

- [ ] **Step 1: Testes** (linhas cruas fictícias com cabeçalhos reais do SAP: `"Plano de manutenção"`, `"Item de manutenção"`,
  `"Data planejada"`, `"St.solicitação"`, `"Trabalho"`, `"Unidade do trabalho"`, `"Centro trab.responsável"`, `"Equipamento"`,
  `"Localização"`, `"Grp.plnj.PM"`, `"Ordem"`):
  - `disciplinaDoCentro`: "ELE_COMP"/"ELE_MONT"/"ELE_GPA" → ELE; "MEC_COMP"/"MEC_GPA"/"COMPONEN"/"UTILIDAD" → MEC; "" → "vazio"; "PRED_CIV" → null.
  - 30 min com unidade "MIN" → hh 0.5; "2" com "H" → 2; sem coluna de unidade, `"45"` → 0.75 (padrão MIN).
  - St.solicitação "Concluído" e "Ignorado" saem (`descartes["concluída ou ignorada"]` = 2); "Programado,espera (Inspeção)", "Reinício", "InícCiclo", "Datas adicionais (simulação)" ficam.
  - Data de conclusão preenchida → sai.
  - Sem coluna Localização: equipamento "EQ-1" com IH08 localização "GAL1" entra; "EQ-2" com "GAL2" sai (`"outra localização"`).
  - Centro "ELMC_MTZ" sai como `"centro eliminado"`; "PRED_CIV" como `"fora de Componentes"`.
  - `gruposPlanejamento: ["P01"]`: linha "P02" sai.
  - Mês fora de `meses` sai como `"fora do horizonte"`.
  - Duas operações da mesma chamada → chaves `...|0` e `...|1`, ambas com o mesmo `mes`.
- [ ] **Step 2–4:** FAIL → implementar → PASS (+ `testes/planos.test.ts` verde).
- [ ] **Step 5: Commit** `feat(paradas): leitura da IP19 em itens por disciplina`.

### Task 4: Completar o HH (IW38OP da ordem / mesmo plano + equipamento)

**Files:** Create `web/lib/paradas/completar.ts`, `web/testes/paradas-completar.test.ts`

**Interface:**
`export function completarHh(itens: ItemPlano[], ordens: Pick<Ordem,"ordem"|"plano"|"equipamento"|"inicio">[], ops: Pick<Operacao,"ordem"|"operacao"|"centroTrabalho"|"horas"|"cancelada">[], p: Parametros): { itens: ItemPlano[]; completadas: Record<OrigemHh, number> }`
— regras C1–C4 da spec §2.5, aplicadas por **chamada** (`plano|item|dataIp19`) cujos itens somam 0 h ou todos têm `centroAssumido`.
Itens novos herdam os campos da chamada, `chave` com novo `n`, `centro`/`disciplina` da operação (L5/L6 de novo: operação
de centro eliminado ou fora de Componentes é ignorada), `origemHh` conforme a regra.

- [ ] **Step 1: Testes:**
  - C1: chamada com ordem "9000001" HH 0; ops da ordem: 0010 MEC_COMP 1,5 h, 0020 ELE_COMP 0,5 h, 0030 MEC_COMP cancelada → 2 itens (MEC 1,5; ELE 0,5), origem `iw38op-ordem`.
  - C2: chamada sem ordem; IW38 tem ordens "9000010" (plano 500, EQ-1, inicio 01/10) e "9000011" (plano 500, EQ-1, inicio 20/10); data IP19 25/10 → usa as ops de "9000011", origem `iw38op-plano`. Empate de distância → a de início anterior? **Não**: empate → a mais recente (teste com inícios 20/10 e 30/10 e data 25/10 → "30/10").
  - C3: sem ordem nem IW38; outra chamada do mesmo plano+EQ com 2 h MEC em data mais próxima → copia; origem `ip19-mesmo-plano`.
  - C4: nada → continua HH 0, origem `sem-hh`; `completadas["sem-hh"]` = 1.
  - Chamada com HH > 0 não muda (mesmo objeto/valores).
  - Operação ELMC_MTZ não entra no completar.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(paradas): completa o HH da IP19 pela IW38OP`.

### Task 5: Ativos e demanda do mês

**Files:** Create `web/lib/paradas/ativos.ts`, `web/testes/paradas-ativos.test.ts`

**Interfaces:**
- `export function classificar(denominacao: string, p: Parametros): Omit<Ativo, "campos"|"equipamentos"|"denominacao"|"juntoCom">`
  — 1ª `ClasseAtivo` cujo regex casa com `chave(denominacao)`; `$1` com 2 dígitos (`"7"`→`"07"`, `"21"`→`"21"`); sem classe: nome = denominação (30 chars), tipo = 1ª palavra, sem grupo.
- `export function montarAtivos(itens: ItemPlano[], eqs: Map<string, Equipamento>, campoGeral: (eq: string) => string, p: Parametros): { itens: ItemPlano[]; ativos: Record<string, Ativo>; avisos: string[] }`
  — A1–A6: preenche `item.campo` e `item.ativo`; agrupamento por parâmetro antes do campo; nome repetido de campos diferentes → `" (2)"` + aviso; `juntoCom` de `p.juntos`; `exclusivoT1`/`preferenciaT1` pela classe e por `p.tiposPreferenciaT1`.
- `export function demandas(itens: ItemPlano[]): Demanda[]` — por (mes, ativo), itens ordenados (dataIp19, plano, item, chave), `hh` somado, `primeiraData`, `datas` únicas ordenadas; resultado ordenado por (mes, ativo).

- [ ] **Step 1: Testes** (denominações fictícias no formato das classes):
  - `classificar("INJETORA EXP 21 (10 EST) TESTE")` → nome "INJETORA 21", tipo "INJETORA", grupo "INJ EXP", so1Turno true.
  - `"INJETORA PVC (GOLDEN EAGLE) 008"` → "PVC 08", tipo "PVC", grupo null. `"INJETORA 04 UGB1 GOLDEN EAGLE"` → "GOLDEN 04".
  - `"PAN STONE 3 - TESTE"` → "PANSTONE 03", preferenciaT1 true. `"PRENSA A VÁCUO 001"` → "PRENSA A VÁCUO", papel "prensa".
  - `"MOINHO LAMINADOR SF 05 TESTE"` → "MOINHO 05", grupo "PRENSA/MOINHO SF", papel "moinho"; `"... SF 04 ..."` → "MOINHO 04", grupo null.
  - `"CALANDRA DE BORRACHA 001"` → soSabado true. `"MAQUINA XYZ DE TESTE MUITO LONGA COM NOME GRANDE"` → nome com 30 chars, tipo "MAQUINA".
  - `montarAtivos`: EQ-1 (campo C-100, denominação "DRY BLEND 01 TESTE") e EQ-2 (campo C-100, "EXTRUSORA DBL 001") → um ativo "DRY BLEND" com equipamentos [EQ-1, EQ-2], exclusivoT1 true.
  - Agrupamento Pellet: "EXTRUSORA DE GRAOS 002 (PELLET 02)" (campo C-201) e "KNEADER 75 L (PELLET 02)" (campo C-202) → um ativo "PELLET 02" com campos [C-201, C-202].
  - Equipamento sem campo → campo do superior; sem superior → `campoGeral`; sem nada → o próprio código.
  - "MOINHO 04" recebe `juntoCom: "BANBURY"`.
  - Dois campos que dão o mesmo nome → segundo vira "X (2)" e 1 aviso.
  - `demandas`: 3 itens (2 MEC 1 h e 2 h em 05/11 e 12/11, 1 ELE 0,5 h) do mesmo ativo/mês → `hh {mec:3, ele:0.5}`, `primeiraData` 05/11, `datas` [05/11, 12/11].
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(paradas): agrupamento de ativos e demanda do mês`.

### Task 6: Estado do motor, encaixe e validação de regras

**Files:** Create `web/lib/paradas/motor/estado.ts`, `web/testes/paradas-estado.test.ts`

**Interfaces:**
- `export type Codigo = "CALENDARIO"|"SO_T1"|"SABADO"|"DOIS_CRITICOS"|"MOINHO_SEM_PRENSA"|"MESMO_TIPO"|"SEMANA_REPETIDA"|"PRENSA_SEMANA"|"PRENSA_SEGUIDA"|"PELLET_SEMANA"|"PELLET_SEGUIDA"|"DRY_BLEND_SOZINHA"|"MAX_DIA"|"T1_CHEIO"|"JUNTO_FORA"|"CAPACIDADE"|"PARADAS_MES"|"SEGUNDA_MESMA_SEMANA"|"FORA_DO_MES"`
- `export type ModoTurno = "T1" | "T2" | "T2+T1"`
- `export class Estado` (só dados + métodos puros sobre si mesmo):
  - `constructor(dias: DiaTrabalho[], ativos: Record<string, Ativo>, p: Parametros, anterior?: EntradaMotor["ocupacaoAnterior"])`
  - `livre(d: Dia, t: Turno): HH`; `ativosNoDia(d): string[]`; `grupoDoDia(d): GrupoCritico | null`; `paradasDoAtivo(mes, ativo): Dia[]`
  - `colocar(ativo: string, mes: string, d: Dia, t: Turno, itens: ItemPlano[], parada: 1|2, marcas: Marca[], acima?: HH): LinhaProgramacao` (atualiza tudo: HH usado, tipos do dia, semana do ativo, prensa/pellet da semana, exclusivo DRY BLEND, contador de não críticos no T1)
  - `remover(linhaId: string): void` (para o passo 6)
  - `falhas(ativo: string, mes: string, d: Dia, modo: ModoTurno, opcoes?: { ignorarCapacidade?: boolean; extra?: boolean; segundaParada?: boolean }): Codigo[]` — R1–R15 da spec §5.2 (R13 só com `hh` informado via `opcoes.hh?: HH`).
- `export function encaixar(itens: ItemPlano[], livre: HH): { dentro: ItemPlano[]; fora: ItemPlano[] }` — first-fit §5.4; item de 0 h sempre dentro.
- `export function encaixarT2T1(itens: ItemPlano[], livreT2: HH, livreT1: HH): { t2: ItemPlano[]; t1: ItemPlano[]; fora: ItemPlano[] }`

- [ ] **Step 1: Testes** (mês fictício "2026-11", início 02/11, sem feriados — `p = { ...PARAMETROS_PADRAO, feriados: [] }`; ativos fictícios montados à mão com `classificar`):
  - `encaixar([MEC 30, MEC 10, ELE 5, MEC 2], {mec:39, ele:13})` → dentro [30, 2, ELE 5] (10 pula), fora [10].
  - `encaixarT2T1([MEC 10, MEC 20, ELE 4], {15,3}, {39,13})` → t2 [MEC 10], t1 [MEC 20, ELE 4], fora [].
  - `falhas`: domingo → `CALENDARIO`; sábado T2 → `CALENDARIO`; crítico em "T2" → `SO_T1`; INJETORA no sábado → `SABADO`; CALANDRA na terça → `SABADO`.
  - Depois de colocar DRY BLEND em 02/11 T1: BANBURY em 02/11 → `DOIS_CRITICOS`; PVC 08 em 02/11 T1 → `DRY_BLEND_SOZINHA`; PVC 08 em 02/11 T2 → `[]`.
  - Moinho SF em 04/11 sem prensa → `MOINHO_SEM_PRENSA`; depois de PRENSA COPE em 04/11 → `[]`.
  - PVC 08 em 03/11 e PVC 09 em 03/11 T2 → `MESMO_TIPO`; o mesmo ativo em 03/11 T2 depois de 03/11 T1 → `[]`.
  - PVC 08 em 03/11 e de novo em 05/11 → `SEMANA_REPETIDA`; em 10/11 → `[]`.
  - PRENSA COPE em 04/11 (W45); PRENSA PANSTONE em 06/11 → `PRENSA_SEMANA`; PRENSA COPE em 11/11 → `PRENSA_SEGUIDA`; PRENSA A VÁCUO em 11/11 → `[]`; com `extra: true` → sem `PRENSA_*`.
  - Semana atravessando o mês: `anterior = [{ semana: "2026-W44", ativo: "PELLET 01", grupo: "PELLET" }]` → PELLET 01 em 03/11 → `PELLET_SEGUIDA`.
  - 7 ativos no dia → 8º dá `MAX_DIA`. Dia com INJETORA 21 e GOLDEN 01 no T1 → PANSTONE 01 no T1 dá `T1_CHEIO`.
  - MOINHO 04 (juntoCom BANBURY) com BANBURY tendo demanda no mês e sem parada no dia → `JUNTO_FORA`.
  - HH acima do livre → `CAPACIDADE`; com `ignorarCapacidade` → sem.
  - 3ª parada → `PARADAS_MES`; 2ª parada na mesma semana → `SEGUNDA_MESMA_SEMANA` (além de `SEMANA_REPETIDA`).
  - Dia de dezembro para demanda de novembro → `FORA_DO_MES`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(paradas): estado do motor, encaixe por itens e regras R1–R15`.

### Task 7: Motor — retirados e críticos (passos 0 e 2)

**Files:** Create `web/lib/paradas/motor/criticos.ts`, `web/lib/paradas/motor/index.ts` (exporta `programar`; nesta tarefa
`programar` faz passos 0 e 2 e devolve o resto como pendente em `semHh` com motivo provisório "pendente"),
`web/testes/paradas-motor-criticos.test.ts`.
Helper de teste compartilhado: `web/testes/paradas-fixtures.ts` com `item(ativo, mes, data, disc, hh, extra?)`,
`ativo(nome, denominacao)` (usa `classificar`), `entrada({...})` (início, p sem feriados por padrão).

**Interfaces:** `export function programar(e: EntradaMotor): ResultadoMotor`;
`export function programarCriticos(est: Estado, demandas: Demanda[], mes: string, dias: DiaTrabalho[], p: Parametros): Map<string, ItemPlano[]>` (pendentes por ativo).

- [ ] **Step 1: Testes** (novembro/2026 fictício, início 02/11 seg, sem feriados):
  - Retirado: INJETORA 13 com 0,15 h no mês → `retirados` [{ativo:"INJETORA 13", motivo contém "0,2"}] e nenhuma linha/semHh dela; INJETORA 12 com 0,25 h → programada.
  - DRY BLEND 8 h MEC → linha 02/11 (SEG) T1, parada 1. BANBURY 10 h → 09/11 (SEG seguinte, pois 02/11 já tem crítico) T1; MOINHO 04 (2 h) no mesmo 09/11 T1.
  - Mês sem BANBURY: MOINHO 04 não é colocado no passo 2 (fica pendente para o passo 4).
  - PRENSA COPE (5 h) e PRENSA PANSTONE (5 h) e MOINHO 02, 05 (3 h cada) → COPE 04/11 (QUA) com MOINHO 02 no mesmo dia; PANSTONE 11/11 com MOINHO 05; nunca duas prensas na mesma semana; marca "semana da prensa" nos moinhos.
  - `ocupacaoAnterior` com PRENSA COPE em "2026-W44" → COPE não vai para 04/11 (W45); vai para 11/11; PANSTONE vai para 04/11.
  - PELLET 01 e PELLET 02 → TER 03/11 e TER 10/11.
  - INJETORA 10, 11, 12 → QUI 05/11, SEX 06/11, QUI 12/11.
  - Feriado na QUA 04/11 (`feriados:[{data:"2026-11-04",nome:"Teste"}]`), só PRENSA COPE no mês → 1º candidato do padrão (2b) é a QUA seguinte → esperado 11/11, sem a marca "fora do dia padrão".
  - Prensa com 50 h MEC (não cabe em 39) → passo 2d: 04/11 com itens que cabem; resto pendente.
  - Determinismo: `programar(e)` duas vezes → `toEqual`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(paradas): motor — retirados e máquinas críticas`.

### Task 8: Motor — só sábado e não críticos (passos 3 e 4)

**Files:** Create `web/lib/paradas/motor/naoCriticos.ts`; Modify `motor/index.ts`; Test `web/testes/paradas-motor-nao-criticos.test.ts`

- [ ] **Step 1: Testes:**
  - CALANDRA 6 h → no 1º sábado da janela (07/11), T1. STABIL 01 com 1ª data 20/11 → sábado ≥ 17/11 (janela −3 dias) → 21/11.
  - GOLDEN 01 (2 h, 1ª data 05/11) → T2 de um dia em [02/11, 30/11], o menos carregado, preferindo T2 vazio; não no dia de DRY BLEND T1 (vai pro T2 se for o dia).
  - DRY BLEND em 02/11 + PVC 08 com janela só 02/11 (`antecipacaoDias 0`, 1ª data 02/11, todos os outros dias lotados de propósito? simplificar: mês curto não existe — usar `maxAtivosDia: 1` nos outros dias via fixture) → PVC 08 em 02/11 **T2**, nunca T1.
  - PANSTONE 01 (4 h) com INJETORA 10 em 05/11 → PANSTONE no T1 de 05/11 (preferência T1 junto do crítico); segunda PANSTONE 02 (1ª data 05/11) não vai para o T1 de 05/11 (`T1_CHEIO`/`MESMO_TIPO`).
  - PVC 09 com 5 h ELE (> 3 h do T2) → linhas T2 (3 h ELE) e T1 (2 h ELE) do mesmo dia, marca "1º+2º turno", mesma parada 1.
  - Antecipação: TIEN KANG 06 com 1ª data 25/11 e dias 22–30/11 lotados → vai para antes de 22/11 com marca "antecipado".
  - Mesmo tipo: PVC 08 e PVC 09 com mesma janela de 1 dia útil livre → não ficam no mesmo dia.
  - Semana ISO através do mês: STABIL com 2ª parada não vai para a mesma semana.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(paradas): motor — sábado e ativos não críticos`.

### Task 9: (reservada) — ajustes do passo 4 apontados na revisão do Opus. Se nada, pular.

### Task 10: Motor — estouro ≤ 4 h, 2ª parada e Ativos sem HH (passo 5 e 7)

**Files:** Create `web/lib/paradas/motor/saldo.ts`; Modify `motor/index.ts`; Test `web/testes/paradas-motor-saldo.test.ts`

- [ ] **Step 1: Testes:**
  - Prensa com 42 h MEC / 5 h ELE → 1ª parada 39/5; pendente 3 h MEC ≤ 4 → junta na mesma linha: `hh.mec` 42, `acima {mec:3, ele:0}`, marca "estouro ≤4h", **sem** 2ª parada.
  - Prensa com 50 h MEC → pendente 11 h > 4 → 2ª parada em semana posterior (QUA da semana seguinte livre de prensa); `paradasNoMes` 2 em ambas as linhas.
  - Pendente MEC 3 h e ELE 5 h → não é estouro (ELE > 4) → 2ª parada.
  - Prensa com 100 h MEC → 2 paradas de 39; resto 22 h → `semHh` com o motivo exato de prensa da spec §5.3 R21.
  - Moinho SF com 45 h e só uma prensa no mês → 39 h no dia da prensa; resto 6 h (> 4) → semHh "Não coube junto com a prensa da semana (só 1º turno)".
  - Mês sem prensa com MOINHO 02 pendente → semHh com o mesmo motivo; aviso em `avisos`.
  - Não crítico de 60 h MEC (T2+T1 = 54) → 1ª parada 54 h; resto 6 → 2ª parada em outra semana.
  - Passo 7: ativo em semHh entra se houver turno livre do mesmo dia da parada dele (cenário montado: T2 liberado depois do passo 6) — esperar que saia de `semHh`.
  - Propriedade (Review Focus 2): 20 entradas pseudoaleatórias com semente fixa (gerador LCG no próprio teste) → para cada uma, Σ hh de `linhas` + `semHh` + `retirados` = Σ hh das demandas (MEC e ELE, tolerância 1e-6) e nenhuma chave de item repetida.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(paradas): motor — saldo até 4 h, 2ª parada e ativos sem HH`.

### Task 11: Motor — preenchimento de turno vazio (passo 6)

**Files:** Create `web/lib/paradas/motor/preenchimento.ts`; Modify `motor/index.ts`; Test `web/testes/paradas-motor-preenchimento.test.ts`

- [ ] **Step 1: Testes:**
  - Semana fictícia: 03/11 com T2 vazio e 05/11 com 3 não críticos no T2-compatíveis → um deles vai para 03/11 T2, marca "preenchimento"; 05/11 continua com algo no T2.
  - Nunca deixa o turno de origem vazio (origem com 1 ativo só não é usada).
  - Sábado vazio só recebe GOLDEN/PVC/TIEN KANG/PANSTONE (MICRONIZADOR disponível não é movido).
  - Movimento que quebraria `MESMO_TIPO`/`SEMANA_REPETIDA` não acontece.
  - Nenhum candidato → turno fica vazio (sem erro).
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(paradas): motor — nenhum turno vazio`.

### Task 12: Motor — fixações (duas passadas)

**Files:** Create `web/lib/paradas/motor/fixacoes.ts`; Modify `motor/index.ts`; Test `web/testes/paradas-motor-fixacoes.test.ts`

- [ ] **Step 1: Testes:**
  - Sem fixações, GOLDEN 01 em X; fixação `{mes, ativo:"GOLDEN 01", parada:1, data: 17/11, turno: 2}` → GOLDEN 01 em 17/11 T2 com **os mesmos `itens`** da passada A; marca "fixada".
  - Fixação num domingo → a linha existe (não é barrada) — o alerta vem da Task 13.
  - Fixação `"1+2"` → duas linhas (T2 e T1) com os itens divididos por `encaixarT2T1` (sem capacidade → o que sobrar vai no T1, nunca some).
  - Fixação de parada 2 inexistente → `fixacoesOrfas` com ela; nada muda nas linhas.
  - `extra: true` para PRENSA PANSTONE na mesma semana de outra prensa → linha existe, marca "parada extra", e a prensa extra não conta em `paradasNoMes` além de 2.
  - O resto é reprogramado em volta: o dia em que a GOLDEN estava pode receber outro ativo.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(paradas): motor — datas fixadas pelo planejador`.

### Task 13: Alertas de regra

**Files:** Create `web/lib/paradas/regras.ts`, Test `web/testes/paradas-regras.test.ts`

**Interface:** `export interface Alerta { linhaId: string; codigo: Codigo; texto: string }`;
`export function alertas(linhas: LinhaProgramacao[], e: EntradaMotor): Alerta[]`;
`export const TEXTO_ALERTA: Record<Codigo, string>` (pt-BR; ex.: `CALENDARIO: "Data sem atuação (domingo, feriado ou 2º turno de sábado)"`,
`PRENSA_SEGUIDA: "A mesma prensa em semanas seguidas"`, `CAPACIDADE: "Acima da capacidade do turno"`…).

Recria um `Estado` e recoloca as linhas em ordem (data, turno), coletando `falhas` de cada uma contra as anteriores **e**
as posteriores (regra simétrica: dois ativos do mesmo tipo no dia → alerta nas duas linhas). `CAPACIDADE` só se o excesso
do turno > Σ `acima` das linhas do turno + 1e-6.

- [ ] **Step 1: Testes:** resultado do motor sem fixações → `[]` (para 3 entradas fictícias diferentes). Uma linha por código
  (construir linhas à mão): domingo → `CALENDARIO`; INJ no T2 → `SO_T1`; duas prensas na semana → `PRENSA_SEMANA` em ambas;
  mesma Pellet em W45 e W46 → `PELLET_SEGUIDA` na de W46; MOINHO 04 fora do dia do Banbury → `JUNTO_FORA`; DRY BLEND + PVC
  no T1 → `DRY_BLEND_SOZINHA` na PVC; 8 ativos no dia → `MAX_DIA` em todas do dia; linha com 3 h acima e `acima` 3 → sem
  `CAPACIDADE`; com `acima` 0 → `CAPACIDADE`; extra não gera `PRENSA_SEMANA`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(paradas): alertas de regra da programação`.

### Task 14: Visões (Saldo HH, resumo do mês, Campos por dia, Ativos sem HH, Verificação por mês)

**Files:** Create `web/lib/paradas/visoes.ts`, Test `web/testes/paradas-visoes.test.ts`

**Interfaces:**
- `export interface TurnoDoDia { ativos: { ativo: string; hh: HH; campos: string[] }[]; cap: HH; hh: HH; saldo: HH }`
- `export interface LinhaSaldo { data: Dia; dia: string; condicao: Condicao; feriado?: string; t1: TurnoDoDia; t2: TurnoDoDia; backlog: HH /* saldo p/ backlog */; total: number; situacao: string; acima: HH; iw38?: HH; manual?: HH; final?: HH }`
- `export function saldoPorDia(r: ResultadoMotor, dias: DiaTrabalho[], ativos: Record<string, Ativo>, aloc?: AlocacaoBacklog | null, manual?: Map<Dia, HH>): LinhaSaldo[]`
  — saldo = cap − hh (pode ser negativo só com estouro); `backlog` = max(0, saldo T1) + max(0, saldo T2), **sem o T1 em dia de DRY BLEND**; `situacao`: "Sem atuação" / "Feriado – <nome>" / "Sábado (05:30 às 11:30)" / "Dia útil".
- `export interface ResumoMes { mes: string; carga: HH; capacidade: HH; programado: HH; saldo: HH; backlog: HH; semHh: HH; uso: HH /* 0..1 */; iw38?: HH; manual?: HH; final?: HH }`
- `export function resumoPorMes(demandas: Demanda[], r: ResultadoMotor, saldo: LinhaSaldo[]): ResumoMes[]` (carga = demandas − retirados).
- `export function camposPorDia(r: ResultadoMotor, dias: DiaTrabalho[], ativos): { data: Dia; dia: string; semana: number; situacao: string; maquinas: number; t1: string[]; t2: string[]; lista: string }[]` (só dias com máquina; `"ATIVO · campo"`; lista `"c1; c2"` sem repetir).
- `export function ativosSemHh(r: ResultadoMotor, ativos): { ativo; campos; equipamentos; mes; primeiraData; hh; total; itens; motivo }[]`

- [ ] **Step 1: Testes** (resultado fictício pequeno montado à mão): dia útil com 30/10 h no T1 e 10/2 no T2 → saldo T1 9/3, T2 5/1, backlog 14/4, total 18; mesmo dia com DRY BLEND no T1 → backlog 5/1; domingo → tudo 0 e "Sem atuação"; feriado → "Feriado – Finados". `resumoPorMes`: carga = Σ demandas sem retirados; `uso.mec` = programado/capacidade. `camposPorDia`: ativo com 2 campos aparece "PELLET 02 · C-201, C-202"; lista sem repetidos. `ativosSemHh` ordena por (mês, ativo).
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(paradas): visões de saldo HH, campos por dia e ativos sem HH`.

### Task 15: As 11 conferências

**Files:** Create `web/lib/paradas/conferencias.ts`, Test `web/testes/paradas-conferencias.test.ts`

**Interface:** `export interface Conferencia { id: string; texto: string; resultado: "OK"|"VERIFICAR"|"—"; detalhe?: string; abas: string }`;
`export function conferir(x: { e: EntradaMotor; r: ResultadoMotor; dias: DiaTrabalho[]; saldo: LinhaSaldo[]; resumo: ResumoMes[]; alertas: Alerta[]; backlog?: { aloc: AlocacaoBacklog; resumo: ResumoBacklog } | null; manual?: Map<Dia, HH> }): Conferencia[]`
— C1…C11 da spec §9, nessa ordem, tolerância 0,5 h. Antes da parte 4, `AlocacaoBacklog`/`ResumoBacklog` são declarados em
`tipos.ts` como interfaces mínimas (`porDia: Record<string /*Dia*/, { t1: HH; t2: HH }>`; resumo `{ pendente: HH; noCalendario: HH; alocado: HH; semSaldo: HH }`).

- [ ] **Step 1: Testes:**
  - Resultado do motor de uma entrada fictícia → C1–C9 "OK", C10 e C11 "—".
  - Parâmetros com t2 `horasPorPessoa` alterado só no `dias` (simular divergência montando `dias` com cap errada) → C1 "VERIFICAR".
  - Linha movida à mão para domingo → C3 "VERIFICAR" e C9 "VERIFICAR" (detalhe "1 alerta: CALENDARIO").
  - Remover um item de uma linha (mantendo hh) → C5 "VERIFICAR".
  - Apagar uma entrada de `semHh` → C6 "VERIFICAR".
  - Dia útil sem T2 → C8 "VERIFICAR" com a data no detalhe.
  - Backlog fictício: alocado 20 h MEC num dia com saldo 18 → C10 "VERIFICAR"; resumo com pendente 100 = 30 + 60 + 10 → C11 "OK"; 100 ≠ 30+60+5 → "VERIFICAR".
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(paradas): as 11 conferências da programação`.

### Task 16: Montagem no servidor (bases → entrada → resultado)

**Files:** Create `web/lib/paradas/dados.ts` (`import "server-only"`), `web/lib/paradas/montar.ts` (puro), Test `web/testes/paradas-montar.test.ts`

**Interfaces:**
- `montar.ts` (puro): `export function montarEntrada(x: { ip19: Crua[] | null; ordens: Ordem[] | null; ops: Operacao[] | null; eqs: Equipamento[] | null; campoGeral: (eq: string) => string; cad: Cadastro | null; hoje: Dia }): { entrada: EntradaMotor; leitura: LeituraIp19; completadas: Record<OrigemHh, number>; avisos: string[] }` — Tasks 1→3→4→5; `inicio` = `p.inicio ?? hoje`; `fim` = último dia do último mês; fixações do cadastro (`fixacao:*`).
- `export function calcular(entrada: EntradaMotor): { r: ResultadoMotor; dias: DiaTrabalho[]; alertas: Alerta[]; saldo: LinhaSaldo[]; resumo: ResumoMes[]; conferencias: Conferencia[] }` — junta Tasks 7–15 (usado no servidor **e** no cliente).
- `dados.ts`: `export const ARQ_PARADAS = "programacao_paradas.json"`; `export async function programacaoParadas(): Promise<{ montado: ReturnType<typeof montarEntrada>; calculo: ReturnType<typeof calcular>; atualizado: { ip19: string|null; iw38: string|null; ih08: string|null; iw38op: string|null } }>` — `bases()`, `campoDoEquipamento`, `lerCadastro(ARQ_PARADAS)`; cache com `guardar` (`app/(app)/saude/calculo`) pela assinatura (`atualizado` das 4 bases + hash do cadastro + `hoje`).
- Demonstração (sem repositório): `basesDemo` não tem GAL1/COMP; em `montarEntrada`, se `fonte()` for nula o chamador passa `cad` com `parametros: { localizacoes: [], centrosEliminados: [] }` e aceita qualquer centro como MEC — fazer isso **no `dados.ts`** (não no puro): parâmetro `demo: true` em `montarEntrada` que trata centro fora de Componentes como MEC.

- [ ] **Step 1: Testes** (`montar.ts` com linhas cruas fictícias): 2 equipamentos GAL1 + 1 GAL2; IP19 com 5 linhas (uma concluída, uma ELMC_MTZ, uma sem HH com ordem na IW38OP) → `leitura.descartes` certos, `completadas["iw38op-ordem"]` 1, `entrada.demandas` com 2 ativos; `calcular` → conferências C1–C9 OK.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(paradas): montagem da programação a partir das bases do site`.

### Task 17: Aba nova (parte 1 visível) + acesso

**Files:**
- Modify: `web/lib/navegacao.ts` (grupo Planejamento, depois de `gestao_hh`: `{ id: "programacao_paradas", titulo: "Programação de paradas", icone: "CalendarCog", rota: "/programacao_paradas" }`)
- Modify: `web/testes/acesso.test.ts` (novos casos abaixo)
- Create: `web/app/(app)/programacao_paradas/page.tsx` (servidor), `.../Verificacao.tsx`, `.../TabelaProgramacao.tsx` (cliente, só leitura nesta parte), `web/e2e/programacao_paradas.spec.ts`

Página (padrão de `gestao_hh/page.tsx`): `exigir("programacao_paradas")`; `Cabecalho titulo="Programação de paradas," destaque="dia a dia, dentro do HH."`; `PaginaWcm` sem filtros de período (`periodo={false} dimensoes={false}`);
`AbasVisao` com visões `["Programação", "Verificação"]` nesta parte; "Verificação" = tabela por mês (V6) + lista das 11 conferências com selo OK/VERIFICAR/— e detalhe; "Programação" = tabela V1 com filtro por mês e alerta em vermelho (tokens `--st-*`); `SemDados` se não houver IP19; quadro "De onde vêm os números" (datas das bases, descartes, completadas, avisos). Nada editável.

- [ ] **Step 1: Testes** (`acesso.test.ts`): Líder sem lista vê `programacao_paradas`; Analista sem lista vê; Manutentor sem lista **não** vê; Manutentor com lista `["programacao_paradas"]` vê; a aba está no grupo "Planejamento" com rota e ícone esperados.
- [ ] **Step 2:** FAIL → implementar navegação + página → PASS (`npx vitest run`).
- [ ] **Step 3: E2E** (`e2e/programacao_paradas.spec.ts`, modo demonstração): abrir `/programacao_paradas`, ver título, trocar para "Verificação", ver 11 linhas de conferência; 390 px sem rolagem horizontal da página.
- [ ] **Step 4:** Verificação completa (Global Constraints) + revisão do Opus (diff inteiro da parte 1) + `superpowers:verification-before-completion`.
- [ ] **Step 5: Commit + publicar** `feat(paradas): aba Programação de paradas (parte 1: motor e verificação)` → PR → merge → deploy READY.

---

# PARTE 2 — Calendário mensal, Saldo HH, Ativos sem HH, Campos por dia (publicável)

Usar `superpowers:brainstorming` (layout dos cartões) e a skill `ui-ux-pro-max` (`--stack nextjs`, cores de `globals.css`).

### Task 18: Calendário do mês (V2)
- Create `web/lib/paradas/calendarioVisao.ts`: `export function calendarioDoMes(mes, r, dias, ativos, saldo): { semanas: { rotulo: string; dias: { data: Dia; doMes: boolean; condicao; feriado?; hhDia: {mec:[number,number]; ele:[number,number]}; turnos: { t: Turno; janela: string; cartoes: { ativo; rotulo /* "PANSTONE 04 (parada 1/2) · dia 1 de 2" */; marcas; hh: HH; alerta: boolean }[] }[] }[] }[]; resumo: ResumoMes }`.
- Test `paradas-calendario-visao.test.ts`: semana de seg a sáb; dia de outro mês com `doMes false`; feriado com nome; rótulo "(parada 1/2)" só quando `paradasNoMes` 2; cartão com alerta quando a linha tem alerta.
- Create `app/(app)/programacao_paradas/Calendario.tsx` (cliente, seletor de mês; cartões coloridos por grupo crítico com `--serie-*`; marcas como selos).
- Commit `feat(paradas): calendário mensal com cartões por turno`.

### Task 19: Saldo HH (V3) e Campos por dia (V4)
- Create `SaldoHh.tsx` (tabela dia a dia com cabeçalho duplo T1/T2/saldo; resumo por mês no topo; colunas "acima do limite" só se houver), `CamposPorDia.tsx` (botão "Copiar lista do dia" e "Copiar lista do mês" com `navigator.clipboard`).
- E2E: copiar não quebra; 390 px ok.
- Commit `feat(paradas): saldo de HH dia a dia e campos de ordenação por dia`.

### Task 20: Ativos sem HH (V5) + Baixar Excel
- `AtivosSemHh.tsx` (tabela + quadros "Retirados" e "Chamadas sem HH").
- Exportação: usar o mesmo mecanismo de "Baixar Excel" das outras abas (`lib/exportacao`); rota `app/api/programacao_paradas/route.ts?planilha=programacao|saldo|campos|semhh` (GET, `autorizar("programacao_paradas")`, `registrar(..."exportacao"...)`). Teste em `testes/exportacao.test.ts` (cabeçalhos das 4 planilhas).
- Commit + **publicar parte 2**.

---

# PARTE 3 — Edição manual com alertas na hora, Parâmetros editáveis, histórico (publicável)

### Task 21: Motor no cliente
- Página envia `EntradaMotor` compacta (itens só `chave, ativo, mes, dataIp19, disciplina, hh, ordem, plano`) — `compactar(entrada)`/`expandir(...)` em `lib/paradas/compacto.ts`, teste de ida e volta (`toEqual`) e de tamanho (< 1,5 MB para 10 000 itens fictícios).
- `Editor.tsx` (cliente): estado `fixacoes`; a cada mudança roda `calcular()`; mostra alertas e conferências na hora.

### Task 22: Edição de data/turno
- No Calendário e na Programação: "Mover" (seletor de data e turno; arrastar opcional em telas largas). Cada movimento cria/atualiza `Fixacao {id: mes|ativo|parada}`; "Desfazer", "Salvar" e "Descartar".
- Create `app/(app)/programacao_paradas/acoes.ts` (`"use server"`): `salvarFixacoes(lista: Fixacao[], removidas: string[])` — `autorizar(aba, true)` + `!soEstoque(u)`; valida (mes `AAAA-MM`, data no mês ou mês seguinte, turno 1|2|"1+2", ativo ≤ 60 chars, ≤ 500 itens); grava `fixacao:<id>` (mesclar) + `hist:<iso>-<n>` com antes/depois; `revalidatePath("/programacao_paradas")`.
- Test `paradas-acoes.test.ts` (validação pura extraída para `lib/paradas/validacao.ts`): payload inválido → erro pt-BR; válido → itens esperados.

### Task 23: Parâmetros editáveis
- `Parametros.tsx` (visão "Parâmetros"): turnos (pessoas MEC/ELE e horas por pessoa por turno, com capacidade calculada ao lado), feriados (lista com incluir/remover), limites (máx. por dia, paradas por mês, estouro MEC/ELE, antecipação), padrão semanal (grupo por dia), rodízio de moinhos, juntos, tipos T1/T2/sábado, injetoras irrelevantes, localizações, grupos de planejamento, classes e agrupamentos (tabela de regex com teste "qual ativo vira esta denominação"). Mudança recalcula na hora (cliente) antes de salvar.
- Ação `salvarParametros(diff)` grava só o que difere do padrão (`parametros`) + `hist`. Teste: `diferencaDoPadrao(p)` só com campos alterados; `parametrosDe` ida e volta.

### Task 24: Histórico
- Visão "Histórico": últimos 200 `hist:*` (quando, quem, o quê — "GOLDEN 01: 12/11 2º turno → 17/11 2º turno"), fixações órfãs com botão "Apagar".
- (Opcional) **Peças por parada**: na gaveta do cartão, materiais reservados (IW13 reservado − tomados) das ordens da parada e saldo MB52 (`lib/wcm/consumo.ts`, `estoque()`), só leitura.
- Revisão do Opus + **publicar parte 3**.

---

# PARTE 4 — IW38 plano × backlog no saldo + troca de datas IW32 (publicável)

### Task 25: Classificação das ordens
- Create `lib/paradas/backlog.ts`: `classificarOrdens(ordens, ops, r, ativos, eqs, p): OrdemBacklog[]` (§8.1; `p.tiposOrdemPlano` default `["YM13","YM14","YM15","YM17"]` acrescentado aos `Parametros` com teste em Task 1 estendido).
- Tests: plano programado → "PLANO na programação"; plano não programado → "fora"; plano vazio PLA → BACKLOG; status usuário "INI" → "Em planejamento"; ordem ENTE fora; operação CONF fora; ELIM fora; GAL2 fora; centro ELMC_MTZ fora; ordem só na IW38OP tipo YM13 → plano.

### Task 26: Alocação do backlog no saldo + backlog manual
- `alocarBacklog(ordens, r, saldo, hoje, ativos): AlocacaoBacklog` e `resumoBacklog(...)` (§8.2).
- Tests: operação 3 h MEC entra no 1º dia ≥ max(hoje, 1ª data) em que a máquina para; nunca T1 de DRY BLEND; sem saldo → "sem saldo / sem parada"; ordem de prioridade (mesma data: prioridade menor primeiro); saldo final = backlog − iw38 − manual; C10 e C11 ligados (agora "OK" no cenário fictício).
- Backlog manual: ação `salvarBacklogManual(dia, mec, ele)` → `backlog_manual:<AAAA-MM-DD>`; coluna editável no Saldo HH.
- Visão "IW38 Plano × Backlog" (resumo por classe × disciplina + tabela das operações com Data/Turno alocado e Situação).

### Task 27: Troca de datas IW32 — CSV + VBS
- Create `lib/paradas/iw32.ts`: `linhasIw32(r, aloc, ordens, hoje): LinhaIw32[]`, `csvIw32(linhas, soMudancas = true): string`, `ARQ_CSV_IW32 = "SAP_IW32_DATAS_ordens.csv"`, `ARQ_VBS_IW32 = "SAP_IW32_DATAS_ordens.vbs"`, `scriptIw32(modoTeste: boolean): string` — esqueleto copiado de `scriptInclusao` (`app/(app)/mro/ia06.ts`: `AchaPasta`, log/feitos/pendentes, `MODO_TESTE`, `MAX_TELA_RUIM`), trocando o miolo por: `okcd = "/nIW32"`, `ctxtCAUFVD-AUFNR`, Enter, `ctxtCAUFVD-GSTRP`/`ctxtCAUFVD-GLTRP` (busca do campo por id terminando em `-GSTRP`/`-GLTRP`, como `cacheCol` faz), Enter ×2, confere o texto do campo, `btn[11]` só fora do teste; reutilizar `ansi` do ia06 (mover `ansi` para `lib/exportacao/ansi.ts` e reexportar do ia06 para não duplicar — testes do mro continuam verdes).
- Tests (`paradas-iw32.test.ts`): ordem com itens em 12/11 e 19/11 → início "12.11.2026", fim "19.11.2026"; ordem já com a mesma data → EXECUTAR vazio e fora do CSV com `soMudancas`; linhas antes de hoje fora; CSV com `;` e CRLF; `scriptIw32(true)` contém `Const MODO_TESTE = True`, `"IW32"`, `GSTRP`, `GLTRP` e **nenhum** `C:\Users\` nem nome de pessoa; `scriptIw32(false)` contém `False`.
- Visão "Planejamento (IW32)": tabela + botões "Baixar CSV" e "Baixar script VBS" (+ caixa "modo teste") como em `InclusaoIa06.tsx`; download registrado na auditoria.
- Revisão do Opus + **publicar parte 4**; depois: atualizar `CLAUDE.md` (seção curta "Programação de paradas": onde fica a lógica, cadastro, regra de acesso) no mesmo PR.

---

## Self-review (feito pelo autor do plano)

- Cobertura da spec: §2 → Tasks 3–5, 16; §4 → 2; §5 → 6–12; §6 → 13; §7 → 14, 18–20; §8 → 25–27; §9 → 15 (+26);
  §10 → 1, 22–24; §11 → 17, 22.
- Partes publicáveis: P1 termina com aba visível (Programação + Verificação); P2 só leitura; P3 grava cadastro; P4 exporta.
- Riscos: regras com interpretação (ver "Dúvidas" na resposta ao usuário) ficam todas em parâmetros — trocar o padrão não
  exige código.
