# Orçamento mensal e requisições projetadas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na aba Custos, lançar à mão o valor disponível de cada mês e comparar com ordens (IW38) + requisições
aprovadas projetadas (material +30 dias, serviço +15), com as pendentes de aprovação à parte como "a entrar".

**Architecture:** Contas puras em `web/lib/wcm/orcamento.ts` (testadas); `Requisicao` ganha `tipo` e `fase` no preparo;
gravação do disponível em `metas_wcm.json` (`orcamento:AAAA-MM`) por ação de servidor da aba Custos; cartão de servidor
`Orcamento.tsx` + editor cliente na página `/custos`.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Tailwind 4, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-orcamento-requisicoes-design.md`

## Global Constraints

- pt-BR em todo texto de tela; cores só pelos tokens do site (`--marca-*`, `--serie-1..4`, `--st-*`, `--seq-1..7`), sem hex novo.
- Nenhum valor da empresa no código ou nos testes (orçamento só no cadastro); testes só com dados fictícios.
- Requisições valem para a fábrica inteira; ordens seguem o recorte (`ordensDoPeriodo(d.ordens, ini, fimEf, c.tipos)` já existe em `custos/page.tsx`).
- Mobile: página sem rolagem horizontal em 390 px.
- Antes de publicar: `cd web && npx tsc --noEmit && npx vitest run && npx eslint . && npx next build && npx playwright test`
  (Playwright local: `PW_CHROMIUM=$(ls /opt/pw-browsers/chromium-1194/chrome-linux*/chrome | head -1)`).
- Não usar `pkill -f` nem matar processos por padrão; servidor só pelo PID.

## Review Focus

1. Status reais do export (com e sem " (Enviado para RFQ)"; "Ação de comprador pendente" é **aprovada**, não pendente) — teste na Task 1.
2. Virada de mês/ano na projeção (enviada 15/12 + 30 → janeiro do ano seguinte) — teste na Task 1.
3. Mês sem disponível cadastrado: saldo "—", nunca tratado como 0 — teste na Task 1.
4. Gravar mês com campo vazio apaga só aquele mês, sem mexer nos outros itens do `metas_wcm.json` — teste na Task 2.
5. Base de requisições sem a coluna de tipo → todas material e `semTipo = true` (aviso na tela) — teste na Task 1.

---

### Task 1: Contas do orçamento + tipo/fase da requisição

**Files:**
- Create: `web/lib/wcm/orcamento.ts`, `web/testes/orcamento.test.ts`
- Modify: `web/lib/wcm/preparo.ts` (`Requisicao` + `prepararRequisicoes`), `web/lib/wcm/demo.ts` (requisições fictícias ~linha 145)

**Interfaces:**
- Produces (em `orcamento.ts`):
  - `type FaseReq = "aprovada" | "pendente" | "fora"`; `type TipoReq = "material" | "servico"`
  - `faseDaRequisicao(status: string): FaseReq`
  - `tipoDaRequisicao(texto: string): TipoReq | null` (vazio → null)
  - `entradaDaRequisicao(r: Pick<Requisicao, "enviadoEm" | "ultimoEnvio" | "tipo">): Dia | null`
  - `chaveMes(d: Dia): string` → `"AAAA-MM"`
  - `orcamentoDe(cad: Cadastro | null | undefined): Map<string, number>` (itens `orcamento:AAAA-MM` com `valor` numérico ≥ 0)
  - `orcamentoPorMes(ordens: OrdemCusto[], reqs: Requisicao[] | null, disponivel: Map<string, number>, ini: Dia, fim: Dia): ResultadoOrcamento`
  - `interface LinhaOrcamento { mes: string; disponivel: number | null; ordens: number; requisicoes: number | null; saldo: number | null; aEntrar: number | null }`
  - `interface ResultadoOrcamento { linhas: LinhaOrcamento[]; totais: { disponivel: number | null; gasto: number; saldo: number | null; aEntrar: number | null }; semData: number; semTipo: boolean }`
- Produces (em `preparo.ts`): `Requisicao` ganha `tipo: TipoReq | null` e `fase: FaseReq` (importados de `orcamento.ts` só como tipo, ou definidos em `preparo.ts` e reexportados — o que evitar ciclo de import).

- [ ] **Step 1: Testes** em `testes/orcamento.test.ts` (dados fictícios; `D(a,m,d)` = `dia(a,m,d)!` de `lib/wcm/util`):
  - `faseDaRequisicao`: "Solicitado", "Solicitado (Enviado para RFQ)", "Ação de comprador pendente", "Ação de comprador pendente (Enviado para RFQ)", "Recebido", "Recebido (Enviado para RFQ)", "Parcialmente recebido", "Parcialmente recebido (Enviado para RFQ)" → `"aprovada"`; "Aprovação pendente", "Aprovação pendente (Enviado para RFQ)" → `"pendente"`; "Rascunho", "Rascunho (Enviado para RFQ)", "Carrinho", "" → `"fora"`.
  - `tipoDaRequisicao`: "Serviço" / "SERVICO" / "serviços" → `"servico"`; "Material" / "MAT" → `"material"`; "" / "  " → `null`.
  - `entradaDaRequisicao`: material enviado `D(2026,12,15)` → `D(2027,1,14)`; serviço enviado `D(2026,3,20)` → `D(2026,4,4)`; tipo null = material; sem `enviadoEm` usa `ultimoEnvio`; ambos null → `null`.
  - `orcamentoPorMes` com ini `D(2026,1,1)`, fim `D(2026,2,28)`, disponível `{"2026-01": 10000}`:
    ordens 3000 em jan e 500 em fev; req aprovada material 1000 enviada 2025-12-10 (entra jan), req pendente serviço 400 enviada 2026-02-01 (entra fev), req "Rascunho" 999 (fora), req aprovada total 0 (fora), req aprovada sem datas (conta em `semData`=1).
    Esperado: jan `{disponivel:10000, ordens:3000, requisicoes:1000, saldo:6000, aEntrar:0}`; fev `{disponivel:null, ordens:500, requisicoes:0, saldo:null, aEntrar:400}`; `totais.gasto` 4500, `totais.disponivel` 10000, `totais.saldo` 5500 (soma só dos meses com disponível: 10000 − 3000 − 1000), `totais.aEntrar` 400.
  - `reqs = null` → `requisicoes` e `aEntrar` null em todas as linhas e nos totais.
  - `semTipo`: todas as reqs com `tipo` null → `true`; alguma com tipo → `false`.
  - `orcamentoDe`: ignora itens sem prefixo, valor negativo, texto; lê `{"orcamento:2026-03": {valor: 1234.5}}`.
- [ ] **Step 2:** `cd web && npx vitest run testes/orcamento.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar** `orcamento.ts`. Normalizar status/tipo como o resto do preparo (sem acento, maiúsculas — usar o
  helper `chave` de `preparo.ts` se exportado, senão `normalize("NFD")`). Fase por **prefixo**: `APROVACAO PENDENTE` → pendente;
  `SOLICITADO`, `ACAO DE COMPRADOR`, `RECEBIDO`, `PARCIALMENTE RECEBIDO` → aprovada; resto fora. Linhas = um mês por mês de
  [ini, fim]. Requisição entra se `fase !== "fora"`, `total > 0` e a entrada cai em [ini, fim]; aprovada soma em `requisicoes`,
  pendente em `aEntrar`. `saldo = disponivel − ordens − (requisicoes ?? 0)` só com disponível. Datas de ordem por `x.data`.
