# Aba UBM — Unidade Básica de Manutenção (design)

Pedido do usuário (22/11/2026). Infográfico da proposta: `docs/propostas/UBM_infografico.png`.

## Intenção
A UBM é um armário industrial em campo com itens estratégicos do Almox, para o manutentor não perder tempo indo ao
almoxarifado (reduzir o MTTR). A aba registra cada retirada (por QR code colado no armário) e mostra ao planejamento o que
repor, além de analisar as saídas.

## Objetivos
- QR de **retirada** por armário → formulário no celular: **Ordem, Turno, Código do material, Quantidade (padrão 1),
  Descrição do uso, Foto do material** (foto obrigatória, câmera do celular). Quem retirou = usuário logado.
- QR de **solicitação** por armário → formulário: tipo (`acabou` = item acabou ou está no fim; `faltando` = item que
  deveria estar no armário; `reposicao` = pedido de reposição ao Almox), código (opcional para `faltando` quando não
  souber), quantidade, observação, foto opcional.
- **Ordem e código nunca travam** (pedido do usuário): ordem procurada na IW38 e código no catálogo do Sysmat só para
  mostrar a descrição/equipamento; se não achar, grava assim mesmo com a marca "não encontrada na base" e a análise associa
  quando a base atualizar (a associação é feita na leitura, não gravada).
- Cadastro de armários (editores): id (UBM-01…), nome, local/linha, itens do kit (código, mínimo, máximo).
- **Saldo** por armário e item: saldo = abastecido (registros de reposição) − retirado. Abaixo do mínimo → lista de
  reposição com a quantidade a separar (máximo − saldo). Planejamento registra a reposição (quantidade por item) → saldo volta.
  Também registra uma contagem (inventário) que fixa o saldo do item naquele momento.
- **Análise**: saídas por material (ranking, quantidade), por turno, por equipamento/ordem, por armário, por semana;
  itens do kit parados (sem saída em 90 dias); itens retirados que não estão no kit (candidatos a entrar);
  solicitações abertas; retiradas sem ordem na IW38. Filtros: armário, período.
- Lista de retiradas com foto (miniatura), Excel (exportar retiradas e lista de reposição), página de impressão dos QR
  (etiqueta por armário, A4).

## Não-objetivos
- Não baixa estoque no SAP nem gera reserva automática (só a lista para o planejamento).
- Sem acesso sem login: o QR abre o site; quem não está logado entra e volta ao formulário.

## Restrições (CLAUDE.md)
- Acesso só pela lista de abas (nova aba `ubm`, grupo "Custos e suprimentos"); Líder/Analista veem por padrão; gravar
  retirada/solicitação: quem vê a aba (inclusive Manutentor/Terceiro se o administrador liberar a aba); cadastro de
  armários, reposição e contagem: `podeEditar` e fora de Terceiro/Manutentor.
- Dados no repositório de dados: cadastros `ubm_armarios.json` e `ubm_movimentos_<AAAA-MM>.json` (um por mês de Brasília; a leitura junta todos) (gravação por gravarCadastroLote),
  fotos em `app/documentos/ubm/<movimento>/<arquivo>` (mesmo padrão do Cadastro de material). Demonstração com dados
  fictícios na memória. Nada de dados da empresa no repositório público.
- Auditoria: `ubm_retirada`, `ubm_solicitacao`, `ubm_reposicao`, `ubm_armario`.
- Verificação: tsc, vitest, eslint, build, playwright; revisão do Opus antes de publicar.

## Abordagens consideradas
1. **Aba no site com rotas de formulário próprias (escolhida)** — mesmo login, mesmas bases (IW38, Sysmat), mesma
   auditoria; o QR aponta para `/ubm/retirada?u=<id>`.
2. Formulário externo (Google/Microsoft Forms) — sem login nem conferência com as bases; dados fora do site. Descartada.
3. Página pública sem login com token no QR — mais rápida no campo, mas qualquer um com a foto do QR grava; o líder já tem
   usuário. Descartada.

## Decisões do construtor (Claude)
- QR gerado no servidor como SVG (pacote `qrcode`, MIT), apontando para o endereço do site (`URL_SITE`/`URL_SITE_ATUAL`
  ou a origem da requisição).
- Turnos: 1º, Administrativo, 2º (como o Controle de HH), mais "3º" se aparecer.
- Celular primeiro: o formulário de retirada cabe numa tela de 390 px, campos grandes, câmera via `capture="environment"`.
