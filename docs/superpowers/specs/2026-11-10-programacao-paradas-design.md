# Programação de paradas — especificação

> Aba nova **"Programação de paradas"** (grupo Planejamento) que substitui a planilha de programação do planejador:
> distribui as chamadas da IP19 (e, na parte 4, o backlog da IW38) em paradas de máquina por dia e turno, dentro da
> capacidade da equipe, seguindo as regras de programação como **parâmetros**. 1ª versão: localização **GAL1**,
> **Componentes** (MEC_COMP / ELE_COMP). Depois, outras localizações.

Data: 10/11/2026 · Plano: `docs/superpowers/plans/2026-11-10-programacao-paradas.md`

## 0. Segurança (vale para tudo abaixo)

- O repositório é público. **Nada da planilha do planejador entra no repositório além de regras e nomes de grupos
  de máquinas** (ex.: "PELLET 01", "PRENSA COPE", "INJ EXP"). Nunca: nomes de pessoas (planejadores, técnicos),
  e-mails, números de ordem, códigos de campo de ordenação, códigos de equipamento, tabelas de dados, HH reais.
- Os parâmetros com valor da empresa (equipe por turno, feriados locais, agrupamentos específicos) ficam no cadastro
  `programacao_paradas.json` (Supabase/repositório de dados via `lib/dados/cadastros.ts`). O código traz só **padrões**
  genéricos (os números de turno da planilha são regra de capacidade, não dado pessoal — podem ser o padrão).
- Testes só com dados fictícios (equipamentos "EQ-1", campos "C-100", ordens "9000001"…).
- A tela nunca mostra nomes de técnicos (a planilha também não): cartões mostram turno, horário e HH MEC/ELE.

## 1. Objetivo

Hoje o planejador monta em Excel, a cada mês, um calendário de paradas por ativo a partir da IP19 colada, com ~30
regras aplicadas à mão/por fórmula, confere 11 itens e depois troca as datas das ordens no SAP (IW32) por macro.
A aba deve:

1. Ler **sozinha** as bases do site (IP19, IW38, IW38OP, IH08) — sem colar exports.
2. Completar o HH das chamadas da IP19 que vêm sem operação (IP19 "nova") pelas operações da ordem (IW38OP) ou do
   mesmo plano + equipamento.
3. Agrupar equipamentos em **ativos** (máquina-mãe pelo campo de ordenação do IH08; linhas de Pellet; Banbury + monta
   carga…) e somar o HH do mês por ativo e disciplina (MEC/ELE).
4. Rodar um **motor de regras puro** (sem I/O, determinístico, testado) que gera a programação dia × turno.
5. Mostrar as visões da planilha: Programação (lista), Calendário mensal (cartões por turno), Saldo HH, Campos por
   dia, Ativos sem HH, Verificação (11 conferências) e, na parte 4, IW38 Plano × Backlog e Planejamento (IW32).
6. Permitir **edição manual** (data/turno) com recálculo e alertas na hora, parâmetros editáveis e histórico.
7. Exportar a troca de datas das ordens + **script VBS da IW32** no padrão do IA06 da Gestão de MRO.

## 2. Fontes de dados e leitura

Todas vêm de `bases()` (`lib/wcm/dados.ts`), já com cache por versão. Nada é colado.

### 2.1 IP19 — `b.cruas.ip19` (linhas cruas, uma por operação da lista de tarefas)

Colunas achadas por cabeçalho com `acharColuna` (mesmos padrões de `lib/wcm/planos.ts` → `COLUNAS`/`EXCLUIR`, que
passam a ser **exportados** como `COLUNAS_IP19`/`EXCLUIR_IP19` para não duplicar), mais duas:

| Campo | Padrões (chave sem acento, maiúsculas) | Uso |
|---|---|---|
| plano | `^PLANO( DE)? MANUT`, `^PLANO$` | chave da chamada; completar HH |
| item | `^ITEM( DE)? MANUT`, `^ITEM$` | chave |
| texto | `TEXTO.*PLANO`… | exibição |
| equipamento | `^EQUIPAMENTO$` | ativo (via IH08) |
| centroTrabalho | `CENTRO TRAB`, `CENTRO DE TRABALHO` | disciplina |
| grupoPlanejamento | `GRUPO.*PLANEJ`, `GRP.*PLAN`, `GRP PLNJ` ("Grp.plnj.PM") | filtro do planejador (parâmetro) |
| trabalho / unidade | `^TRABALHO$` / `UNIDADE DO TRABALHO` | HH (MIN ÷ 60; H × 1) |
| dataPlanejada / dataChamada | `DATA PLAN`… / `DATA (DE )?CHAMADA`… | data IP19 = planejada ?? chamada |
| dataConclusao | `DATA (DE )?CONCL`… | concluída |
| tipoProgramacao | `TIPO (DE )?PROGRAM`, `^ST SOLICIT`… ("St.solicitação") | situação; concluída/ignorada saem |
| ordem | `^ORDEM$` | completar HH; IW32 |
| pacote | `PACOTES? VENCIDOS?` | exibição |
| **localizacao** (nova) | `^LOCALIZACAO$` | filtro GAL1 (se ausente: IH08 do equipamento) |
| **equipSuperior** (nova) | `EQUIPAMENTO SUPERIOR` | campo de ordenação quando o equipamento não tem |

Regras de leitura (função `itensDaIp19`):

- L1. Linha sem plano, ou sem data planejada **e** sem data de chamada → descartada (motivo "sem plano/data").
- L2. Situação concluída ou ignorada → descartada: `chave(tipoProgramacao)` começa com `CONCL`, `IGNOR`, `SALT`
  (saltada) **ou** `dataConclusao` preenchida. "Programado", "Reinício", "InícCiclo", "Datas adicionais (simulação)"
  ficam.
