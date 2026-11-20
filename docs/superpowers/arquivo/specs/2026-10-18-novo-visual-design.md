# Novo visual da Central de Manutenção — marca SIM + espectro Alpargatas (caminho B)

Data: 2026-10-18 · Prévia aprovada: https://claude.ai/artifact/EuX5scabBMC8d2VRSBarZz (caminho B)

## Objetivo

Deixar a marca bem presente (verde SIM como cor principal, espectro Alpargatas em status e gráficos) e reorganizar as
telas mais usadas para o uso real, **igualmente bom no computador (PCM/líderes) e no celular/tablet (fábrica)**.

O que o usuário pediu: "refazer o design do site com base nas cores das logos", usando a skill de UX
(`ui-ux-pro-max`); escolheu "marca bem presente", "computador e celular por igual" e o caminho B (tema no site todo +
reorganização tela a tela).

Fora do escopo: regras de cálculo, dados, permissões, rotas e nomes das abas — nada disso muda.

## Critérios de sucesso

- Todas as telas com o tema novo (claro e escuro), sem nenhuma tela "no visual antigo".
- Contraste de texto ≥ 4,5:1 (≥ 3:1 em texto ≥ 24 px); foco do teclado visível; `prefers-reduced-motion` respeitado.
- Alvos de toque ≥ 44 px no celular, ≥ 8 px entre eles; nada de rolagem horizontal da página (só dentro de tabelas).
- Testado em 375, 768, 1024 e 1440 px nas telas das ondas 2–5.
- `tsc`, `vitest` e `next build` verdes em cada onda; deploy de produção READY conferido.

## Onda 1 — tema da marca (caminho A, todas as telas de uma vez)

Só peças compartilhadas; as páginas não são editadas uma a uma.

**Cores (`web/app/globals.css`)** — só das logos:

| Papel | Claro | Escuro |
|---|---|---|
| Marca (destaques grandes, logo) | `#009C48` verde SIM | `#22B068` |
| Ação (botão principal, links, foco de seleção) | `#007A38` (texto branco 5,4:1) | `#22B068` (texto `#06140B`) |
| Menu lateral | `#06331F` / ativo `#0B4A2C`, marcador lima `#A8C024` | `#072A18` / `#0E3D24` |
| Fundo / superfície / borda | `#F4F6F4` / `#FFFFFF` / `#E2E7E3` | `#0B110D` / `#121A15` / `#24302A` |
| Texto / apoio / terciário | `#111311` / `#45494B` / `#6D6E71` (cinza SIM) | `#F1F5F2` / `#B8C4BD` / `#8D9A92` |
| Status bom · atenção · sério · crítico · info | fundo `#E3F5EA` `#FFF4D6` `#FDEBDD` `#FDE8E9` `#E2EEF8`; texto `#00632D` `#7A5600` `#9A4705` `#A4111A` `#005799` | equivalentes escuros (prévia) |
| Faixa da marca (topo) | vermelho, laranja, amarelo, lima, verde, ciano, azul Alpargatas, 5 px | igual |
| Foco do teclado | contorno 3 px `#6CCCF0` (celeste) | igual |

- Os tokens atuais (`--fundo`, `--superficie*`, `--borda*`, `--texto*`, `--tinta*`, `--st-*`, `--serie-*`, `--seq-*`)
  continuam com o mesmo nome; mudam os valores. `--tinta` (botão principal) passa de preto para o verde de ação.
  Séries de gráfico e escalas sequenciais seguem a paleta já validada (método da skill `dataviz`), sem perder ordem.
- Status sempre com texto (selo "Crítico"), nunca só cor.

**Tipografia**: títulos continuam Space Grotesk; texto passa de Inter para **IBM Plex Sans** (400/500/600, via
`next/font`), números tabulares em tabelas e indicadores. Corpo 15 px, mínimo 12 px.

**Componentes (`web/components/ui.tsx`, `Shell.tsx`, `Campos.tsx`, `graficos.tsx` só cores)**:

- `Shell`: menu lateral verde-escuro com a logo SIM num selo branco, grupos com rótulo em caixa alta, item ativo com
  marcador lima; faixa da marca no topo do conteúdo; barra superior com caminho (grupo › aba), busca e tema. Celular:
  barra verde com menu (gaveta), logo e busca; botões ≥ 44 px.
