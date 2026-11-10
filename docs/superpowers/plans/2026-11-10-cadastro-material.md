# Cadastro de material — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a aba "Cadastro de material", onde os pedidos de cadastro de material do almoxarifado passam por uma
aprovação em sequência: Almoxarifado aprova → Almoxarifado marca a chegada com foto → PCM valida e o material é
vinculado ao equipamento.

**Architecture:** Segue o modelo da aba Cartão de crédito:
- regras puras em `lib/cadastroMaterial/regras.ts`;
- gravação em `lib/cadastroMaterial/dados.ts`, usando o cadastro `pedidos_cadastro_material.json` via
  `gravarCadastroLote`, com fotos em `app/documentos/pedidos_material/` via `fonte()`;
- uma rota `app/api/cadastro_material/route.ts` (GET para foto e planilha; POST multipart para as ações);
- a página `app/(app)/cadastro_material/` com formulários cliente.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-cadastro-material-design.md`

## Global Constraints

- Textos da tela em português do Brasil; cores e componentes de `components/ui` (o mesmo visual do Cartão).
- Id da aba: `cadastro_material`; título: "Cadastro de material"; ícone: `PackagePlus`; rota `/cadastro_material`;
  grupo "Custos e suprimentos", logo após `requisicoes`.
- Arquivo de cadastro: `pedidos_cadastro_material.json`. Pasta de fotos: `app/documentos/pedidos_material/<pedido>/<arquivo>`.
- Situações (texto exato):
  - `Aguardando almoxarifado`
  - `Aguardando chegada`
  - `Aguardando PCM`
  - `Concluído`
  - `Recusado`
- Campos do pedido e limites:
  - `descricao`: 5 a 200 caracteres;
  - `sap`: só dígitos, 5 a 12;
  - `observacao`: até 500 caracteres;
  - equipamento: tag existente na lista de equipamentos;
  - fotos: JPG, PNG ou WebP (`tipoDocumento`, sem PDF), até `LIMITE_DOCUMENTO`.
- Aprovadores: campos `aprova_almox` e `aprova_pcm` (booleanos) em `usuarios.json`.
  - Só o administrador edita esses campos.
  - Terceiro nunca fica marcado.
  - Só aprova quem também vê a aba.
  - Administrador não aprova sem estar marcado.
- Todo mundo que vê a aba lança e vê todos os pedidos.
- Testes só com dados fictícios. Nada de dados da empresa no repositório.
- Antes de publicar, em `web/`:
  - `npx tsc --noEmit`
  - `npx vitest run`
  - `npx eslint .` (0 erros)
  - `npx next build`
  - `PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test --trace off`

## Review Focus

1. Duas pessoas aprovando o mesmo pedido ao mesmo tempo. A segunda deve receber "o pedido já mudou de situação", e não
   uma transição dupla. Fica na Task 3, teste `corrida`.
2. Foto que não é imagem (um PDF ou um .exe renomeado para .jpg) é recusada pelo conteúdo, e não pela extensão.
   Task 3, teste `foto inválida`.
3. Recusa sem motivo, ou com motivo só de espaços, é recusada. Task 1.
4. Validar quando o equipamento já tem o código SAP em `materiais` não duplica o código; validar quando o equipamento
   não existe mais conclui o pedido e avisa, sem quebrar. Task 3.
5. Usuário marcado como aprovador mas sem a aba na lista não aprova (nem pela rota). Tasks 1 e 4.

---

### Task 1: Regras puras

**Files:**
- Create: `web/lib/cadastroMaterial/regras.ts`
- Test: `web/testes/cadastroMaterial.test.ts`

**Interfaces — Produces:**
```ts
export const ARQ_PEDIDOS = "pedidos_cadastro_material.json";
export const AG_ALMOX = "Aguardando almoxarifado", AG_CHEGADA = "Aguardando chegada", AG_PCM = "Aguardando PCM",
  CONCLUIDO = "Concluído", RECUSADO = "Recusado";
