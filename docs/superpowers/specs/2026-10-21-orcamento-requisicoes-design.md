# Aba Custos: orçamento mensal e requisições projetadas — design

**Pedido:** na aba **Custos**, digitar à mão o valor disponível de cada mês e comparar com o gasto: ordens (IW38) +
requisições, que entram no mês 30 dias (material) ou 15 dias (serviço) depois da solicitação. Requisições pendentes de
aprovação ficam fora do valor e aparecem separadas como "a entrar" no período do filtro.

**Decisões do usuário**
- Um valor disponível **por mês** (cada mês com o seu).
- Gasto do mês = **ordens IW38 + requisições** (aceito o risco de o material aparecer na ordem e na requisição).
- Material × serviço vem de uma **coluna nova** que o usuário põe no export de requisições (Fontes de dados).
- Contam: Solicitado, Ação de comprador pendente, Recebido, Parcialmente recebido (com ou sem "Enviado para RFQ").
  "Aprovação pendente" (com ou sem RFQ) = "a entrar". Rascunho e Carrinho ficam fora.

## Regras

1. **Tipo da requisição** (`prepararRequisicoes`, `lib/wcm/preparo.ts`): nova coluna lida pelo título — padrões
   `MATERIAL OU SERVI`, `TIPO DE (ITEM|COMPRA|REQ)`, `^TIPO$`, `SERVI.O/MATERIAL` (acentos e caixa ignorados, como os
   demais). Valor com "SERVI" → `"servico"`; com qualquer outro texto → `"material"`; sem coluna ou vazio → `null`.
   Campo novo `tipo: "material" | "servico" | null` em `Requisicao`.
2. **Situação** (campo novo `fase: "aprovada" | "pendente" | "fora"`): pelo status sem acento e em maiúsculas —
   começa com `APROVACAO PENDENTE` → pendente; começa com `SOLICITADO`, `ACAO DE COMPRADOR`, `RECEBIDO` ou
   `PARCIALMENTE RECEBIDO` → aprovada; o resto (Rascunho, Carrinho, desconhecido) → fora. `pendente` atual não muda.
3. **Data em que entra:** base = `enviadoEm ?? ultimoEnvio`; + 15 dias se `tipo === "servico"`, senão + 30 dias
   (`null` conta como material). Sem data base → a requisição não entra em mês nenhum (contada como "sem data").
4. **Mês do orçamento:** o mês da data em que entra.
5. **Disponível:** cadastro `metas_wcm.json`, item `orcamento:AAAA-MM` → `{ "valor": número ≥ 0 }`; apagar = remover o
   item. Nunca no código (repositório público).

## Tela (aba Custos)

Seção nova **"Orçamento do mês"** logo depois da linha de cartões de baixo (antes de "Mais detalhes"):

- **Cabeçalho com totais do período do filtro:** disponível, gasto (ordens + requisições aprovadas), saldo, "a entrar".
- **Tabela mês a mês** (meses do período do filtro, limitados a hoje + 2 meses para mostrar o que ainda vai entrar):
  Mês · Disponível · Ordens (IW38) · Requisições (aprovadas) · Saldo · A entrar (pendente). Saldo negativo em
  `--st-critico`; mês sem disponível mostra "—" no disponível e no saldo.
- **Gráfico de colunas** empilhadas (ordens + requisições) com a linha do disponível (componente `Colunas` com `meta`
  por mês, ou série extra se `meta` só aceita um número).
- **Editor do disponível** (`<details>` "Lançar valor disponível"): ano com setas, 12 campos (jan–dez) em R$, botão
  Salvar. Só aparece para quem pode editar (`podeEditar`); ação `salvarOrcamento(ano, valores)` com
  `autorizar("custos", true)`, grava em lote (`gravarCadastroLote`, `metas_wcm.json`), `null` remove o mês,
  `revalidatePath("/", "layout")`.
- **Notas fixas:** "Requisições valem para a fábrica inteira (não seguem área/centro)"; "Material baixado na ordem e
  também requisitado pode aparecer nas duas colunas"; sem coluna de tipo: "A base de requisições não tem a coluna
  material/serviço — todas contadas como material (30 dias). Inclua a coluna no export em Fontes de dados."
- Sem base de requisições: a coluna de requisições e "a entrar" somem; o resto funciona só com as ordens.

## Arquitetura

- `web/lib/wcm/orcamento.ts` — puras e testadas: `faseDaRequisicao(status)`, `tipoDaRequisicao(texto)`,
  `entradaDaRequisicao(r): Dia | null`, `orcamentoDe(cad): Map<"AAAA-MM", number>`, `orcamentoPorMes(ordens, reqs,
  disponivel, ini, fim): { linhas: {mes, disponivel, ordens, requisicoes, saldo, aEntrar}[]; totais; semData: number;
  semTipo: boolean }`.
- `web/lib/wcm/preparo.ts` — `Requisicao` ganha `tipo` e `fase`; `prepararRequisicoes` lê a coluna nova.
- `web/app/(app)/custos/_ui/Orcamento.tsx` (servidor) + `EditorOrcamento.tsx` (cliente) + `acoes.ts` ("use server",
  `salvarOrcamento`) + `validacao.ts` (`validarOrcamento`).
- Demonstração: requisições fictícias ganham tipo; orçamento fictício só no modo demo.

## Erros e casos de borda
- Requisição com total ≤ 0 não entra. Data base no futuro entra normalmente pela regra.
- "A entrar" = pendentes cuja data projetada cai em [ini do filtro, fim do filtro + o que a tabela mostrar].
- Valor digitado inválido (negativo, > 1 bilhão, texto) → mensagem e nada gravado.

## Testes
- `testes/orcamento.test.ts`: fase por status (todas as variantes, com e sem RFQ); tipo; +30/+15 com virada de mês e
  de ano; sem data; saldo; mês sem disponível; pendente em "a entrar" e fora do valor; Rascunho fora; total ≤ 0 fora.
- `testes/preparo` (ou o teste de requisições existente): coluna de tipo presente e ausente.
- Validação e permissão do `salvarOrcamento` (leitor recebe negado).
- E2E: `/custos` mostra "Orçamento do mês".