- L3. Localização: coluna da IP19; vazia → `Equipamento.localizacao` do IH08; precisa estar em `p.localizacoes`
  (padrão `["GAL1"]`; lista vazia = todas).
- L4. Grupo de planejamento em `p.gruposPlanejamento` (padrão `[]` = todos).
- L5. Centro de trabalho em `p.centrosEliminados` (padrão `["ELMC_MTZ","OPER_MTZ"]`) → descartada, sempre, em
  qualquer base (já coberto por `foraDaVisao`, mas o parâmetro manda).
- L6. Disciplina pelo centro (`disciplinaDoCentro`): `^ELE_` → **ELE**; `^MEC_`, `^COMPONEN$`, `^UTILIDAD$` → **MEC**;
  outro centro não vazio → descartada (fora de Componentes); **vazio** → disciplina decidida no completar (§2.5); se
  continuar vazio, **MEC** com marca "centro assumido" (como a planilha fez).
- L7. HH = trabalho × fator da unidade (`MIN` 1/60, `H`/`HR`/`STD` 1); sem coluna de unidade → `p.unidadePadraoIp19`
  (padrão `"MIN"`, porque a planilha diz "Trab. em minutos").
- L8. Mês da IP19 = mês da data IP19 (`AAAA-MM`). Só entram os meses do horizonte (§5.1).