export type Situacao = typeof AG_ALMOX | typeof AG_CHEGADA | typeof AG_PCM | typeof CONCLUIDO | typeof RECUSADO;
export type Acao = "aprovar" | "recusar" | "chegou" | "validar" | "recusar_chegada";
export interface Foto { nome: string; tipo: string; tamanho: number; arquivo: string }
export interface Evento { em: string; por: string; acao: Acao | "lancar" | "editar"; motivo?: string }
export interface Pedido { id: string; descricao: string; sap: string; equipamento: { tag: string; nome: string };
  observacao: string; foto: Foto | null; fotoChegada: Foto | null; situacao: Situacao;
  criadoPor: string; criadoEm: string; historico: Evento[] }
export interface Papel { login: string; almox: boolean; pcm: boolean }
export interface EntradaPedido { descricao: string; sap: string; tag: string; observacao: string }
export function validarEntrada(e: EntradaPedido, tags: Set<string>): { erro: string } | { campos: EntradaPedido };
export function bloqueioDeAcao(p: Papel, ped: Pick<Pedido, "situacao">, acao: Acao, motivo: string): string; // "" = pode
export function proximaSituacao(atual: Situacao, acao: Acao): Situacao | null;
export function podeEditar(p: Papel, ped: Pick<Pedido, "situacao" | "criadoPor">): boolean; // dono e AG_ALMOX
export function pedidoDe(id: string, v: unknown): Pedido | null;   // leitura tolerante do JSON
export function paraGravar(p: Pedido): Record<string, unknown>;
export function pedidosDe(cad: Record<string, unknown>): Pedido[]; // ordem: criadoEm desc
export function ordenarPara(p: Papel, ps: Pedido[]): Pedido[];    // o que espera pelo papel primeiro
export function resumo(ps: Pedido[], mes: string): { agAlmox: number; agChegada: number; agPcm: number; concluidosMes: number };
export function csvPedidos(ps: Pedido[]): string;                 // ";" e BOM, como o cartão
```

Transições (a tabela da spec):
- `AG_ALMOX` com `aprovar` → `AG_CHEGADA`; com `recusar` → `RECUSADO`.
- `AG_CHEGADA` com `chegou` → `AG_PCM`.
- `AG_PCM` com `validar` → `CONCLUIDO`; com `recusar_chegada` → `AG_CHEGADA`.
- Qualquer outra combinação → `null`.

Quem age:
- `aprovar`, `recusar` e `chegou` exigem `almox`;
- `validar` e `recusar_chegada` exigem `pcm`;
- `recusar` e `recusar_chegada` exigem motivo com `trim().length >= 3`.

- [ ] **Step 1: Escrever os testes**
  - `it("transições permitidas")`: as 5 transições da tabela.
  - `it("transições proibidas")`: por exemplo, `proximaSituacao(CONCLUIDO, "aprovar") === null` e
    `proximaSituacao(AG_ALMOX, "validar") === null`.
  - `it("papel")`: `bloqueioDeAcao({login:"a",almox:false,pcm:true}, {situacao:AG_ALMOX}, "aprovar", "")` não é `""`;
    almox aprova (resultado `""`); pcm valida em `AG_PCM` (resultado `""`).
  - `it("motivo obrigatório")`: recusar com `"  "` dá erro; com `"Foto errada"` dá `""`.
  - `it("validação")`:
    - descrição com 4 caracteres, SAP com letra, SAP de 13 dígitos e tag fora do conjunto dão erro;
    - uma entrada válida devolve `campos` com o texto aparado;
    - observação com 501 caracteres dá erro.
  - `it("edição só do dono e antes da aprovação")`.
  - `it("pedidoDe tolera lixo")`: `pedidoDe("x", 5) === null`; situação desconhecida dá `null`.
  - `it("resumo e ordem")`: com 4 pedidos fictícios, as contagens; e com `almox`, os pedidos `AG_ALMOX` e `AG_CHEGADA`
    vêm primeiro.
- [ ] **Step 2:** `npx vitest run testes/cadastroMaterial.test.ts` → FALHA (módulo não existe).
- [ ] **Step 3:** Implementar `regras.ts`. Funções puras, sem `server-only`.
- [ ] **Step 4:** O mesmo comando → PASSA.
- [ ] **Step 5:** Commit: "Cadastro de material: regras da sequência de aprovação".

### Task 2: Aprovadores no cadastro de usuários

**Files:**
- Modify:
  - `web/lib/auth/usuarios.ts` (`Edicao` e `editarUsuario`);
  - `web/app/(app)/usuarios/acoes.ts` (ler os checkboxes `aprova_almox` e `aprova_pcm`);
  - `web/app/(app)/usuarios/GestaoUsuarios.tsx` (dois checkboxes no formulário de edição, com o texto
    "Aprova pedidos de cadastro de material como: Almoxarifado / PCM").
- Test: `web/testes/usuarios.test.ts`

**Interfaces — Produces:** `Edicao` ganha `aprovaAlmox?: boolean; aprovaPcm?: boolean`. Com `undefined`, mantém o valor
atual. O registro grava `aprova_almox: true` ou `aprova_pcm: true` e apaga o campo quando o valor é falso. Terceiro
força os dois para falso.

- [ ] **Step 1: Testes**
  - `it("marca aprovadores e terceiro nunca aprova")`: editar marcando os dois grava os dois campos; editar um Terceiro
    marcando os dois grava nenhum; editar sem informar mantém o valor.
- [ ] **Step 2:** Rodar os testes → FALHA.
- [ ] **Step 3:** Implementar. No formulário, os checkboxes ficam desabilitados quando a função escolhida é Terceiro.
- [ ] **Step 4:** Rodar os testes → PASSA; rodar também `npx tsc --noEmit`.
- [ ] **Step 5:** Commit: "Usuários: marcar aprovadores de cadastro de material".

### Task 3: Gravação (pedidos, fotos e vínculo ao equipamento)

**Files:**
- Create: `web/lib/cadastroMaterial/dados.ts` (`import "server-only"`)
- Test: `web/testes/cadastroMaterial.test.ts` (novo `describe` com `_definirFonte` / `_definirSupabase(null)`, como em
  `testes/cartao.test.ts`)

**Interfaces:**
- Consumes: Task 1 (tudo) e o cadastro `usuarios.json` da Task 2.
- Produces:
```ts
export function papelDe(u: { login: string; aprova_almox?: unknown; aprova_pcm?: unknown; funcao?: string }, veAba: boolean): Papel;
export async function lerPedidos(fresco?: boolean): Promise<Pedido[]>;
export async function tagsEquipamentos(): Promise<Map<string, string>>; // tag → nome (cadastro_equipamentos.json + IH08 da base, como a aba Equipamentos lista)
export async function lancarPedido(p: Papel, e: EntradaPedido, foto: { nome: string; bytes: Uint8Array }, por: string): Promise<string>;
export async function editarPedido(p: Papel, id: string, e: EntradaPedido, foto: { nome: string; bytes: Uint8Array } | null, por: string): Promise<void>;
export async function excluirPedido(p: Papel, id: string, por: string): Promise<void>;
export async function agir(p: Papel, id: string, acao: Acao, motivo: string, fotoChegada: { nome: string; bytes: Uint8Array } | null, por: string): Promise<{ aviso?: string }>;
export async function lerFoto(id: string, qual: "pedido" | "chegada"): Promise<{ bytes: Uint8Array; tipo: string; nome: string } | null>;
```

Regras de gravação:
- Toda alteração usa `gravarCadastroLote(ARQ_PEDIDOS, { [id]: (atual) => … }, por)` e reconfere
  `bloqueioDeAcao` / `podeEditar` sobre o pedido relido. Se a situação relida for outra, lança
  `FonteErro("O pedido já mudou de situação; atualize a página.")`.
- Foto: aceitar só quando `tipoDocumento(bytes)` é `image/jpeg`, `image/png` ou `image/webp` e o tamanho não passa de
  `LIMITE_DOCUMENTO`. Gravar em arquivo novo (id aleatório) com `fonte().gravarCondicional`; na demonstração, num `Map`
  em memória.
- `chegou` exige `fotoChegada`.
- `validar` faz, numa segunda gravação, `gravarCadastroLote("cadastro_equipamentos.json", { [tag]: (atual) => … })`,
  acrescentando o SAP em `materiais` sem duplicar. Se o equipamento não existir mais, devolve
  `{ aviso: "Equipamento não encontrado no cadastro: vincule à mão." }`.
- Registrar na auditoria com `registrar(por, "cadastro_material", id, { acao })`, incluindo a ação em `ACOES` de
  `lib/auditoria.ts` com o rótulo "Pedido de cadastro de material".

- [ ] **Step 1: Testes**
  - `it("fluxo completo")`: lançar → aprovar (almox) → chegou com foto → validar (pcm). O pedido fica `Concluído` e o
    equipamento fictício `EQ-TESTE` passa a ter o SAP em `materiais`.
  - `it("corrida")`: duas chamadas `agir(... "aprovar")` em sequência sobre a mesma situação lida; a segunda lança
    "já mudou de situação".
  - `it("foto inválida")`: bytes de um PDF (`%PDF-1.4`) e bytes aleatórios são recusados.
  - `it("validar não duplica e tolera equipamento ausente")`.
  - `it("excluir só o dono, antes da aprovação, e apaga as fotos")`.
- [ ] **Step 2:** Rodar → FALHA.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar → PASSA.
- [ ] **Step 5:** Commit: "Cadastro de material: gravação, fotos e vínculo ao equipamento".

### Task 4: Rota, aba e demonstração

**Files:**
- Create: `web/app/api/cadastro_material/route.ts`
- Modify:
  - `web/lib/navegacao.ts` (a aba, conforme as Global Constraints);
  - `web/lib/dados/demo.ts` (3 pedidos fictícios nas situações `AG_ALMOX`, `AG_PCM` e `Concluído`, com uma imagem PNG
    fictícia mínima; o usuário da demonstração fica marcado com `aprova_almox` e `aprova_pcm`);
  - `web/lib/auditoria.ts` (se a Task 3 ainda não tiver feito).
- Test: `web/testes/acesso.test.ts` (a aba nova entra no padrão de Líder e Analista e não entra em `ABAS_BASICAS`)

**Interfaces — Produces:**
- `GET /api/cadastro_material?p=<id>&f=pedido|chegada`: a foto, com os mesmos cabeçalhos do cupom do cartão
  (`no-store`, `nosniff`, CSP sandbox).
- `GET /api/cadastro_material?planilha=1&situacao=&mes=&q=`: CSV, registrado como `exportacao`.
- `GET /api/cadastro_material?sap=<código>`: `{ descricao: string | null }`, a descrição do material no catálogo.
- `POST /api/cadastro_material` multipart com `acao`:
  - `lancar | editar | excluir | aprovar | recusar | chegou | validar | recusar_chegada`;
  - campos `id`, `descricao`, `sap`, `tag`, `observacao`, `motivo`, `foto`.
- Resposta: `{ ok: true, aviso? }` ou `{ erro }` (400).
- Tudo exige `autorizar("cadastro_material")` (403 sem a aba). O papel vem de `papelDe(u, true)`.

- [ ] **Step 1:** Teste de acesso → FALHA.
- [ ] **Step 2:** Implementar a navegação, a rota e a demonstração.
- [ ] **Step 3:** `npx vitest run` → PASSA; `npx tsc --noEmit` → OK.
- [ ] **Step 4:** Commit: "Cadastro de material: rota, aba e demonstração".

### Task 5: Tela

**Files:**
- Create:
  - `web/app/(app)/cadastro_material/page.tsx` (server);
  - `web/app/(app)/cadastro_material/Formularios.tsx` (client: `NovoPedido`, `AcoesPedido`).
- Modify: `web/e2e/telas.spec.ts` (incluir `/cadastro_material` na lista de telas)
- Test: `web/e2e/cadastro_material.spec.ts`

**Interfaces — Consumes:** a rota da Task 4; `lerPedidos`, `tagsEquipamentos`, `papelDe` e `resumo` / `ordenarPara`.

Conteúdo da tela, de cima para baixo:
1. `Cabecalho` com título "Cadastro de material," e destaque "do pedido à validação na chegada.".
2. Quatro `Kpi`, com os rótulos exatos:
   - "Aguardando almoxarifado"
   - "Aguardando chegada"
   - "Aguardando PCM"
   - "Concluídos no mês"
3. Filtros na URL (`situacao`, `mes`, `q`), com `Controles` como no Cartão, e o link "Planilha".
4. Botão "Novo pedido", que abre o formulário:
   - equipamento por `<input list>` com `datalist` das tags;
   - foto por `<input type="file" accept="image/*" capture="environment">`;
   - ao digitar o SAP, se o código existir em `catalogo()`, aparece a descrição dele (vem no `page` como mapa
     SAP → descrição, só dos códigos dos pedidos e sob demanda via `GET ?sap=` da Task 4; se o código não existir, mostra um aviso e não bloqueia).
5. Lista de cartões (`ordenarPara`). Cada cartão mostra:
   - a foto em miniatura (`/api/cadastro_material?p=&f=pedido`) com `alt` igual à descrição;
   - `Selo` da situação: azul para os "Aguardando…", verde para Concluído, vermelho para Recusado;
   - SAP, equipamento, quem lançou e quando;
   - a linha do tempo (`historico`);
   - em `AG_PCM`, as duas fotos lado a lado;
   - os botões de `AcoesPedido`, só os permitidos por `bloqueioDeAcao` / `podeEditar`. Recusar pede o motivo num
     campo obrigatório; "Chegou" pede a foto.
6. No celular (390 px): uma coluna e sem rolagem lateral.

- [ ] **Step 1:** Escrever o e2e `cadastro material: lançar, aprovar, chegar e validar (demonstração)`:
  - entrar na demonstração (o usuário demo é admin; a demonstração o marca como `aprova_almox` e `aprova_pcm`);
  - abrir a aba, lançar um pedido com o PNG fictício e o SAP `9999901`;
  - aprovar, marcar a chegada com foto e validar;
  - conferir o selo "Concluído";
  - repetir a abertura da aba a 390 px, sem rolagem lateral e sem erros no console.
- [ ] **Step 2:** Rodar → FALHA.
- [ ] **Step 3:** Implementar a página e os formulários.
- [ ] **Step 4:** Rodar a suíte inteira (todas as checagens das Global Constraints) → PASSA.
- [ ] **Step 5:** Commit: "Cadastro de material: tela no estilo do Cartão".

### Task 6: Documentação e revisão

**Files:**
- Modify:
  - `CLAUDE.md` (na seção de acesso, uma linha: "Cadastro de material: aprovadores marcados em Usuários (Almoxarifado / PCM); Terceiro nunca aprova");
  - `docs/pendencias.md`.

- [ ] **Step 1:** Atualizar a documentação.
- [ ] **Step 2:** Revisão do Opus de toda a ramificação. Corrigir os bloqueantes e os importantes, rodar as checagens de
  novo.
- [ ] **Step 3:** Commit, PR, merge, realinhar o ramo e conferir o deploy.