- [ ] **Step 4: Preparo:** em `prepararRequisicoes`, mapear a coluna `Tipo: ["MATERIAL OU SERVI", "SERVI.O.?/.?MATERIAL", "TIPO DE (ITEM|COMPRA|REQ)", "^TIPO$"]`
  e preencher `tipo` (`tipoDaRequisicao`) e `fase` (`faseDaRequisicao(status)`); `pendente` fica como está. Teste no mesmo arquivo:
  `prepararRequisicoes` com uma linha crua que tem `"Material ou serviço": "Serviço"` → `tipo "servico"`; sem a coluna → `null`.
- [ ] **Step 5: Demo:** requisições fictícias com status reais (alternar "Solicitado", "Aprovação pendente", "Recebido",
  "Rascunho") e coluna `"Material ou serviço"` ("Material"/"Serviço"); conferir que `testes/` que usam a demo continuam passando.
- [ ] **Step 6:** `npx vitest run && npx tsc --noEmit` → tudo passa.
- [ ] **Step 7: Commit** `feat(custos): projeção das requisições e contas do orçamento`.

### Task 2: Gravar o disponível (ação + validação + editor)

**Files:**
- Create: `web/app/(app)/custos/validacao.ts`, `web/app/(app)/custos/acoes.ts`, `web/app/(app)/custos/_ui/EditorOrcamento.tsx`
- Test: `web/testes/orcamento.test.ts` (validação) e o padrão de teste de ação de `web/testes/metas.test.ts` (permissão)