Saída: `ItemPlano[]` (uma operação = um item; ver §3) + `descartes: Record<motivo, n>` (mostrado em "De onde vêm os
números").

### 2.2 IH08 — `b.equipamentos` (`Equipamento[]`)

Usa `equipamento`, `denominacao`, `localizacao`, `campo` (campo de ordenação), `superior`, `inativo`.

### 2.3 IW38 — `b.ordens` (`Ordem[]`)

Usa `ordem`, `plano`, `comPlano`, `tipo`, `equipamento`, `localizacao`, `centroTrabalho`, `statusSistema`,
`statusUsuario`, `situacao`, `inicio`, `fim`, `prioridade`, `campo`, `texto`. Partes 1 (completar HH) e 4 (backlog).

### 2.4 IW38OP — `b.operacoes` (`Operacao[]`)

Usa `ordem`, `operacao`, `centroTrabalho`, `horas` (já em horas: `fatorHoras`), `inicio`, `concluida`, `cancelada`,
`statusSistema`, `textoOperacao`, `equipamento`. Operação **pendente** = `!concluida && !cancelada && !/\bELIM\b/`
no status do sistema.

### 2.5 Completar o HH (melhoria pedida)

A IP19 nova pode vir sem operações (HH 0, sem centro). Para cada **chamada** (plano + item + data) cujos itens somam
HH 0 ou não têm centro (`completarHh`):

- C1. A chamada tem ordem e a IW38OP tem operações dessa ordem → a chamada vira um item por operação (centro e HH da
  operação; operações canceladas fora). Origem `"iw38op-ordem"`.
- C2. Senão: ordens da IW38 com o **mesmo plano e equipamento**; escolhe a de `inicio` mais próximo da data IP19
  (empate: a mais recente); usa as operações dela da IW38OP. Origem `"iw38op-plano"`.
- C3. Senão: outra chamada da IP19 do mesmo plano + equipamento com HH > 0, de data mais próxima (empate: a anterior);
  copia os itens dela (centro e HH). Origem `"ip19-mesmo-plano"`.
- C4. Senão: fica com HH 0, origem `"sem-hh"`, listada no quadro "Chamadas sem HH" (não some).
- Os itens completados passam de novo por L5/L6 (centro eliminado / fora de Componentes saem).

### 2.6 Ativos (agrupamento) — `montarAtivos`

- A1. **Campo** do item = `campo` do IH08 do equipamento; vazio → `campo` do equipamento superior; vazio → campo
  geral (`camposGerais`, mais usado no IW38); vazio → o próprio código do equipamento.
- A2. Equipamentos com o mesmo campo = um ativo (máquina-mãe: DRY BLEND + extrusora DBL + corte submerso; BANBURY +
  monta carga; INJETORA 21 + circuito pneumático).
- A3. **Agrupamentos por parâmetro** (`p.agrupamentos`): `{ ativo, padrao }` — todo equipamento cuja denominação
  (`chave`) casa com o regex vira o ativo indicado (sobrepõe A2). Padrão: linhas de Pellet
  `{ ativo: "PELLET 0$1", padrao: "\\(PELLET\\s*-?\\s*0?([1-9])\\)" }` (subativos com "(PELLET 02)" no nome) e a
  própria "LINHA PELLET 0n".
- A4. **Nome, tipo e grupo** pelo primeiro de `p.classes` cujo `padrao` casa com a denominação da máquina-mãe
  (equipamento cujo código = campo; senão o primeiro equipamento do grupo). Cada classe:
  `{ padrao, nome, tipo, grupo?, papel?, so1Turno?, soSabado? }` (`$1` = 1º grupo do regex, com 2 dígitos). Padrões
  (só nomes de grupos de máquinas):

| padrão (regex sobre `chave(denominacao)`) | nome | tipo | grupo crítico | outros |
|---|---|---|---|---|
| `\(PELLET\s*-?\s*0?([1-9])\)` / `^LINHA PELLET 0?([1-9])` | PELLET 0$1 | PELLET | PELLET | so1Turno |
| `^DRY BLEND` | DRY BLEND | DRY BLEND | DRY BLEND | so1Turno, exclusivoT1 |
| `^BANBURY` | BANBURY | BANBURY | BANBURY | so1Turno |
| `^INJETORA EXP (\d+)` | INJETORA $1 | INJETORA | INJ EXP | so1Turno |
| `^PRENSA A VACUO` / `^PRENSA COPE` / `^PRENSA PANSTONE` | PRENSA A VÁCUO / PRENSA COPE / PRENSA PANSTONE | PRENSA | PRENSA/MOINHO SF | papel prensa, so1Turno |
| `^MOINHO LAMINADOR SF 0?(\d+)` | MOINHO $1 | MOINHO | PRENSA/MOINHO SF se $1 ∈ `p.rodizioMoinhos` | papel moinho, so1Turno |
| `^INJETORA PVC.*?0*(\d+)$` | PVC $1 | PVC | — | |
| `^INJETORA 0?(\d+) .*GOLDEN EAGLE` | GOLDEN $1 | GOLDEN | — | |
| `^INJETORA TIEN KANG 0?(\d+)` | TIEN KANG $1 | TIEN KANG | — | |
| `^PAN ?STONE 0?(\d+)` | PANSTONE $1 | PANSTONE | — | preferência T1 |
| `^CALANDRA` / `^STABIL 0?(\d+)` | CALANDRA / STABIL $1 | CALANDRA / STABIL | — | soSabado |
| `^MICRONIZADOR 0?(\d+)` | MICRONIZADOR $1 | MICRONIZADOR | — | |
| `^MOINHO GK` | MOINHO GK | MOINHO GK | — | |
| `^MOINHO TRITURADOR SEIBT 0*(\d+)` | TRITURADOR SEIBT $1 | TRITURADOR SEIBT | — | |
| `^PINHEIRO (\d+)` / `^CRISTALIZADORA (\d+)` / `^FORNO TUNEL` | PINHEIRO $1 / … / FORNO TÚNEL | idem | — | |
| (nenhuma casa) | denominação (até 30 caracteres) | 1ª palavra | — | |

- A5. Moinho que não está no rodízio e está em `p.juntos` (`{ ativo: "MOINHO 04", com: "BANBURY" }`) para no dia do
  Banbury (regra R12).
- A6. Ativo com nome repetido de campos diferentes → sufixo " (2)" e aviso (não junta dois ativos por engano).

### 2.7 Demanda do mês

`Demanda = { mes, ativo, itens, hh: {mec, ele}, primeiraData, datas }` — itens do ativo no mês, somados. Itens em
ordem estável: data IP19, plano, item, operação.

## 3. Modelo de dados (TypeScript, `web/lib/paradas/tipos.ts`)

```ts
import type { Dia } from "@/lib/wcm/util";

export type Disciplina = "MEC" | "ELE";
export type Turno = 1 | 2;
export interface HH { mec: number; ele: number }
export type GrupoCritico = "DRY BLEND" | "BANBURY" | "PELLET" | "PRENSA/MOINHO SF" | "INJ EXP";
export type OrigemHh = "ip19" | "iw38op-ordem" | "iw38op-plano" | "ip19-mesmo-plano" | "sem-hh";

/** Uma operação da IP19 (ou completada) — a menor unidade que o motor move; nunca é dividida. */
export interface ItemPlano {
  chave: string;          // plano|item|dataIp19|seq
  plano: string; item: string; ordem: string; texto: string;
  equipamento: string; campo: string; ativo: string;
  mes: string;            // "AAAA-MM"
  dataIp19: Dia;
  disciplina: Disciplina; centro: string; hh: number;
  situacao: string;       // "Programado · Inspeção"…
  origemHh: OrigemHh; centroAssumido?: boolean;
}

export interface Ativo {
  id: string;             // nome do calendário ("INJETORA 21")
  campos: string[]; equipamentos: string[]; denominacao: string;
  tipo: string; grupo: GrupoCritico | null; papel?: "prensa" | "moinho";
  so1Turno: boolean; soSabado: boolean; exclusivoT1: boolean; preferenciaT1: boolean;
  juntoCom?: string;      // "BANBURY" para o MOINHO 04
}

export interface Demanda { mes: string; ativo: string; itens: ItemPlano[]; hh: HH; primeiraData: Dia; datas: Dia[] }

export type Marca = "antecipado" | "estouro ≤4h" | "fixada" | "parada extra" | "1º+2º turno" | "fora do dia padrão"
  | "semana da prensa" | "preenchimento" | "sem itens IP19";

/** Uma linha da Programação: um ativo num dia e turno (a mesma parada pode ter 2 linhas: T2 e T1 do mesmo dia). */
export interface LinhaProgramacao {
  id: string;             // `${mes}|${ativo}|${parada}|${turno}`
  data: Dia; turno: Turno; ativo: string; mes: string;
  parada: 1 | 2; paradasNoMes: number;
  hh: HH; acima: HH;      // acima = HH além da capacidade por saldo ≤ 4 h
  itens: string[];        // chaves dos ItemPlano
  marcas: Marca[];
  tipo: string; grupo: GrupoCritico | null; campos: string[];
}

export interface SemHh { mes: string; ativo: string; hh: HH; itens: string[]; primeiraData: Dia; motivo: string }
export interface Retirado { mes: string; ativo: string; hh: HH; motivo: string }   // ex.: injetora ≤ 0,2 h

export interface Fixacao {
  id: string; mes: string; ativo: string; parada: 1 | 2;
  data: Dia; turno: Turno | "1+2"; extra?: boolean; motivo?: string; por?: string; em?: string;
}

export interface EntradaMotor {
  demandas: Demanda[]; ativos: Record<string, Ativo>; parametros: Parametros;
  inicio: Dia; fim: Dia;             // horizonte (inclusive)
  fixacoes?: Fixacao[];
  ocupacaoAnterior?: { semana: string; ativo: string; grupo: GrupoCritico | null }[]; // prensas/pellets da semana anterior ao início
}

export interface ResultadoMotor {
  linhas: LinhaProgramacao[]; semHh: SemHh[]; retirados: Retirado[];
  fixacoesOrfas: Fixacao[]; avisos: string[];
}

export interface CapTurno { pessoasMec: number; pessoasEle: number; horasPorPessoa: number; inicio: string; fim: string }
export interface Parametros {
  versao: 1;
  localizacoes: string[]; gruposPlanejamento: string[]; centrosEliminados: string[];
  unidadePadraoIp19: "MIN" | "H";
  turnos: { t1: CapTurno; t2: CapTurno; sabado: CapTurno };
  feriados: { data: string /* AAAA-MM-DD */; nome: string }[];
  inicio: string | null;          // AAAA-MM-DD; null = hoje
  meses: number;                  // horizonte: mês do início + (meses-1); padrão 3
  maxAtivosDia: number;           // 7
  maxParadasMes: number;          // 2
  estouro: HH;                    // {mec:4, ele:4}
  antecipacaoDias: number;        // 3
  padraoSemanal: Record<1|2|3|4|5, GrupoCritico[]>; // SEG=[DRY BLEND,BANBURY] TER=[PELLET] QUA=[PRENSA/MOINHO SF] QUI=[INJ EXP] SEX=[INJ EXP]
  ordemCriticos: GrupoCritico[];  // DRY BLEND, BANBURY, PRENSA/MOINHO SF, PELLET, INJ EXP
  rodizioMoinhos: string[];       // MOINHO 02, MOINHO 05, MOINHO 07
  juntos: { ativo: string; com: string }[];         // MOINHO 04 com BANBURY
  tiposPrimeiroT2: string[];      // GOLDEN, TIEN KANG, PVC
  tiposPreferenciaT1: string[];   // PANSTONE
  tiposSabadoPreenchimento: string[]; // GOLDEN, PVC, TIEN KANG, PANSTONE
  hhIrrelevante: { tipos: string[]; limite: number }; // INJETORA, 0.2
  agrupamentos: { ativo: string; padrao: string }[];
  classes: ClasseAtivo[];
}
export interface ClasseAtivo {
  padrao: string; nome: string; tipo: string; grupo?: GrupoCritico; papel?: "prensa" | "moinho";
  so1Turno?: boolean; soSabado?: boolean; exclusivoT1?: boolean; preferenciaT1?: boolean;
}
```

Parte 4 acrescenta `OrdemBacklog`, `AlocacaoBacklog`, `LinhaIw32` (ver §8).

## 4. Calendário de trabalho e capacidade

- K1. Condição do dia: **domingo** → sem atuação; **feriado** (`p.feriados`) → sem atuação; **sábado** → só 1º turno
  (`p.turnos.sabado`, 05:30–11:30); seg–sex → **dia útil** (T1 05:30–14:00, T2 14:00–17:00); antes de
  `inicio` → "antes do início" (sem capacidade, nada programado).
- K2. Capacidade do turno = pessoas × horas por pessoa, por disciplina. Padrões (planilha):
  T1 6 MEC + 2 ELE × 6,5 h = **39 h MEC / 13 h ELE**; T2 5 MEC + 1 ELE × 3 h = **15 / 3** (máquina disponível só 3 h);
  sábado 6 MEC + 2 ELE × 6,5 h = **39 / 13**; dia útil = **54 / 16**.
- K3. Capacidade do mês = soma dos dias (ex. fictício conferível: novembro/2026 a partir de 03/11 com feriados 02, 15
  e 20/11: 19 dias úteis × 54 + 4 sábados × 39 = **1182 h MEC**; 19 × 16 + 4 × 13 = **356 h ELE**).
- K4. Semana = semana ISO (`semanaIso`), chave `"AAAA-Wss"`; conta a semana inteira mesmo na virada do mês.
- K5. Feriados padrão no código: só nacionais (01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 20/11, 25/12 do ano
  corrente e do seguinte, + móveis a cadastrar); os locais o planejador cadastra.

## 5. Motor de regras (`programar(entrada): ResultadoMotor`)

Puro, determinístico, sem `Date.now()` (o início vem na entrada). Desempate sempre por **data crescente, depois nome
do ativo**. HH comparado com tolerância `1e-6`.

### 5.1 Horizonte e estado

- Meses = do mês de `inicio` até `inicio + meses − 1`. Meses processados **em ordem**; o estado (quem parou em que
  semana, prensa/pellet da semana anterior) atravessa os meses.
- Estado por dia × turno: HH usado (MEC/ELE), ativos, grupo crítico do dia, tipos do dia (T1+T2), "não crítico no T1
  junto do crítico" (0/1), DRY BLEND exclusivo.
- Estado por ativo × mês: paradas (dias), itens pendentes. Por semana: ativos que pararam, prensa e pellet da semana.

### 5.2 Validação de um encaixe — `podeColocar(ativo, dia, turnos)` (todas precisam valer)

Cada falha tem um código (usado nos testes e nos alertas da §6):

| # | Regra | Código |
|---|---|---|
| R1 | Dia com atuação no turno: não domingo, não feriado, não T2 de sábado, não antes do início. | `CALENDARIO` |
| R2 | Ativo `so1Turno` (críticos e moinhos SF) só no T1, sem continuação no T2. | `SO_T1` |
| R3 | Ativo `soSabado` (CALANDRA, STABIL) só no sábado. Críticos (`grupo != null`) e INJ EXP **nunca** no sábado. | `SABADO` |
| R4 | No máximo **um grupo crítico por dia** (T1+T2). Exceção: PRENSA e o seu MOINHO SF são o mesmo grupo. | `DOIS_CRITICOS` |
| R5 | Moinho SF só no dia de uma prensa (mesmo dia, T1). | `MOINHO_SEM_PRENSA` |
| R6 | Mesmo **tipo** de equipamento no máximo 1 vez por dia (T1+T2); o mesmo ativo pode usar T1 e T2 do mesmo dia. | `MESMO_TIPO` |
| R7 | O mesmo ativo **no máximo um dia por semana ISO**. | `SEMANA_REPETIDA` |
| R8 | **Uma prensa por semana** e nunca a mesma prensa da semana anterior; idem **uma Pellet por semana** e nunca a mesma da semana anterior. Fixações `extra` são exceção. | `PRENSA_SEMANA`, `PRENSA_SEGUIDA`, `PELLET_SEMANA`, `PELLET_SEGUIDA` |
| R9 | Dia com DRY BLEND: **nenhum outro ativo no T1** (T2 livre para não críticos). | `DRY_BLEND_SOZINHA` |
| R10 | Máximo `p.maxAtivosDia` (7) ativos distintos no dia. | `MAX_DIA` |
| R11 | Em dia com grupo crítico, **no máximo 1 não crítico no T1**. | `T1_CHEIO` |
| R12 | Ativo em `p.juntos` (MOINHO 04) só no dia do ativo `com` (BANBURY), **se** o `com` tem demanda no mês; senão é ativo comum. | `JUNTO_FORA` |
| R13 | Capacidade: HH do turno ≤ capacidade (por disciplina), salvo o estouro ≤ 4 h (R20). | `CAPACIDADE` |
| R14 | No máximo `p.maxParadasMes` (2) paradas (dias) do ativo no mês; a 2ª parada **em outra semana** (posterior à da 1ª, dentro do mês). | `PARADAS_MES`, `SEGUNDA_MESMA_SEMANA` |
| R15 | Ativo só no **mês da sua IP19** (sem antecipar para o mês anterior). | `FORA_DO_MES` |

### 5.3 Ordem de aplicação (por mês)

**Passo 0 — Retirados.** Ativo com `tipo ∈ p.hhIrrelevante.tipos` (INJETORA) e HH total do mês ≤ `limite` (0,2 h)
→ `Retirado` ("só inspeção de 5 min"); não entra na programação **nem** em Ativos sem HH.

**Passo 1 — Fixações** (§5.5). Entram primeiro, com os itens da parada correspondente; ocupam capacidade e estado.

**Passo 2 — Críticos**, na ordem `p.ordemCriticos` = DRY BLEND → BANBURY (+ juntos) → PRENSA (+ moinho SF) →
PELLET → INJ EXP. Dentro do grupo, ativos por (1ª data IP19, nome). Para cada ativo:

- 2a. Dias candidatos = dias úteis do mês a partir do início, cujo dia da semana está em `p.padraoSemanal` para o
  grupo (DRY BLEND/BANBURY = SEG; PELLET = TER; PRENSA = QUA; INJ EXP = QUI e SEX), em ordem cronológica — **não
  espera a data da IP19** (vai no primeiro dia útil do mês com HH).
- 2b. Escolhe o 1º candidato que passa em `podeColocar` **e** em que a demanda inteira cabe no T1.
- 2c. Nenhum: o 1º dia útil **de qualquer dia da semana** do mês em que caiba inteiro e passe nas regras (marca
  "fora do dia padrão").
- 2d. Nenhum: o 1º candidato do padrão que passe nas regras; recebe os itens que couberem (§5.4) — o resto segue
  para R20/R21.
- **PRENSA** (papel prensa): além disso R8. No dia da prensa, logo em seguida, o **moinho SF** da vez: o próximo de
  `p.rodizioMoinhos` (circular, a partir do último usado, atravessando meses) que tem demanda pendente no mês; entra
  no T1 do mesmo dia com os itens que couberem (marca "semana da prensa"); o resto do moinho vai para o dia da
  próxima prensa do mês (é a 2ª parada dele) ou, sem prensa, para Ativos sem HH ("não coube junto com a prensa da
  semana"). Mês sem prensa → moinhos SF vão para Ativos sem HH com esse motivo.
- **BANBURY**: logo em seguida, cada ativo de `p.juntos` com `com = BANBURY` no mesmo dia (T1; o que não couber
  segue R20/R21 com 2ª parada no dia da 2ª parada do Banbury, se houver).
- **DRY BLEND**: marca o dia como `exclusivoT1` (R9).
- **INJ EXP**: uma injetora por dia (R6) → ocupam QUI/SEX seguidas a partir do início do mês.

**Passo 3 — Só sábado** (CALANDRA, STABIL): sábados úteis do mês, a partir da 1ª data IP19 − antecipação, no
sábado menos carregado; 2ª parada em sábado de outra semana.

**Passo 4 — Não críticos**, ordenados por (1ª data IP19, HH total decrescente, nome):

- 4a. Janela = [max(início, 1ª data IP19 − `p.antecipacaoDias`), fim do mês].
- 4b. Turnos tentados, nesta ordem:
  - tipo em `p.tiposPreferenciaT1` (PANSTONE): (i) T1 de um dia **com** grupo crítico e ainda sem não crítico no T1;
    (ii) T1 de dia sem crítico; (iii) T2; (iv) T2+T1.
  - tipo em `p.tiposPrimeiroT2` (GOLDEN, TIEN KANG, PVC) e demais: (i) T2, preferindo dias com **T2 vazio**;
    (ii) **T2+T1** do mesmo dia (começa no T2, continua no T1 — marca "1º+2º turno"; R11 vale para o T1); (iii) T1.
  - Sábado (T1) é dia válido para qualquer não crítico.
- 4c. Dentro da janela, para o 1º modo de turno que tenha algum dia onde a demanda **inteira** caiba: escolhe o dia
  **menos carregado** (menos ativos no dia; empate: mais HH livre somado; empate: mais cedo).
- 4d. Nenhum dia da janela: mesmo critério em **todo o mês** (dias antes da 1ª data IP19 recebem a marca
  "antecipado").
- 4e. Não cabe inteira em nenhum dia: dia do mês com **mais HH livre** nos turnos permitidos (T2+T1), recebe os
  itens que couberem (§5.4); resto → R20/R21.

**Passo 5 — Estouro e 2ª parada** (para todo ativo com itens pendentes, na ordem em que ficaram pendentes):

- R20. **Saldo ≤ 4 h**: se o pendente tem MEC ≤ `p.estouro.mec` **e** ELE ≤ `p.estouro.ele`, junta na parada já
  existente do ativo com mais folga (no turno onde ele já está; para críticos, T1), **acima do limite** — o excesso vai
  em `acima` e a marca "estouro ≤4h". Não abre 2ª parada.
- R21. **2ª parada**: só se R20 não se aplica e o ativo tem < `maxParadasMes` paradas. Mesmo procedimento do seu
  passo (2 ou 3 ou 4), restrito a **semanas posteriores** à da 1ª parada no mês (R14). Depois dela, se ainda sobrar:
  R20 (na parada com mais folga); senão → **Ativos sem HH** com motivo:
  - prensa: "Não coube nas semanas de prensa do mês (1 prensa por semana, sem repetir a da semana anterior, 1 dia por
    parada, só 1º turno, máx. 2 paradas)";
  - moinho SF: "Não coube junto com a prensa da semana (só 1º turno)";
  - fixação extra: "Saldo da parada extra que não coube no 1º turno";
  - demais: "Não coube em 2 paradas no mês com a capacidade dos Parâmetros".

**Passo 6 — Preenchimento de turno vazio.** Para cada dia útil com T1 ou T2 vazio e cada sábado útil com T1 vazio
(em ordem cronológica): procura um ativo **não crítico do mesmo mês** já programado em outro dia, cuja parada (todas
as linhas dela) pode ser **movida** para o turno vazio sem: deixar vazio o turno de origem, quebrar nenhuma regra
R1–R15, nem passar da capacidade. Preferência: do dia com mais ativos; empate, o de menor HH. No sábado, só
`p.tiposSabadoPreenchimento` (GOLDEN, PVC, TIEN KANG, PANSTONE) além de CALANDRA/STABIL. Marca "preenchimento".
Não achou → fica vazio e a conferência C8 aponta.

**Passo 7 — Reavaliação dos sem HH.** Para cada `SemHh` do mês: tenta de novo (a) encaixe no mesmo dia de uma
parada existente do ativo, no outro turno permitido (é a mesma parada); (b) nova parada em outra semana se
paradas < 2. O que entrar sai de Ativos sem HH.

### 5.4 Encaixe por itens (nunca divide um item)

`encaixar(itens, livre: HH)`: percorre os itens na ordem estável; entra o item se `hh` cabe no livre da disciplina
dele (first-fit, pula o que não cabe e segue). Nos modos T2+T1, o livre é a soma dos dois turnos e os itens são
gravados em duas linhas: enche o T2 primeiro (first-fit), o resto no T1. Itens com HH 0 entram sempre (uma parada
pode ter 0 h: "sem itens IP19" quando o ativo não tem itens no mês e foi fixado).

### 5.5 Fixações (edição manual e paradas extras)

- F1. Uma fixação diz `{mes, ativo, parada, data, turno, extra?}`. Se há fixações, o motor roda **duas passadas**:
  A) sem fixações → descobre os itens de cada parada (`mes|ativo|parada`); B) coloca as fixações primeiro com
  **os itens daquela parada da passada A** (a parada inteira muda de lugar, com o mesmo HH), e depois programa o resto
  pelas regras (passos 2–7) com o estado já ocupado.
