# Aba Suporte Técnico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aba `/suporte` com guias técnicos, diagnóstico guiado e biblioteca técnica, sem custo.

**Architecture:** Conteúdo e regras puras em `web/lib/suporte/` (testados); biblioteca reaproveitando `lib/dados/documentos.ts`
generalizado; página de servidor com três visões.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-suporte-tecnico-design.md`

## Global Constraints
- pt-BR; cores só tokens do site (`globals.css`); sem rolagem horizontal em 390 px.
- Repositório público: conteúdo técnico genérico, nada da empresa, nenhum nome de pessoa; testes com dados fictícios.
- Verificação: `cd web && npx tsc --noEmit && npx vitest run && npx eslint . && npx next build &&
  PW_CHROMIUM=$(ls /opt/pw-browsers/chromium-1194/chrome-linux*/chrome | head -1) npx playwright test`.
- Servidor só pelo PID; nada de `pkill -f`. Não usar ferramentas de mensagem entre sessões.

## Review Focus
1. Link interno de guia apontando para rota inexistente — teste de conteúdo (Task 1).
2. Busca com acento/caixa diferentes ("rolamento" × "ROLAMENTOS") — teste (Task 1).
3. Biblioteca: arquivo que não é PDF/imagem renomeado para .pdf — validação pela assinatura dos bytes (Task 2).
4. Equipamento informado no diagnóstico sem quebras/apontamentos — bloco some, nunca zero falso (Task 3).
5. Diagnóstico com parâmetros inválidos no endereço (`?tipo=xyz`) — volta à escolha (Task 3).

---

### Task 1: Conteúdo, busca e diagnóstico (puros)

**Files:** Create `web/lib/suporte/guias.ts`, `web/lib/suporte/diagnostico.ts`, `web/testes/suporte.test.ts`.

**Interfaces (produz):**
- `type Area = "mecanica" | "lubrificacao" | "eletrica" | "fluidos" | "seguranca" | "metodos" | "pcm_sap" | "indicadores"`;
  `AREAS: { id: Area; titulo: string; descricao: string }[]` (títulos: Mecânica, Lubrificação, Elétrica, Pneumática e hidráulica,
  Segurança, Métodos e ferramentas, PCM e SAP, Indicadores).
- `interface Guia { id: string; area: Area; titulo: string; resumo: string; palavras: string[]; sintomas?: string[];
  causas?: string[]; verificar?: string[]; acoes?: string[]; praticas?: string[]; texto?: string[]; links?: { rotulo: string; rota: string }[] }`
- `GUIAS: Guia[]` — **no mínimo 32 guias**, ≥ 3 por área, conteúdo técnico correto e prático (ex.: Mecânica: rolamentos,
  correias e polias, alinhamento de eixos, acoplamentos, redutores, análise de vibração; Lubrificação: graxas, óleos,
  intervalos e quantidade, contaminação; Elétrica: motores de indução, inversores (falhas comuns: sobrecorrente, sobretensão,
  subtensão, sobretemperatura, falta de fase), contatores e relés térmicos, aterramento e medições com multímetro/megôhmetro,
  NR-10; Fluidos: FRL, cilindros, válvulas direcionais, vazamentos de ar comprimido, unidade hidráulica e óleo; Segurança:
  NR-12, LOTO, permissão de trabalho, EPIs; Métodos: TPM e pilares WCM, 5 Porquês, Ishikawa 6M, análise de falha, FMEA, PDCA
  e Kaizen; PCM e SAP: tipos de ordem YM01–YM13, transações, fluxo da nota ao encerramento, apontamento de horas (IW41/IW47),
  planos de manutenção (IP10/IP19/IA05/IA06); Indicadores: MTBF, MTTR, disponibilidade, backlog, aderência à programação,
  custo de manutenção — com fórmula e link para a aba do site).
- `buscarGuias(q: string, area?: Area): { guia: Guia; nota: number }[]` — normaliza sem acento/caixa; tokens; nota = título×5,
  palavras×4, resumo×2, corpo×1; vazio → todos (nota 0) na ordem de `GUIAS`; só área quando `area`.
- `guiaPorId(id: string): Guia | undefined`.
- Em `diagnostico.ts`: `TIPOS_EQUIPAMENTO: { id: string; titulo: string; area: Area; sintomas: { id: string; titulo: string;
  causas: string[]; verificar: string[]; seguranca?: string; guias: string[] }[] }[]` (os 14 tipos da spec, ≥ 3 sintomas cada);
  `diagnosticar(tipo: string, sintoma: string)` → o sintoma ou `null`.

- [ ] Testes primeiro (ver spec "Testes": ids únicos, área válida, título/resumo, ≥ 1 seção, ≥ 32 guias e ≥ 3 por área;
  todo `links[].rota` existe em `lib/navegacao.ts` (importar a lista de páginas de lá); todo `guias[]` do diagnóstico existe;
  busca "ROLAMENTO" acha o guia de rolamentos em 1º; `buscarGuias("")` devolve todos; cada tipo ≥ 3 sintomas, cada sintoma
  ≥ 2 causas e ≥ 2 verificações; `diagnosticar("xyz","a")` = null). Ver falhar; implementar; ver passar.
- [ ] Commit `feat(suporte): guias técnicos, busca e diagnóstico guiado`.

### Task 2: Biblioteca técnica (armazenamento + API)

**Files:** Modify `web/lib/dados/documentos.ts` (generalizar sem quebrar a biblioteca do ativo); Create
`web/app/api/suporte/documento/route.ts`; Test `web/testes/suporte-biblioteca.test.ts`.

**Interfaces:** Consumes `Area`/`AREAS` (Task 1). Produces:
- Uma "coleção" configurável em `documentos.ts`: a do ativo (`documentos_equipamentos.json`, `app/documentos/equipamentos`)
  continua igual (assinaturas exportadas atuais intactas); nova coleção técnica `documentos_tecnicos.json`,
  `app/documentos/tecnicos/<área>`, com funções `documentosTecnicos(area?: Area)`, `gravarDocumentoTecnico(area, {titulo,
  nome, bytes}, por)`, `gravarLinkTecnico(area, {titulo, url}, por)`, `removerDocumentoTecnico(area, id, por)`,
  `lerDocumentoTecnico(area, id)` e `todosDocumentosEquipamentos(): { tag: string; doc: Documento }[]` (só leitura, para a
  listagem). Reaproveitar validações existentes (`tipoDocumento`, `linkValido`, `limparTitulo`, `LIMITE_DOCUMENTO`).
- Rota `/api/suporte/documento`: GET (`?area=&id=`) para quem vê `suporte`; POST (multipart: area, titulo, arquivo **ou** url)
  e DELETE (`?area=&id=`) só para `autorizar("suporte", true)` com checagem de origem igual à rota da biblioteca do ativo.
- [ ] Testes (validação de área, título vazio, tipo inválido pela assinatura, tamanho > limite, link inválido; permissão
  negada para leitor) no padrão de mocks dos testes de rotas existentes. Implementar; passar.
- [ ] Commit `feat(suporte): biblioteca técnica por área`.

### Task 3: Página `/suporte` + navegação + E2E

**Files:** Create `web/app/(app)/suporte/page.tsx` e `_ui/` (componentes); Modify `web/lib/navegacao.ts`
(`{ id: "suporte", titulo: "Suporte Técnico", icone: "LifeBuoy", rota: "/suporte" }` depois de Buscar — conferir que o ícone
existe no mapa de ícones do site), `web/e2e/telas.spec.ts`.

**Interfaces:** Consumes Tasks 1–2; `contexto(params)`/`dados(c)` só na visão diagnóstico com equipamento (quebras: as
funções de quebras usadas em `confiabilidade`; modos: `analisarModos` de `lib/wcm/modosFalha.ts` filtrado pelas ordens do
equipamento).
- [ ] `exigir("suporte")`; `Cabecalho` + `AbasVisao` (Guias | Diagnóstico | Biblioteca).
- [ ] Guias: campo de busca (GET `?q=`), chips de área (`?area=`), lista de cartões; `?guia=id` abre o guia com as seções e
  os links internos; guias relacionados da mesma área.
- [ ] Diagnóstico: formulário GET (`tipo`, `sintoma`, `eq` opcional); resultado com causas (numeradas), verificações,
  aviso de segurança, guias relacionados; com `eq` válido: últimas 5 quebras e top 5 modos de causa do equipamento.
- [ ] Biblioteca: lista por área com busca; formulário de envio (cliente, `fetch` para a rota da Task 2) só para quem edita;
  seção "Documentos dos equipamentos" (leitura, link para a ficha do equipamento).
- [ ] E2E: `/suporte`, `/suporte?visao=diagnostico&tipo=<primeiro>&sintoma=<primeiro>` mostra "Causas prováveis",
  `/suporte?visao=biblioteca` abre; busca `?q=rolamento` mostra o guia de rolamentos.
- [ ] Verificação completa + capturas 1280/390 em `/tmp/claude-0/-home-user/5db15329-dc38-575b-a133-cb274cfe7ed3/scratchpad/sup-*.png`.
- [ ] Commit `feat(suporte): aba Suporte Técnico`.

---

## Ajuste do usuário — acervo de referência (vale sobre a Task 2)
A biblioteca vem pré-carregada com o **acervo**: links públicos e gratuitos (manuais, catálogos, guias, normas, calculadoras)
de fabricantes e órgãos oficiais, pesquisados com Firecrawl. Só links — nunca copiar PDFs de terceiros para o repositório.
- `web/lib/suporte/acervo.ts`: `interface ItemAcervo { titulo: string; area: Area; fonte: string; tipo: "manual"|"catalogo"|"guia"|"norma"|"calculadora"|"curso"|"artigo"; idioma: "pt"|"en"|"es"; url: string; descricao: string }`
  e `ACERVO: ItemAcervo[]` gerado a partir de `/tmp/claude-0/-home-user/5db15329-dc38-575b-a133-cb274cfe7ed3/scratchpad/acervo-*.json`
  (o controlador entrega os arquivos); `buscarAcervo(q, filtros: { area?, tipo?, idioma? })` sem acento/caixa.
- Testes: URLs `https://` válidas e únicas; área/tipo/idioma válidos; título e fonte não vazios; busca acha por fonte ("SKF").
- Na página (Task 3), a visão Biblioteca mostra o acervo com filtros de área, tipo e idioma + busca, antes dos documentos enviados.
