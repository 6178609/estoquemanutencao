# Aba "Cadastro de material": pedidos com aprovação em sequência

Data: 10/11/2026. Pedido do PCM. Desenho aprovado no chat ("Seguir").

## Objetivo

Registrar no site os **pedidos de cadastro de material** do almoxarifado, do lançamento até o material chegar e ser
validado. A tela segue o estilo da aba **Cartão de crédito**: lançamentos em cartões, anexo de foto, situação por etapa
e indicadores no topo. A aprovação é em sequência:

1. o **Almoxarifado** aprova o pedido;
2. o **Almoxarifado** marca a chegada e anexa a foto do material recebido;
3. o **PCM** compara as fotos e valida.

## Decisões do usuário

| Tema | Decisão |
|---|---|
| Quem aprova | Marcado em **Usuários**: "Aprova como Almoxarifado" e "Aprova como PCM". Pode haver várias pessoas em cada. Independe da função. |
| Quem lança e vê | **Todos que têm a aba** lançam e veem **todos** os pedidos. |
| Número SAP | **Quem lança informa** (obrigatório no lançamento). |
| Foto de validação | **O Almoxarifado anexa** ao marcar a chegada; o **PCM valida**. |
| Equipamento | Escolhido da **lista de equipamentos**. Ao validar a chegada, o material é **ligado ao equipamento** automaticamente. |

## Acesso

- Nova aba `cadastro_material` ("Cadastro de material", ícone `PackagePlus`), no grupo **Custos e suprimentos**, logo
  após "Requisições".
- Segue a regra única da lista de abas (`abasDoUsuario`):
  - Líder e Analista sem lista própria veem a aba (padrão da função);
  - para quem tem lista própria, o administrador marca a aba.
- Manutentor e Terceiro também lançam, se tiverem a aba na lista.
- Aprovadores: dois campos novos no cadastro do usuário (`usuarios.json`), `aprova_almox` e `aprova_pcm`, booleanos,
  editados em Usuários só pelo administrador.
  - Quem não tem a aba não aprova, mesmo marcado.
  - Terceiro não pode ser marcado (função externa). Manutentor pode.

## Dados

- Cadastro `pedidos_cadastro_material.json`, gravado com `gravarCadastroLote`, que já faz a cópia de segurança e o
  controle de versão. Uma chave por pedido (id aleatório de 18 caracteres hexadecimais).
- Fotos em `app/documentos/pedidos_material/<pedido>/<arquivo>`, no mesmo esquema dos cupons do cartão:
  - arquivo novo a cada envio, nunca por cima;
  - JPG, PNG ou WEBP, até o limite de documento atual;
  - lidas por uma rota autenticada.
- Campos do pedido:
  - `descricao`: obrigatória, de 5 a 200 caracteres.
  - `equipamento`: tag e nome. A tag precisa existir na lista de equipamentos.
  - `sap`: obrigatório, só dígitos, de 5 a 12. Mostra a descrição do catálogo quando o código existe; quando não existe,
    só avisa e não bloqueia.
  - `observacao`: opcional, até 500 caracteres.
  - `foto`: obrigatória no lançamento.
  - `foto_chegada`: obrigatória para marcar a chegada.
  - `situacao`.
  - `historico`: lista de `{ em, por, acao, motivo? }`.
  - `criado_por` e `criado_em`.

## Situações e transições

| De | Ação | Quem | Para |
|---|---|---|---|
| (novo) | Lançar | quem tem a aba | **Aguardando almoxarifado** |
| Aguardando almoxarifado | Editar ou excluir | quem lançou | (a mesma) ou removido |
| Aguardando almoxarifado | Aprovar | Almox | **Aguardando chegada** |
| Aguardando almoxarifado | Recusar (motivo obrigatório) | Almox | **Recusado** (final) |
| Aguardando chegada | Marcar chegada + foto de validação | Almox | **Aguardando PCM** |
| Aguardando PCM | Validar | PCM | **Concluído** (final) + vínculo ao equipamento |
| Aguardando PCM | Recusar (motivo obrigatório) | PCM | **Aguardando chegada** (o Almox resolve e anexa nova foto) |

- Qualquer outra transição é recusada no servidor, mesmo que a tela tente fazê-la.
- A regra é conferida de novo dentro da gravação, porque outra pessoa pode ter mudado o pedido no meio.
- Ao validar, o código SAP entra em `materiais` do equipamento em `cadastro_equipamentos.json` (sem duplicar), com
  registro na auditoria.
- Administrador não aprova por ser administrador: precisa estar marcado como aprovador, como qualquer pessoa.

## Tela

- **Cabeçalho** no padrão do site.
- **Indicadores no topo:**
  - Aguardando almoxarifado;
  - Aguardando chegada;
  - Aguardando PCM;
  - Concluídos no mês.
- **Filtros:** situação, mês do lançamento e busca por descrição, SAP ou equipamento.
- Para um aprovador, a lista começa pelo que espera por ele.
- **"Novo pedido"**: formulário com os campos da seção Dados, foto pela câmera do celular e equipamento com busca.
- **Cartão do pedido:**
  - foto, descrição, SAP, equipamento e selo da situação;
  - linha do tempo das etapas (quem, quando, motivo);
  - só os botões que valem para quem está vendo;
  - na etapa do PCM, foto do pedido e foto da chegada lado a lado.
- **Planilha (Excel)** dos pedidos filtrados.
- Funciona no celular (390 px, sem rolagem lateral), com textos acessíveis às fotos, aos botões e aos selos.

## Arquivos (previstos)

- `lib/cadastroMaterial/regras.ts`: tipos, validação e transições (funções puras).
- `lib/cadastroMaterial/dados.ts`: leitura e gravação, fotos e vínculo ao equipamento.
- `app/(app)/cadastro_material/`: página, formulários e ações.
- `app/api/cadastro_material/`: foto e planilha.
- Mudanças em:
  - `lib/navegacao.ts`;
  - `lib/auth/usuarios.ts` e a tela de Usuários (marcações de aprovador);
  - demonstração (`lib/dados/demo.ts`) com pedidos fictícios.

## Testes

- **Unitários** (`testes/cadastroMaterial.test.ts`):
  - validação dos campos;
  - cada transição permitida e proibida, por papel;
  - motivo obrigatório;
  - corrida de duas aprovações ao mesmo tempo;
  - vínculo ao equipamento sem duplicar;
  - aprovador sem a aba não aprova.
- **E2E** (`e2e/cadastro_material.spec.ts`, modo demonstração): lançar, aprovar, marcar a chegada e validar, com dados
  fictícios. Inclui o celular a 390 px.
- **Segurança:** a foto só é servida a quem tem a aba; o tipo do arquivo é conferido pelo conteúdo; o tamanho é limitado.
  Nenhum dado real da empresa entra nos testes.

## Fora do escopo

- Aviso por e-mail aos aprovadores. Fica para depois, quando o SMTP estiver configurado na Vercel.
- Criar o material no SAP. O site só registra o pedido e o código informado.