- F2. Fixação **não é barrada** pelas regras nem pela capacidade: o que ela quebrar vira alerta (§6) — é decisão do
  planejador.
- F3. Fixação cuja parada não existe na passada A (ativo saiu da IP19, mês mudou) → `fixacoesOrfas` (mostradas no
  histórico; o planejador apaga).
- F4. `extra: true` = parada extra solicitada pelo planejador: não conta em `maxParadasMes` nem em R8 (marca
  "parada extra").

### 5.6 Saídas do motor

`linhas` ordenadas por (data, turno, grupo crítico primeiro, ativo); `paradasNoMes` preenchido no fim; `semHh`;
`retirados`; `fixacoesOrfas`; `avisos` (ativo duplicado, chamadas sem HH, mês sem prensa com moinho SF pendente…).

## 6. Alertas de regra (`alertas(resultado, entrada) → Alerta[]`)

Recalculados sobre as linhas finais (depois de fixações/edições), um por linha e regra, mesmo código da §5.2:
`CALENDARIO` ("data em domingo/feriado/2º turno de sábado"), `SO_T1`, `SABADO`, `DOIS_CRITICOS`, `MOINHO_SEM_PRENSA`,
`MESMO_TIPO`, `SEMANA_REPETIDA`, `PRENSA_SEMANA`, `PRENSA_SEGUIDA`, `PELLET_SEMANA`, `PELLET_SEGUIDA`,
`DRY_BLEND_SOZINHA`, `MAX_DIA`, `T1_CHEIO`, `JUNTO_FORA`, `CAPACIDADE` (só o que passar do limite **além** do estouro
≤ 4 h registrado), `PARADAS_MES`, `SEGUNDA_MESMA_SEMANA`, `FORA_DO_MES`. `Alerta = { linhaId, codigo, texto }`.
Fixações `extra` não geram `PRENSA_*`/`PELLET_*`. Na tela a linha fica vermelha com o texto.