**Interfaces:**
- Consumes: `chaveMes`/`orcamentoDe` (Task 1); `autorizar` (`lib/auth/sessao`), `gravarCadastroLote` + `ind.ARQ_METAS`; padrão de `salvarCustoParada` em `app/(app)/metas/acoes.ts`.
- Produces:
  - `validarOrcamento(ano: number, valores: (number | null)[]): string` em `validacao.ts` (sem imports; "" = ok): ano inteiro 2000–2100; exatamente 12 posições; cada uma `null` ou número finito 0–1.000.000.000.
  - `salvarOrcamento(ano: number, valores: (number | null)[]): Promise<{ erro: string; ok: string }>` em `acoes.ts` ("use server"): `autorizar("custos", true)` senão `{erro: "Só editores e administradores lançam o valor disponível.", ok: ""}`; grava `orcamento:AAAA-MM` → `{valor}` (2 casas) ou `null` (remove), `mesclar = false` por item, só os 12 meses daquele ano; `revalidatePath("/", "layout")`; ok `"Valor disponível salvo."`.
  - `<EditorOrcamento ano={number} valores={(number | null)[]} />` (cliente): 12 campos "jan…dez" em R$ (grade 3×4 no celular, 6×2 no computador), setas ‹ › de ano por link (`?oano=AAAA`, mantendo os outros parâmetros), botão "Salvar", mensagem de erro/ok no mesmo estilo dos editores de `app/(app)/metas/Editores.tsx`.

- [ ] **Step 1: Testes:** `validarOrcamento(2026, Array(12).fill(null))` → `""`; com `[5000, ...11 null]` → `""`; ano 1999 → mensagem; 11 posições → mensagem; valor −1, `NaN`, `2e9` → mensagem. Ação: usuário leitor → erro de permissão (seguir como `metas.test.ts` simula `autorizar`); editor gravando `[1000, null, …]` em 2026 → `gravarCadastroLote` chamado com `{"orcamento:2026-01": {valor: 1000}, "orcamento:2026-02": null, …}` (12 chaves).
- [ ] **Step 2:** rodar e ver falhar.
- [ ] **Step 3:** implementar `validacao.ts`, `acoes.ts`, `EditorOrcamento.tsx`.
- [ ] **Step 4:** `npx vitest run && npx tsc --noEmit` → passa.
- [ ] **Step 5: Commit** `feat(custos): lançar o valor disponível do mês`.

### Task 3: Cartão "Orçamento do mês" na aba Custos

**Files:**
- Create: `web/app/(app)/custos/_ui/Orcamento.tsx`
- Modify: `web/app/(app)/custos/page.tsx` (seção nova entre a linha DNA|Classe|Concentração|Travado e "Mais detalhes"),
  `web/components/graficos.tsx` (`Colunas` ganha `metaPorRotulo?: (number | null)[]`), `web/e2e/telas.spec.ts`

**Interfaces:**
- Consumes: `orcamentoPorMes`, `orcamentoDe` (Task 1); `EditorOrcamento` (Task 2); `o` e `fimEf` já em `page.tsx`; `d.requisicoes`; `podeEditar` (`lib/auth/acesso`) com o usuário da sessão (ver como `page.tsx` de Metas decide se mostra editores).
- Produces: seção `Secao titulo="Orçamento" destaque="do mês"`.

- [ ] **Step 1: `Colunas.metaPorRotulo`:** quando presente, desenha em cada coluna um traço tracejado horizontal na altura do valor (cor `var(--st-ok)`), ignorando `null`; a escala considera esses valores; `meta` único continua igual. Sem uso anterior quebrado (`npx tsc --noEmit`).
- [ ] **Step 2: `Orcamento.tsx`** (servidor), props = `ResultadoOrcamento` + `editor?: ReactNode`:
  - 4 números no topo (`Numeros`/`Nota` de `confiabilidade/_comum/Numeros` como no resto da página): Disponível, Gasto (ordens + requisições), Saldo (vermelho `--st-critico` se < 0), A entrar (pendente de aprovação). `null` → "—".
  - Gráfico `Colunas` empilhado (séries "Ordens (IW38)" `serie-1` e "Requisições aprovadas" `serie-3`) com `metaPorRotulo` = disponível; dentro de `Grafico` com `tabela` (Mês, Disponível, Ordens, Requisições, Saldo, A entrar).
  - Notas fixas da spec (fábrica inteira; possível duplicidade ordem × requisição; aviso `semTipo`; `semData > 0` → "N requisição(ões) sem data de envio ficaram fora"). Sem requisições: só a nota "Sem base de requisições: só as ordens entram no gasto".
  - Rodapé `<details>` "Lançar valor disponível" com o `editor` quando recebido.
