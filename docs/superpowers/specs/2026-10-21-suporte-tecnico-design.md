# Aba "Suporte Técnico" — design

**Pedido:** uma aba com informações de todas as áreas da manutenção, sem custo (a opção com IA foi descartada: a API é paga).
Aprovado pelo usuário: base de conhecimento + diagnóstico guiado + biblioteca técnica.

## Blocos

1. **Guias (base de conhecimento fixa, escrita no código)** — conteúdo técnico genérico em pt-BR (nada da empresa: o
   repositório é público). Áreas: Mecânica, Lubrificação, Elétrica, Pneumática e hidráulica, Segurança, Métodos (TPM/WCM, 5
   Porquês, Ishikawa, AF, FMEA, PDCA/Kaizen), PCM e SAP (tipos de ordem YM01…YM13 como o site usa, transações IW31/IW32/IW33/
   IW38/IW39/IW47/IW28/IW21/IP19/IP10/IA05/IA06/IH08/MB52/ME5A, fluxo nota → ordem → confirmação → encerramento),
   Indicadores (MTBF, MTTR, disponibilidade, backlog, aderência, custo — fórmula e link para a aba do site que mostra).
   Cada guia: título, área, resumo, e seções opcionais *Sintomas*, *Causas prováveis*, *O que verificar* (em ordem),
   *Ação recomendada*, *Boas práticas*, *Links no site* (rotas internas). Busca sem acento por título, resumo, palavras-chave
   e corpo, com nota por relevância.
2. **Diagnóstico guiado** — o usuário escolhe o tipo de equipamento (motor elétrico, rolamento/mancal, redutor, correia/polia,
   bomba, cilindro pneumático, válvula/solenoide, unidade hidráulica, inversor de frequência, painel/comando, compressor,
   esteira/transportador, aquecimento/resistência, sensor) e o sintoma (lista do tipo: aquecimento, ruído, vibração,
   vazamento, não liga, desarma, perda de força/pressão, lento, desgaste…). Resposta: causas prováveis em ordem de
   frequência, verificações em ordem, segurança antes de intervir (LOTO quando couber) e guias relacionados. Se o usuário
   informar um equipamento do site (código ou nome), mostra também as últimas quebras dele (IW28) e os modos de causa mais
   citados nos apontamentos das ordens dele (IW47, `analisarModos`) — dados que já existem no site.
3. **Biblioteca técnica** — manuais, POPs, desenhos e catálogos (PDF/imagem até ~4 MB, ou link) por área. Reaproveita a
   biblioteca do ativo (`lib/dados/documentos.ts`), generalizada: cadastro `documentos_tecnicos.json`, arquivos no repositório
   de dados privado em `app/documentos/tecnicos/<área>/<id>`. A lista mostra também os documentos já anexados aos
   equipamentos (biblioteca do ativo), só para leitura com link para o equipamento. Busca por título/área/equipamento.
   Envia e apaga quem é editor/administrador e vê a aba; todos com acesso consultam.

## Acesso e navegação
- `id: "suporte"`, título "Suporte Técnico", rota `/suporte`, grupo Visão geral (depois de Buscar). Aba nova: liberada 100%
  para Líder e Analista e bloqueada para as demais funções (regra única de `lib/auth/acesso.ts`; nada a mudar lá).
- Página com três visões (`?visao=guias|diagnostico|biblioteca`, padrão guias), no padrão `AbasVisao` do site.

## Erros e bordas
- Busca sem resultado: mensagem e sugestões de áreas. Guia inexistente (`?guia=`) volta à lista.
- Diagnóstico sem combinação conhecida: mostra os guias da área do equipamento.
- Equipamento informado inexistente ou sem dados: só o diagnóstico genérico. Sem IW28/IW47: o bloco de dados some.
- Biblioteca: tipo de arquivo inválido, tamanho acima do limite, título vazio → mensagem; demonstração guarda só na memória.

## Testes
- Conteúdo: todo guia tem id único, área válida, título, resumo e ao menos uma seção; todo link interno aponta para uma rota
  existente em `lib/navegacao.ts`; todo guia relacionado no diagnóstico existe.
- Busca: sem acento/caixa; prioriza título; vazio → todos.
- Diagnóstico: cada tipo tem sintomas; cada par tem ≥ 2 causas e ≥ 2 verificações.
- Biblioteca: validações (área, título, tipo, tamanho) e permissão da rota.
- E2E: `/suporte` abre nas três visões; busca filtra; diagnóstico mostra causas.