## 7. Visões (funções puras em `lib/paradas/visoes.ts`)

- V1. **Programação** — tabela das linhas: Data, Dia, Semana, Turno, Ativo, Equipamentos (máquina-mãe + agrupados),
  Mês IP19, HH MEC, HH ELE, HH total, Parada (n de m), Janela do turno, Situação (marcas), Itens IP19 do ativo no mês,
  Datas IP19 no mês, Tipo, Grupo crítico, Acima do limite MEC/ELE, Campo(s) de ordenação, Alerta.
- V2. **Calendário do mês** (parte 2) — semanas (seg–sáb) com os dias do mês (dias de outro mês em cinza); por dia:
  "HH MEC x / cap", "HH ELE x / cap", e por turno os **cartões** (ativo, "parada n/m", marcas, "MEC a | ELE b h");
  feriado com o nome; domingo omitido. Resumo do mês no topo: carga IP19 MEC/ELE, capacidade, programado, Ativos sem HH.
- V3. **Saldo HH** — por dia: data, dia, condição; T1 (ativos com HH, cap, HH, saldo MEC/ELE); T2 (idem); saldo p/
  backlog MEC/ELE/total (**no dia de DRY BLEND o T1 não conta**); situação do dia; acima do limite MEC/ELE; (parte 4)
  backlog IW38 MEC/ELE, backlog manual, saldo final. Resumo por mês: carga IP19, capacidade, programado, saldo
  (cap − carga), saldo p/ backlog, backlog alocado, manual, saldo final.
