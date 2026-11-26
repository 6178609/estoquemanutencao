# Custo dos materiais (preço médio) — 26/11/2026

Pedido do usuário: "segue planilha com o valor dos materiais de almoxarifado" (export do SAP com o preço médio e o standard).

## Base
- Tipo `custo_material`, nome "Custo dos materiais (preço médio)", destino `bases/CUSTO_MATERIAL.parquet`, enviado em Fontes de dados.
- Reconhecida pelos cabeçalhos (`identificar` em `web/lib/leitura/tipos.ts`, antes da MB52): `Material` + coluna de preço
  (`Moving Average Price`, `Preço médio`, `Prç.médio`, `Prç.standard`, `Preço standard`, `Standard price`). Uma MB52 com a coluna
  de valor (`Valor utiliz.livre`) continua MB52.
- Recorte no navegador (`web/lib/leitura/custoMaterial.ts`, `recortarCusto`): só Material (sem zeros à esquerda), Descrição, UM,
  Preço médio, Preço standard, Classe de avaliação, Tipo de material, Depósito, Utilização livre, Tipo de MRP e Tipo de suprimento,
  com nomes fixos e números normalizados. Centro de lucro, planejador MRP e o nome dele não saem do computador.
- Texto de ajuda em Fontes de dados (`AJUDA_BASE`): exportar a lista de materiais com preço (ex.: MM60 ou MB52/ME2M com o preço).
  Aviso no envio sem a coluna de preço médio. Alerta de desatualizada com 35 dias (atualização mensal).

## Leitura
- `web/lib/dados/custoMaterial.ts` (puro): `prepararCusto` → material → { preco, precoMedio, precoStandard, um }. Vale o preço
  médio; zerado/vazio, o standard; os dois zerados = "sem preço" (null). Valores não são corrigidos: aparecem como vieram. O mesmo
  material em mais de uma linha: fica o primeiro preço que existir. `valorDe` multiplica só com a mesma UM (PC = UN = ST).
- `web/lib/dados/custo.ts`: `custoMateriais()` pelo `lerBase` (cache pela versão do arquivo, sem montar `bases()`); na
  demonstração, `custoDemo()` (preços fictícios dos materiais fictícios, alguns sem preço).

## Quem vê
- `podeVerValores(u)` em `web/lib/auth/acesso.ts` = vê a aba `custos` pela regra de abas. Quem não vê não recebe preço nem
  valor no navegador (nem o valor da MB52 no Estoque) nem nas planilhas.

## Telas (sem a base, nada muda: as colunas somem)
- Estoque (Almoxarifado): preço e valor em estoque (saldo MB52 × preço) na linha e no detalhamento; total do valor em estoque da
  lista filtrada (com quantos sem preço); ordenação "Maior valor" pelo valor em estoque; CSV com Preço médio e Valor em estoque.
- UBM: valor do kit por armário (padrão × preço) na Visão geral e em Armários; Preço médio e Valor na lista de reposição
  (separar × preço) e no Excel dela; KPI "Valor das retiradas" na Análise. UM do kit diferente da UM do SAP: sem valor.
- Machine Ledger: Preço médio e Valor est. seg. (estoque de segurança Almox × preço) nas peças da máquina e no Excel delas; no
  pente fino, "Estratégico sem saldo" (e estocagem recomendada) mostra o preço e o valor; Excel dos achados com as colunas.
- Formatação em R$ pt-BR (`brl`, Intl).

## Testes
- `web/testes/custoMaterial.test.ts` (reconhecimento, recorte, processar → parquet → preparo, preço/valor, UBM, Machine Ledger,
  `podeVerValores`, demonstração) e `web/e2e/custo.spec.ts`.