- [ ] **Step 3: `page.tsx`:** meses da tabela = `[ini, min(fim, mês de hoje + 2 meses)]` (fim do mês); `ordensDoPeriodo(d.ordens, ini, fimEf, c.tipos)` para as ordens (as do mês futuro não existem); `orcamentoPorMes(...)`; `oano` = `?oano` válido ou ano de `fimEf`; editor só se `podeEditar(usuário)`, com `valores` = 12 meses de `orcamentoDe(c.cad.metas)` daquele ano.
- [ ] **Step 4: E2E:** em `e2e/telas.spec.ts`, `/custos` mostra o texto "Orçamento" e o resumo "Lançar valor disponível" (demo).
- [ ] **Step 5: Verificar:** comandos das Global Constraints; capturas `/custos` 1280 e 390 px (scrollWidth ≤ 390), salvando no scratchpad.
- [ ] **Step 6: Commit** `feat(custos): orçamento do mês × ordens e requisições`.

---

## Ajustes da revisão (Opus) — valem sobre as tarefas acima

1. **Coluna de tipo (Task 1):** `chave()` (`lib/dados/texto.ts`) troca não-letras por espaço — usar `SERVI.O.{0,3}MATERIAL`
   no lugar de `SERVI.O.?/.?MATERIAL`; pôr `Tipo` **antes** de `Requisicao` no `mapear` (para "Tipo de requisição" não cair em `REQUISI`).
2. **Teste do total (Task 1):** `totais.saldo` = soma dos saldos dos meses com disponível = **6000** (não 5500).
   `totais.disponivel` = soma dos disponíveis cadastrados (null se nenhum); `totais.gasto` = ordens + requisições de todos os meses.
3. **Demo (Task 1):** manter `pend = i % 3 !== 0` com status "Aprovação pendente" (alternando "Aprovação pendente (Enviado para RFQ)")
   — `testes/demo-wcm.test.ts` espera 40 pendentes; nas demais linhas revezar "Solicitado", "Recebido", "Rascunho".
   Semear em `cadastrosDemo` (`lib/dados/demo.ts`) itens `orcamento:AAAA-MM` fictícios (valores redondos) para os meses da demo.
4. **Tipos (Task 1):** acrescentar `tipo: null, fase: "aprovada"` ao `Requisicao` montado à mão em `testes/requisicoes.test.ts`.
   `FaseReq`, `TipoReq`, `faseDaRequisicao`, `tipoDaRequisicao` ficam em `preparo.ts` (usam `chave` de `lib/dados/texto`);
   `orcamento.ts` só faz `import type` de `preparo.ts` e de `app/(app)/custos/calculo.ts` e reexporta as duas funções.
5. **Ordens (Task 1):** somar `x.custoReal` no mês de `x.data` (`OrdemCusto`); ordem sem data fica fora.
6. **Casos (Task 1):** `semTipo` = `false` com lista vazia ou `null`; teste de `prepararRequisicoes` com "Ação de comprador pendente" → `fase "aprovada"`.
   `pendente` antigo continua `includes("PENDENTE")` (aba Requisições e etapa 1 do travado não mudam) — por isso "Ação de comprador
   pendente" aparece como pendente no travado e como aprovada no orçamento; a nota do cartão diz "a entrar = aguardando aprovação".
7. **Ação (Task 2):** `gravarCadastroLote(ind.ARQ_METAS, itens, nome, false)` (o `mesclar` é da chamada inteira); a ação chama
   `validarOrcamento`; o teste confere `nome "metas_wcm.json"` e `mesclar false`, como `metas.test.ts`.
8. **Meses da tabela (Task 3):** de `inicioDoMes(ini)` até `max(fim, fim do mês de hoje + 2)` **quando** `fim ≥ início do mês de hoje`;
   senão até `fim`. Ordens futuras não existem (`fimEf`), as requisições projetadas sim.
9. **Usuário (Task 3):** `const u = await exigir("custos")` e `podeEditar(u)`; conferir que o usuário da demo/E2E pode editar
   (senão o E2E testa só o cartão, não o editor).