- V4. **Campos por dia** — data, dia, semana, situação do dia, nº de máquinas, T1 "ativo · campo", T2 "ativo · campo",
  lista "campo; campo; …" (para colar no SAP; botão copiar).
- V5. **Ativos sem HH** — ativo, campo(s), equipamentos, mês, 1ª data IP19, HH MEC/ELE/total, nº itens, motivo.
  Mais o quadro "Retirados" e "Chamadas sem HH (IP19 sem operação e sem plano anterior)".
- V6. **Verificação** — por mês: capacidade MEC/ELE, programado MEC/ELE, uso % (programado ÷ capacidade), carga IP19,
  sem HH, saldo p/ backlog; + as 11 conferências (§9).
- V7. (parte 4) **IW38 Plano × Backlog** e **Planejamento (IW32)** — §8.

## 8. Parte 4 — IW38 plano × backlog e troca de datas (IW32)

### 8.1 Classificação das ordens (`classificarOrdens`)

Ordem entra se: `localizacao ∈ p.localizacoes`; situação pendente sem ENTE/ENCE (`Aberta`/`Liberada`); tem ao menos
uma operação pendente (§2.4) com disciplina MEC/ELE (L6); máquina na programação (campo da ordem `o.campo` ou campo
IH08 do equipamento → ativo da programação). Classe por **operação**:

- `PLANO na programação` — `comPlano` e a ordem é de uma chamada programada (ordem ∈ itens das linhas): já está no
  calendário, não soma de novo.
- `PLANO pendente fora da programação` — `comPlano` e não está: só listada.
- `BACKLOG` — plano vazio. Ordem sem cabeçalho na IW38 (só na IW38OP): tipo `YM13/YM14/YM15/YM17` → plano; senão backlog
  (parâmetro `p.tiposOrdemPlano`).
- `Em planejamento` — status do usuário sem PLA nem PRO: listada, **não ocupa saldo**.

### 8.2 Alocação do backlog no saldo (`alocarBacklog`)

Operações BACKLOG (status PLA/PRO) ordenadas por (1ª data de início, prioridade, ordem, operação). Cada uma vai inteira
para o **primeiro dia** ≥ max(hoje, 1ª data da operação) em que o ativo dela **já para**, no turno da parada (depois o
outro turno do mesmo dia), com saldo da disciplina ≥ HH — **nunca** no T1 de dia de DRY BLEND. Não coube →
"sem saldo / sem parada". Resultado: `AlocacaoBacklog { porDia: Map<Dia,{t1:HH,t2:HH}>, linhas: LinhaBacklog[] }`.
O backlog manual (por dia, MEC/ELE) vem do cadastro. **Saldo final = saldo p/ backlog − backlog IW38 − manual.**

Resumo por classe × disciplina: total pendente, já no calendário, alocado por mês, sem saldo, nº ordens.

### 8.3 Troca de datas na IW32 (`linhasIw32`, CSV + VBS)

- Uma linha por **ordem** a partir de hoje: ordens das chamadas programadas (origem "IP19 (plano)") e do backlog
  alocado (origem "IW38 (backlog)"). Ordem com itens em mais de um dia: início = 1º dia, fim = último dia.
  Colunas: EXECUTAR (X se a data muda), Ordem, Data início (dd.mm.aaaa), Data fim (dd.mm.aaaa), Ativo, Turno, Origem,
  HH, Data atual (IP19/IW38), Texto.
- CSV `SAP_IW32_DATAS_ordens.csv` (Windows-1252, `;`, via `ansi`) e script `SAP_IW32_DATAS_ordens.vbs` gerado por
  `scriptIw32(modoTeste)`, **mesmo esqueleto do `scriptInclusao` do IA06** (`app/(app)/mro/ia06.ts`): acha o CSV na
  pasta do script/Downloads/Área de Trabalho/Documentos ou pergunta; `MODO_TESTE` (não grava); log, feitos e
  pendentes com motivo; para depois de N telas não reconhecidas. Por linha: `/nIW32`, `CAUFVD-AUFNR` = ordem, Enter;
  `ctxtCAUFVD-GSTRP` = início, `ctxtCAUFVD-GLTRP` = fim, Enter, Enter; confere o campo na tela; grava (`btn[11]`) só
  fora do modo teste. **Status do sistema/usuário não é alterado na v1.** Nenhum caminho pessoal no script.
- Exportação registrada na auditoria (`registrar(login, "exportacao", arquivo, { linhas })`).