- `Cabecalho`/`Titulo`: sobretítulo verde em caixa alta, título em dois tons (segunda parte em verde de ação).
- `Kpi`/`FaixaNumeros`: cartão com ícone num quadrado colorido (cores Alpargatas suaves), valor grande, selo de status
  + meta.
- `Selo`: as cinco cores de status acima + cinza "sem dado".
- `BOTAO_PRIMARIO` verde de ação; `BOTAO_SECUNDARIO` borda neutra; botão de perigo `#B5121B`.
- Campos: rótulo visível em cima, ajuda embaixo, erro em vermelho perto do campo, altura ≥ 44 px, `inputmode` numérico.
- Tabelas: rolagem horizontal só dentro do quadro, cabeçalho em caixa alta pequena, linha com destaque ao passar o mouse.
- Esqueleto de carregamento, tema escuro e impressão continuam funcionando.

## Ondas 2–5 — reorganização das telas mais usadas

Cada onda é um PR próprio, com testes, revisão do Opus e deploy conferido. Ordem (pode mudar a pedido do usuário):

**Onda 2 — Início (`app/(app)/page.tsx`)**
- Topo: data + saudação; título "Isto pede atenção agora."; busca global grande (a busca que já existe em `/busca`).
- Cartões de alerta (só os que a pessoa pode ver): ordens atrasadas (com quantas de prioridade alta), materiais abaixo
  do mínimo/zerados (já calculado hoje), reciclagens vencendo em 60 dias (`treinamentos.reciclagens`). Cada cartão
  leva à lista já filtrada. Sem alerta: "Tudo em dia".
- "Suas abas" em cartões (ordem atual da navegação; "mais usadas primeiro" fica para depois, pois exigiria registrar
  uso).
- Quadro "A semana em números" (aderência, concluídas, HH disponível, pessoas fora) só para quem vê essas abas.
- O bloco atual "Almoxarifado agora" vira o alerta de estoque + atalho.

**Onda 3 — Estoque (`app/(app)/estoque`)**
- Celular: busca fixa no topo; filtros de um toque (Todos · Abaixo do mínimo · Zerados, com contagem); cada material
  vira cartão (descrição, código, depósito, saldo grande, mínimo, barra de cobertura, selo). Toque abre a ficha técnica.
- Computador: mantém a tabela, com os mesmos filtros rápidos em pílulas.

**Onda 4 — Ordens (`app/(app)/ordens`)**
- Celular: filtros numa gaveta ("Filtros · N"); linha-resumo do recorte; cada ordem vira cartão (campo de ordenação,
  prioridade, atraso, tipo, equipamento); ao tocar, abre no próprio cartão com as operações e o link do histórico do
  equipamento.
- Computador: tabela atual com o tema novo; detalhe continua como hoje.

**Onda 5 — Pessoas (`gestao_hh`, `treinamentos_ferias`)**
- Celular: listas em cartões, formulário de ausência em uma coluna, botões de ação fixos embaixo.

## Como cada onda é feita e verificada

- Consultar a skill `ui-ux-pro-max` (domínios `ux`, `chart`, `color`) para cada tela; seguir as regras de contraste,
  toque e responsividade dela.
- Sem lógica nova de cálculo: as telas reorganizadas usam as mesmas funções de `lib/` que já têm testes. Lógica nova
  pequena (ex.: contagem de alertas do Início) ganha teste em `web/testes/`.
- Antes de publicar: `cd web && npx tsc --noEmit && npx vitest run && npx next build`; olhar as telas no navegador
  (Playwright, modo demonstração) em 375 e 1440 px, claro e escuro; revisão do Opus no diff.
- Publicar: PR → merge → conferir deploy READY na Vercel.

## Riscos

- Mudar valores de tokens afeta todas as telas de uma vez: conferir no navegador as telas com gráficos e tabelas
  densas (Painel, Confiabilidade, Custos, Programação semanal) antes do merge da onda 1.
- Fonte nova muda largura do texto: conferir quebras em cabeçalhos e tabelas.
- Dados reais nunca entram em testes nem em capturas de tela no repositório.
