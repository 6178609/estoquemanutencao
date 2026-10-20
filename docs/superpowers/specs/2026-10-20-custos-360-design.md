# Aba Custos no layout "Custo 360°" — design

**Pedido:** a aba **Custos** ganha o layout e o estilo de análise do print "Custo de Manutenção 360°" (faixa de KPIs,
cartão escuro do iceberg, termômetro em calendário, para onde vai o dinheiro, DNA do custo, custo por máquina × classe,
concentração e dinheiro travado no caminho), com os dados do site. O Painel principal não muda.

**Decisões do usuário**
- Na aba Custos, não no Painel WCM.
- Custo da parada = horas paradas (IW28) × **pares por hora** (um valor da fábrica) × **custo do par** (R$ 19,40 hoje).
  Os dois ficam em **Metas e parâmetros** (cadastro `metas_wcm.json`, `_parametros.custo_par` e `_parametros.pares_hora`),
  nunca no código (repositório público). Sem os dois, o iceberg mostra só as horas paradas e um aviso para cadastrar.

**Premissas (podem ser corrigidas)**
- Cores do site (verde SIM/Alpargatas e a paleta validada `--serie-*`, `--st-*`), não o azul-petróleo do print.
- Barra de filtros (período, área, setor, centro, tipo) igual à de hoje; tudo segue o recorte.
- Os gráficos e tabelas atuais da aba (custo por mês, por tipo, área, centro, Pareto e lista de ordens) continuam
  embaixo, em "Mais detalhes".

## Blocos e de onde vem cada número

Base: ordens do período (`ordensDoPeriodo`, sem canceladas), `custoReal` da IW38. Classe de cada ordem = classe do tipo
em Metas e parâmetros (Corretiva, Emergencial, Preventiva…).

1. **Faixa de KPIs** (5 cartões com filete colorido)
   - Custo total — soma do custo; variação contra o período anterior de mesma duração.
   - Custo por ativo / mês — total ÷ equipamentos ativos (IH08, não desativados) ÷ meses do período.
   - Custo médio por ordem — total ÷ ordens com custo > 0.
   - Peso do backlog (corretiva) — indicador já existente `pct_custo_corr` (custo das ordens sem plano ÷ total), com a
     régua da meta dele; o detalhe mostra a preventiva hoje.
   - Total travado — soma do bloco 8.
2. **Iceberg do custo** (cartão escuro)
   - Acima d'água: custo das ordens (o que vira nota).
   - Abaixo: indisponibilidade estimada (horas de parada das quebras do período × pares/hora × custo do par);
     horas de serviço apontadas (IW47, período); compras em requisição pendente de aprovação (R$);
     valor do estoque do almoxarifado (MB52).
3. **Termômetro de custo** — calendário do mês com o custo por dia (data da ordem); intensidade pela rampa `--seq-*`;
   setas de mês (`?cmes=AAAA-MM`), alternância Mensal/Anual (`?cvis=anual`: 12 meses em mosaico); total do mês e
   variação contra o mesmo mês do ano anterior.
4. **Para onde vai o dinheiro** — blocos por classe agrupada (Corretiva, Preventiva/planejada, Emergencial/avaria,
   Outras): valor, % do total, nº de ordens e R$/ordem; régua "custo planejado hoje × meta" (meta = 100% − meta de
   `pct_custo_corr`) e alerta com o valor em emergencial.
5. **DNA do custo** — mosaico (treemap simples em grade) do custo por família de máquina (nome do equipamento sem o
   número final, a mesma regra de `familia()` do Roadmap SIM); 5 maiores + "demais".
6. **Custo por máquina × classe** — custo médio por equipamento em cada criticidade ABC da IH08 (A, B, C, sem classe):
   colunas arredondadas, linha tracejada da média da fábrica, laranja quando acima da média.
7. **Concentração** — "X% do custo está em 10% dos equipamentos"; duas barras (ativos × custo); top 4 equipamentos com
   custo e R$/ordem.
8. **Dinheiro travado no caminho** — etapas numeradas, cada uma com contagem, valor e barra:
   1. Requisições aguardando aprovação (requisições `pendente`, soma do total).
   2. Ordens abertas/liberadas com custo já lançado (situação Aberta ou Liberada, custo > 0).
   3. Ordens encerradas sem confirmação com custo (situação "Encerrada sem confirmação").
   4. Ordens concluídas no período sem custo lançado (contagem — custo que pode não ter sido apropriado).
   Etapa sem dado (ex.: sem a base de requisições) não aparece.

## Arquitetura

- `web/lib/wcm/custo360.ts` — funções puras (sem React), testadas: `kpis360`, `iceberg`, `porDia`/`porMesAno`,
  `porClasse`, `dnaPorFamilia`, `porCriticidade`, `concentracao`, `travado`. Entradas: ordens do período, equipamentos,
  notas/quebras, confirmações, requisições, estoque e os dois parâmetros.
- `web/app/(app)/custos/_ui/` — um componente por cartão (`Kpis360`, `Iceberg`, `Termometro`, `ParaOnde`, `Dna`,
  `PorClasse`, `Concentracao`, `Travado`), servidor sempre que possível (o termômetro troca de mês por link).
- `web/app/(app)/custos/page.tsx` — monta a grade: KPIs; linha 2 (iceberg | termômetro | para onde); linha 3 (DNA |
  classe | concentração | travado); depois "Mais detalhes" com o conteúdo atual.
- Metas e parâmetros: editor "Custo da produção parada" (custo do par em R$ e pares/hora), ação `salvarCustoParada`
  gravando `_parametros` como a jornada; leitura `custoParadaDe(cad)` em `indicadores.ts`.
- Demonstração: os parâmetros vazios; o iceberg mostra horas e o aviso. Dados fictícios.

## Erros e casos de borda
- Sem IW38: aviso atual ("SemDados"). Sem IH08: custo por ativo e por classe mostram "—" com dica.
- Sem notas/parada, IW47, requisições ou MB52: a linha do iceberg/etapa some (nunca zero falso).
- Mês sem custo no termômetro: dias em cinza "–".

## Testes
- `testes/custo360.test.ts` com dados fictícios: cada função (totais, classe, família, ABC/média, 10%/concentração,
  etapas do travado, custo da parada com e sem parâmetros, calendário mensal e anual).
- E2E: `/custos` abre sem erro; troca de mês do termômetro; Metas salva os parâmetros (unidade).
- Conferência no navegador em computador e celular (sem rolagem horizontal).