## 9. As 11 conferências (`conferir(…) → Conferencia[]`)

`Conferencia = { id: "C1".."C11", texto, resultado: "OK" | "VERIFICAR" | "—", detalhe?: string }`. Tolerância 0,5 h.

| # | Conferência | Como |
|---|---|---|
| C1 | Capacidade = pessoas × horas por pessoa (T1, T2, sábado) e dia útil = T1 + T2 | refaz pelos parâmetros e compara com `capacidadeDoDia` de cada dia |
| C2 | Limite do turno só é estourado por saldo ≤ 4 h | para todo turno: HH − cap ≤ Σ `acima` + 0,5 (fixações que passam ficam VERIFICAR) |
| C3 | Nenhuma atividade em domingo, feriado ou 2º turno de sábado | nenhuma linha em turno sem capacidade |
| C4 | Programado no Saldo HH = Programação (MEC e ELE) | Σ V3 = Σ linhas |
| C5 | Itens IP19 com data programada = HH da Programação (MEC e ELE) | Σ hh dos itens referenciados = Σ hh das linhas; nenhum item em duas linhas |
| C6 | IP19 = Programado + Sem HH (MEC e ELE, todos os meses) | Σ demandas (menos retirados) = Σ linhas + Σ semHh |
| C7 | Resumo dos calendários = Saldo HH | Σ V2 por mês = Σ V3 por mês |
| C8 | Nenhum turno vazio (dia útil com T1 e T2; sábado útil com T1) | lista os dias vazios no detalhe |
| C9 | Sem alertas de regra na Programação | `alertas().length === 0` (detalhe: quantos por código) |
| C10 | Backlog (IW38 + manual) não passa do saldo do dia (saldo final ≥ 0) | "—" sem alocação (antes da parte 4) |
| C11 | IW38: pendente = já no calendário + alocado + sem saldo | "—" sem alocação (antes da parte 4) |

C4, C5 e C7 são invariantes (todas as visões vêm do mesmo resultado); continuam calculadas para pegar erro de código
e mudança de edição.

## 10. Parâmetros editáveis e persistência

Cadastro **`programacao_paradas.json`** (`lerCadastro`/`gravarCadastroLote`, mesclar = true):

| item | conteúdo |
|---|---|
| `parametros` | `Partial<Parametros>` — só o que difere do padrão; `parametrosDe(cad)` mescla com `PARAMETROS_PADRAO` e valida (números ≥ 0, regex compila, datas válidas; inválido → padrão + aviso) |
| `fixacao:<id>` | `Fixacao` (id = `mes|ativo|parada`) |
| `backlog_manual:<AAAA-MM-DD>` | `{ mec, ele }` (parte 4) |
| `hist:<iso>-<n>` | `{ quando, por, acao: "mover" \| "desfazer" \| "parametros" \| "extra", antes, depois }` — histórico visível na aba (últimos 200; o resto continua nas cópias do `cadastros_historico`) |

Padrões (`PARAMETROS_PADRAO`, em `lib/paradas/parametros.ts`) = os da planilha: turnos §4, `maxAtivosDia` 7,
`maxParadasMes` 2, `estouro` 4/4, `antecipacaoDias` 3, `padraoSemanal`, `ordemCriticos`, `rodizioMoinhos`
[MOINHO 02, 05, 07], `juntos` [MOINHO 04 com BANBURY], `tiposPrimeiroT2` [GOLDEN, TIEN KANG, PVC],
`tiposPreferenciaT1` [PANSTONE], `tiposSabadoPreenchimento` [GOLDEN, PVC, TIEN KANG, PANSTONE], `hhIrrelevante`
{INJETORA, 0,2}, `localizacoes` [GAL1], `centrosEliminados` [ELMC_MTZ, OPER_MTZ], `unidadePadraoIp19` MIN, `meses` 3,
`classes`/`agrupamentos` da §2.6, feriados nacionais.

**Impacto imediato:** o motor é TS puro sem `server-only`; a página manda ao cliente a `EntradaMotor` compacta
(itens só com chave, ativo, mês, data, disciplina, hh, ordem) e o cliente roda `programar` + `alertas` + visões a cada
arraste/edição antes de salvar. "Salvar" grava as fixações; "Descartar" volta ao salvo.

## 11. Acesso

- Aba `programacao_paradas` em `GRUPOS` → "Planejamento", rota `/programacao_paradas`, ícone `CalendarCog` (já no
  mapa de `Icone.tsx`). Regra de CLAUDE.md: entra em `TODAS`; Líder/Analista no "Padrão da função" veem; Manutentor e
  Terceiro só se o administrador marcar; lista própria só se marcada.
- Página: `exigir("programacao_paradas")`. Gravar (fixações, parâmetros, backlog manual): `autorizar(aba, true)` e
  **não** `soEstoque(u)` (Terceiro/Manutentor só leem). Exportação IW32: quem vê a aba.

## 12. Fora da v1

- Outras localizações e setores (o parâmetro `localizacoes` já existe; regras de classes de outras áreas não).
- Reajustes (4) e (5) da planilha (mover não crítico para abrir HH; levar paradas com saldo para dias de INJ EXP).
- Troca de **status** na IW32 (só datas); escrita direta no SAP (o site gera CSV + VBS).
- Divisão de um item em partes; mais de 2 paradas por mês; alocação de pessoas por nome.
- Semanas "estáticas" de painéis passados (a programação começa em `inicio`; o passado não é refeito).
- Chamadas atrasadas de meses anteriores ao início (aparecem só na aba Planos).
- Peças por parada (Materiais): **opcional** na parte 3 — por parada, materiais reservados (IW13: reservado −
  tomados) das ordens da parada, com saldo no MB52; somente leitura.
