# Histórico de retiradas pela IW13 na aba Estoque (27/11/2026)

Pedido do usuário: "Dentro da aba Estoque, consegue passar o histórico de retirada de itens pela IW13".

## O que aparece
- **Detalhamento do material** (Material do almoxarifado e Material cadastrado): seção "Histórico de retiradas (IW13)" com
  - resumo dos **últimos 12 meses** (o mês corrente e os 11 anteriores, inteiros, pelo dia de Brasília da data de lançamento):
    total líquido retirado, média/mês (total ÷ 12), último consumo (a retirada mais recente, de qualquer época) e nº de ordens;
  - barras mês a mês (12 barras, cor `--serie-1`, valor no rótulo acessível/título; a tabela é a alternativa acessível);
  - tabela de todas as linhas do material, da mais recente à mais antiga, 50 por vez com "Ver mais": data, ordem + tipo
    (IW38), equipamento + denominação (IH08) ou texto da ordem, quantidade e UM; selos **Quebra** (regra do site,
    `ordensDeQuebra` da UBM: YM11/nota de quebra), **Devolução** e **Veio da UBM · armário** / **Veio do Almox**
    (validação do líder em `ubm_validacoes.json`; "UBM" vence quando a mesma ordem|código tem as duas);
  - **valor** (quantidade × preço médio atual da base `custo_material`) só para quem `podeVerValores`: o servidor nem manda
    o campo para os outros (cartão "Valor em 12 meses", coluna e total somem);
  - botão Excel (CSV) do histórico do material (`retiradas_iw13_<código>.csv`).
  - Sem IW13 carregada: "Envie a IW13 em Fontes de dados".
- **Lista do almoxarifado**: "consumo 12 m" em cada material, ordenação "Maior consumo 12 m" e a coluna no CSV da lista
  (só com a IW13 carregada).

## Estornos (decisão)
Tomados > 0 = retirada; **Tomados < 0 = devolução/estorno**: entra como linha negativa (selo "Devolução") e **abate** do
consumo (totais líquidos; o cartão mostra quanto foi abatido). Tomados = 0 (só reserva) não entra. Linhas sem material
não entram (não há a quem atribuir). Linhas sem equipamento entram (o consumo é por material).

## Desempenho e acesso
- A IW13 vem do mesmo `lerBase` do consumo (`lib/dados/consumo.ts`, cache pela versão do arquivo); `prepararConsumo`
  passou a separar `devolucoes` (Tomados < 0). O índice por material e o consumo de 12 meses ficam presos à identidade
  dos dados da base e ao dia (`lib/dados/historicoIw13.ts`). IW38/IW28/IH08 só pelo `ordensDeQuebra` (lerBase, sem `bases()`).
- O detalhamento busca só as linhas do material em `GET /api/estoque/historico?m=<código>` (`autorizar("estoque")`).

## Arquivos
Regras puras `web/lib/estoque/historicoIw13.ts`; demonstração `web/lib/estoque/demo.ts` (IW13 fictícia: retiradas nas
ordens fictícias, uma devolução e as linhas das validações fictícias da UBM); servidor `web/lib/dados/historicoIw13.ts`;
tela `web/app/(app)/estoque/HistoricoRetiradas.tsx`. Testes `web/testes/estoqueHistorico.test.ts` e
`web/e2e/estoque_historico.spec.ts`.
