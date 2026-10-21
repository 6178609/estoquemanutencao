# Visualizador 3D de falhas (aba Suporte Técnico) — design

**Pedido:** no resultado do diagnóstico, uma representação 3D do equipamento com zoom na peça onde está o problema
(ex.: gaiola do rolamento danificada → rolamento em 3D, câmera aproxima da gaiola, peça destacada e explicada).
**Decisões do usuário:** modelos esquemáticos e didáticos (não fotorrealistas); os 8 equipamentos de uma vez.

## Comportamento
- Aparece no resultado do **Diagnóstico** (visão `diagnostico` com `tipo` + `sintoma`) e na página do **Guia** quando o guia
  tem um modelo ligado. Tipos do diagnóstico sem modelo próprio não mostram o bloco (nada quebra).
- Cena: equipamento montado, girando devagar; lista de **marcadores** do sintoma (um por causa provável que tem peça
  associada). Selecionar um marcador (lista ao lado/abaixo ou clique na peça) → câmera faz **zoom suave** na peça, peça em
  **vermelho** (`--st-critico`), demais peças semitransparentes, etiqueta com nome da peça + o que acontece + por quê.
- Controles: girar (arrastar/toque), zoom (roda/pinça), botões **Montado / Vista explodida**, **Recentrar**, **Pausar giro**.
  Respeita `prefers-reduced-motion` (sem giro automático, transições curtas).
- Acessibilidade: a lista de marcadores é HTML (botões com texto) — a cena é complemento; `aria-label` no canvas; sem WebGL
  → mensagem "Visualização 3D indisponível neste navegador" e a lista continua útil.
- Desempenho: three.js só carrega no cliente e só quando o bloco entra na tela (`next/dynamic` com `ssr: false` +
  IntersectionObserver); geometrias por primitivas (cilindro, toro, caixa, esfera, extrusões simples), sem arquivos
  externos; `frameloop="demand"` quando parado.

## Modelos (esquemáticos, peças nomeadas)
1. **Rolamento:** anel externo, anel interno, esferas, gaiola, vedação/blindagem, pista externa, pista interna.
2. **Motor elétrico:** carcaça aletada, tampas, estator (bobinas), rotor, eixo, rolamentos dianteiro/traseiro, ventilador,
   tampa do ventilador, caixa de ligação.
3. **Redutor:** carcaça, engrenagem/pinhão, coroa, eixo de entrada, eixo de saída, rolamentos, retentores, nível de óleo.
4. **Correia e polias:** polia motora, polia movida, correia (V), eixos, tensor.
5. **Bomba centrífuga:** voluta, rotor, eixo, selo mecânico, rolamentos, acoplamento, sucção/recalque.
6. **Cilindro pneumático:** camisa, haste, êmbolo, vedações do êmbolo, vedação da haste, cabeçotes, amortecimento, conexões.
7. **Válvula solenoide:** corpo, carretel, bobina, molas, vedações, escapes, acionamento manual.
8. **Esteira/transportador:** tambor de acionamento, tambor de retorno, roletes, correia, raspador, mancais, esticador.

## Ligação com o diagnóstico
- Mapa `tipo de equipamento → modelo` e, por sintoma, os **marcadores** `{ peca, titulo, explicacao }` (ex.: rolamento +
  ruído → gaiola: "Gaiola quebrada ou desgastada — falta de lubrificação, sobrevelocidade ou montagem errada";
  pista externa: "Lascamento (spalling) por fadiga ou sobrecarga").
- Todo marcador aponta para uma peça que existe no modelo (teste).

## Arquitetura
- `web/lib/suporte/modelos3d.ts` (puro, testado): `MODELOS` (id, título, lista de peças `{ id, nome }`), `MODELO_DO_TIPO`,
  `MARCADORES[tipo][sintoma]`, `marcadoresDe(tipo, sintoma)`.
- `web/app/(app)/suporte/_ui/3d/` (cliente): `Visualizador3D.tsx` (Canvas, câmera, controles, foco, destaque, explodir),
  um arquivo por modelo (`Rolamento.tsx`, `Motor.tsx`, …) que monta as peças nomeadas e recebe `{ destaque, explodir }`.
- Dependências novas (MIT): `three`, `@react-three/fiber` (React 19), `@react-three/drei`, `@types/three` (dev).

## Testes
- Unidade: todo tipo com modelo tem marcadores para todos os seus sintomas; toda peça citada existe; ids únicos.
- E2E: diagnóstico de rolamento + ruído mostra o bloco "Visualização 3D" e a lista de marcadores; clicar num marcador mostra
  a explicação. Captura em 1280 e 390 px (sem rolagem lateral).
