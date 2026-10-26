import { acharColuna, texto } from "@/lib/dados/texto";

/**
 * Inclusão das peças da Gestão de MRO nos componentes das listas de tarefas do SAP (transação IA06), por um script
 * VBS que roda no PC com o SAP GUI aberto — o site não fala com o SAP: ele gera o CSV da carga e o script.
 *
 * Lista de tarefas de cada equipamento: as ordens do IW38 dizem o plano de cada equipamento; a IP19 diz o grupo e o
 * numerador da lista de tarefas de cada plano. Testado em testes/mro-ia06.test.ts.
 */

/**
 * equipamentos: quantos equipamentos têm plano nesta lista (lista geral compartilhada = mais de 1). subconjunto: a lista é
 * de um subconjunto do ativo (o nome dele), não do próprio ativo.
 */
export interface ListaTarefas { grupo: string; numerador: string; planos: string[]; texto: string; equipamentos: number; subconjunto?: string }
export interface ItemInclusao {
  /** equipamento: o ativo que pediu a peça, já identificado (ver identificarAtivo) */
  grupo: string; numerador: string; operacao: string; material: string; quantidade: number; um: string; texto: string; equipamento: string;
  /** quantos equipamentos usam a lista (informativo na planilha) */
  usoLista?: number;
}

type Linha = Record<string, unknown>;
/** Uma lista de tarefas ligada direto a um equipamento (linha da IP19). */
export interface ListaDireta { equipChave: string; plano: string; grupo: string; numerador: string; texto: string }

/** Plano → grupo/numerador da lista de tarefas (colunas "Grupo listas tarefas" e "Numerador de grupos" da IP19). */
export function listasPorPlano(ip19: Linha[] | null | undefined): Map<string, { grupo: string; numerador: string; texto: string }> {
  const out = new Map<string, { grupo: string; numerador: string; texto: string }>();
  if (!ip19?.length) return out;
  const cols = Object.keys(ip19[0]);
  const cPlano = acharColuna(cols, ["^PLANO( DE)? MANUT", "^PLANO$"]);
  const cGrupo = acharColuna(cols, ["GRUPO LISTAS? (DE )?TAREFAS?", "GRUPO.*LISTA", "^GRUPO$"], "PLANEJ|PLNJ");
  const cNum = acharColuna(cols, ["NUMERADOR DE GRUPOS?", "^NUMERADOR$", "^CONTADOR( DE GRUPOS?)?$"]);
  const cTexto = acharColuna(cols, ["TEXTO.*PLANO"]);
  if (!cPlano || !cGrupo) return out;
  for (const l of ip19) {
    const plano = texto(l[cPlano]), grupo = texto(l[cGrupo]);
    if (!plano || !grupo || out.has(plano)) continue;
    out.set(plano, { grupo, numerador: cNum ? texto(l[cNum]) : "", texto: cTexto ? texto(l[cTexto]) : "" });
  }
  return out;
}

/**
 * Equipamento → listas de tarefas dos planos dele (sem repetir grupo + numerador), pelas ordens do IW38. Cada lista diz
 * quantos equipamentos a usam: lista geral compartilhada recebe a peça de todos eles.
 */
export function listasPorEquipamento(ordens: { equipChave: string; plano: string }[],
  porPlano: Map<string, { grupo: string; numerador: string; texto: string }>, diretas: ListaDireta[] = []): Map<string, ListaTarefas[]> {
  const out = new Map<string, Map<string, ListaTarefas>>();
  const usos = new Map<string, Set<string>>();
  const pares = [...ordens.map((o) => ({ o, l: o.plano ? porPlano.get(o.plano) : undefined })), ...diretas.map((d) => ({ o: d, l: d }))];
  for (const { o, l } of pares) {
    if (!o.equipChave || !l) continue;
    const k = `${l.grupo}|${l.numerador}`;
    (usos.get(k) ?? usos.set(k, new Set()).get(k)!).add(o.equipChave);
    const m = out.get(o.equipChave) ?? out.set(o.equipChave, new Map()).get(o.equipChave)!;
    const x = m.get(k) ?? m.set(k, { grupo: l.grupo, numerador: l.numerador, planos: [], texto: l.texto, equipamentos: 0 }).get(k)!;
    if (o.plano && !x.planos.includes(o.plano)) x.planos.push(o.plano);
  }
  return new Map([...out].map(([eq, m]) => [eq, [...m.values()]
    .map((x) => ({ ...x, equipamentos: usos.get(`${x.grupo}|${x.numerador}`)?.size ?? 1 }))
    .sort((a, b) => (a.grupo + a.numerador).localeCompare(b.grupo + b.numerador))]));
}

/**
 * Lista de cada linha da IP19 com o equipamento dela (coluna Equipamento): o plano do equipamento mesmo sem ordem no
 * IW38, e todas as listas do plano (um plano pode ter várias listas, uma por item).
 */
export function listasDiretasDaIp19(ip19: Linha[] | null | undefined): ListaDireta[] {
  if (!ip19?.length) return [];
  const cols = Object.keys(ip19[0]);
  const cPlano = acharColuna(cols, ["^PLANO( DE)? MANUT", "^PLANO$"]), cEq = acharColuna(cols, ["^EQUIPAMENTO$"]);
  const cGrupo = acharColuna(cols, ["GRUPO LISTAS? (DE )?TAREFAS?", "GRUPO.*LISTA", "^GRUPO$"], "PLANEJ|PLNJ");
  const cNum = acharColuna(cols, ["NUMERADOR DE GRUPOS?", "^NUMERADOR$", "^CONTADOR( DE GRUPOS?)?$"]);
  const cTexto = acharColuna(cols, ["TEXTO.*PLANO"]);
  if (!cEq || !cGrupo) return [];
  return ip19.map((l) => ({ equipChave: texto(l[cEq]), plano: cPlano ? texto(l[cPlano]) : "", grupo: texto(l[cGrupo]),
    numerador: cNum ? texto(l[cNum]) : "", texto: cTexto ? texto(l[cTexto]) : "" })).filter((x) => x.equipChave && x.grupo);
}

/**
 * Soma às listas de cada equipamento as listas dos subconjuntos dele (até 3 níveis abaixo), com o nome do subconjunto:
 * a máquina costuma não ter plano próprio, só os subconjuntos (acionamento, lubrificação…).
 */
export function comListasDosSubconjuntos(listas: Map<string, ListaTarefas[]>,
  equips: { equipamento: string; denominacao: string; superior?: string }[]): Map<string, ListaTarefas[]> {
  const filhos = new Map<string, { equipamento: string; denominacao: string }[]>();
  for (const e of equips) if (e.superior && e.superior !== e.equipamento) (filhos.get(e.superior) ?? filhos.set(e.superior, []).get(e.superior)!).push(e);
  const out = new Map(listas);
  for (const pai of new Set([...filhos.keys()])) {
    const proprias = listas.get(pai) ?? [];
    const vistas = new Set(proprias.map((l) => `${l.grupo}|${l.numerador}`));
    const extras: ListaTarefas[] = [];
    const visitar = (cod: string, nivel: number) => {
      if (nivel > 3) return;
      for (const f of filhos.get(cod) ?? []) {
        for (const l of listas.get(f.equipamento) ?? []) {
          const k = `${l.grupo}|${l.numerador}`;
          if (vistas.has(k)) continue;
          vistas.add(k);
          extras.push({ ...l, subconjunto: l.subconjunto ?? `${f.denominacao} (${f.equipamento})` });
        }
        visitar(f.equipamento, nivel + 1);
      }
    };
    visitar(pai, 1);
    if (extras.length) out.set(pai, [...proprias, ...extras]);
  }
  return out;
}

/** "10" → "0010" (o número da operação como o SAP mostra). */
export function operacao4(op: string): string {
  const o = String(op ?? "").trim();
  return /^\d{1,3}$/.test(o) ? o.padStart(4, "0") : o;
}

const limpo = (s: unknown, n = 60) => String(s ?? "").replace(/[;|\r\n\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const qtdBr = (q: number) => String(Math.round(q * 1000) / 1000).replace(".", ",");
/** Material sem zeros à esquerda e em maiúsculas: "000123" e "123" são o mesmo material no SAP. */
const chaveMaterial = (m: string) => String(m ?? "").trim().toUpperCase().replace(/^0+(?=.)/, "");

/** Como o ativo aparece na carga e nos logs do script: campo de ordenação (equipamento) e o nome. */
export function identificarAtivo(a: { codigo: string; campo?: string; nome?: string }): string {
  const campo = (a.campo ?? "").trim(), cod = (a.codigo ?? "").trim();
  const id = campo && campo.toUpperCase() !== cod.toUpperCase() ? `${campo} (${cod})` : cod || campo;
  return limpo([id, limpo(a.nome, 40)].filter(Boolean).join(" - "), 90);
}

export const CABECALHO_CSV = "EXECUTAR;GRUPO;CONTADOR;OPERACAO;MATERIAL;QUANTIDADE;UM;TEXTO;ATIVOS;QTD_ATIVOS;EQUIPAMENTOS_DA_LISTA";

/**
 * CSV da carga do script (o mesmo leiaute do script de remoção nas 8 primeiras colunas: EXECUTAR = X processa a linha).
 * Um material entra UMA vez em cada lista de tarefas (grupo + contador), nunca repetido — nem em outra operação, nem
 * com zeros à esquerda diferentes. A coluna ATIVOS diz para quais ativos (campo de ordenação, equipamento e nome) a
 * peça está sendo incluída: numa lista geral compartilhada, todos eles numa linha só.
 * `marcar` = false deixa EXECUTAR em branco.
 */
export function csvInclusao(itens: ItemInclusao[], marcar = true): string {
  const porChave = new Map<string, { i: ItemInclusao; op: string; ativos: string[] }>();
  for (const i of itens) {
    const op = operacao4(i.operacao), mat = chaveMaterial(i.material);
    if (!i.grupo || !op || !mat) continue;
    const k = `${i.grupo.trim().toUpperCase()}|${String(i.numerador ?? "").trim()}|${mat}`;
    const x = porChave.get(k) ?? porChave.set(k, { i, op, ativos: [] }).get(k)!;
    const eq = limpo(i.equipamento, 90);
    if (eq && !x.ativos.includes(eq)) x.ativos.push(eq);
  }
  const linhas = [CABECALHO_CSV];
  for (const { i, op, ativos } of porChave.values())
    linhas.push([marcar ? "X" : "", limpo(i.grupo, 20), limpo(i.numerador, 4), op, limpo(i.material, 40), qtdBr(i.quantidade > 0 ? i.quantidade : 1),
      limpo(i.um, 6), limpo(i.texto), ativos.join(" | ").slice(0, 900), ativos.length, i.usoLista ?? ""].join(";"));
  return linhas.join("\r\n") + "\r\n";
}

/** Texto → bytes em Windows-1252/Latin-1 (o que o VBScript lê sem embaralhar acentos); fora disso vira "?". */
export function ansi(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); b[i] = c < 256 ? c : 63; }
  return b;
}

export const ARQ_CSV = "SAP_IA06_INCLUIR_materiais.csv", ARQ_VBS = "SAP_IA06_INCLUIR_materiais.vbs";

/**
 * O script de inclusão: o mesmo esqueleto do script de remoção (abre a lista, a operação e os componentes, confere na
 * tela, grava a lista inteira de uma vez, anota feitos e pendentes com o motivo), trocando "eliminar" por "incluir na
 * primeira linha livre". Acha o CSV na pasta do script ou, rodando de dentro do SAP (onde o script não sabe a própria pasta), na pasta atual,
 * em Downloads/Área de Trabalho/Documentos do usuário do Windows (%USERPROFILE%) ou na pasta que a pessoa digitar —
 * nenhum caminho pessoal fica no script.
 */
export function scriptInclusao(modoTeste: boolean): string {
  return VBS.replace("@@MODO_TESTE@@", modoTeste ? "True" : "False").replace(/\n/g, "\r\n");
}

const VBS = String.raw`' =====================================================================================
'  SAP GUI Scripting - IA06: INCLUI componentes (materiais) nas operacoes das listas de
'  tarefas, a partir do arquivo SAP_IA06_INCLUIR_materiais.csv gerado pela Gestao de MRO.
'
'  Como usar: salve este script e o CSV na MESMA pasta, abra o SAP na tela inicial e de
'  dois cliques no script.
'  - So processa linhas com EXECUTAR = X. Cada linha: grupo, contador, operacao, material,
'    quantidade (com virgula decimal, como no SAP em portugues). A unidade do CSV e so
'    informativa: o SAP propoe a unidade basica do material.
'  - Inclui o material na primeira linha livre dos componentes da operacao (categoria L).
'  - Material que ja esta na operacao conta como feito (nada e alterado).
'  - Um material entra UMA vez em cada lista (grupo + contador): linha repetida no CSV
'    (mesmo material na mesma lista, em qualquer operacao) e o que ja foi incluido antes sao pulados.
'  - A coluna ATIVOS diz para quais ativos a peca foi incluida: vai para o log, para
'    SAP_IA06_INCLUIR_incluidos.csv e para os pendentes.
'  - Confere na tela se o material entrou ANTES de gravar. Se nao entrou, a lista nao e gravada.
'  - O que nao der certo vai para SAP_IA06_INCLUIR_pendentes.csv, com o motivo, e o script segue.
'  MODO_TESTE = True  -> inclui na tela mas NAO grava. MODO_TESTE = False -> grava.
'  Rode primeiro em modo teste e confira o log; depois troque para False.
' =====================================================================================
Option Explicit

' ----------------------------- CONFIGURACAO ---------------------------------------
Const MODO_TESTE = @@MODO_TESTE@@
Const ARQ_CSV = "SAP_IA06_INCLUIR_materiais.csv"
Const ARQ_FEITOS = "SAP_IA06_INCLUIR_incluidos.csv"
Const ARQ_PEND = "SAP_IA06_INCLUIR_pendentes.csv"
Const ARQ_LOG = "SAP_IA06_INCLUIR_log.txt"
Const ARQ_TELAS = "SAP_IA06_INCLUIR_telas.txt"
Const TCODE = "IA06"
Const CAMPO_GRUPO = "RC271-PLNNR"         ' tela inicial: grupo da lista de tarefas
Const CAMPO_CONTADOR = "RC271-PLNAL"      ' tela inicial: numerador de grupos
Const COL_ROTEIRO = "PLKOD-PLNAL"         ' sintese geral de roteiros: numerador
Const BOTAO_OPERACAO = "wnd[0]/tbar[1]/btn[17]"   ' sintese geral de roteiros: botao "Operacao"
Const COL_OPERACAO = "PLPOD-VORNR"        ' sintese de operacoes: numero da operacao
Const BOTAO_COMPONENTES = "ompon"         ' trecho do texto do botao "Componentes"
' Colunas da tela de componentes: "*" = qualquer estrutura; "|" separa alternativas
Const COL_MATERIAL = "*-IDNRK|*-MATNR"    ' material
Const COL_QUANTIDADE = "*-MENGE|*-BDMNG"  ' quantidade
Const COL_CATEGORIA = "*-POSTP"           ' categoria do item (L)
Const MAX_TELA_RUIM = 4                   ' telas nao reconhecidas seguidas ate o script parar
' -----------------------------------------------------------------------------------

Dim fso, pasta, session, cacheCol
Dim feitos, feitosMat, pendDic, total, jaEstavam, erros, nPend, parar, telaRuim, repetidos
Set fso = CreateObject("Scripting.FileSystemObject")
Set cacheCol = CreateObject("Scripting.Dictionary")
pasta = AchaPasta()

' Pasta do CSV: a do script (duplo clique). Rodando de dentro do SAP (Alt+F12 > Gravacao e reproducao de scripts) o
' script nao sabe onde esta salvo: procura o CSV na pasta atual, em Downloads, na Area de Trabalho e em Documentos do
' usuario do Windows; se nao achar, pergunta a pasta.
Function AchaPasta()
    Dim sh, perfil, dirScript, cands, c, resp
    AchaPasta = ""
    dirScript = ""
    perfil = ""
    On Error Resume Next
    dirScript = fso.GetParentFolderName(WScript.ScriptFullName) & "\"
    Err.Clear
    cands = Array(dirScript)
    Set sh = CreateObject("WScript.Shell")
    perfil = sh.ExpandEnvironmentStrings("%USERPROFILE%")
    cands = Array(dirScript, sh.CurrentDirectory & "\", perfil & "\Downloads\", perfil & "\Desktop\", perfil & "\Documents\", _
                  perfil & "\OneDrive\Desktop\", perfil & "\OneDrive\Documentos\")
    Err.Clear
    On Error GoTo 0
    For Each c In cands
        If c <> "" And c <> "\" Then
            If fso.FileExists(c & ARQ_CSV) Then
                AchaPasta = c
                Exit Function
            End If
        End If
    Next
    resp = InputBox("Nao achei o arquivo " & ARQ_CSV & "." & vbCrLf & "Informe a pasta onde ele esta salvo:", "IA06 - pasta do CSV", perfil & "\Downloads\")
    resp = Trim(resp)
    If resp <> "" And Right(resp, 1) <> "\" Then resp = resp & "\"
    AchaPasta = resp
End Function

Principal

' ================================ FUNCOES DE APOIO =================================
Function IIf(c, a, b)
    If c Then IIf = a Else IIf = b
End Function

Function SoAnsi(s)
    Dim i, c, r
    r = ""
    For i = 1 To Len(s)
        c = Mid(s, i, 1)
        If AscW(c) > 255 Or AscW(c) < 0 Then c = "?"
        r = r & c
    Next
    SoAnsi = r
End Function

Sub Registra(msg)
    Dim f
    On Error Resume Next
    Set f = fso.OpenTextFile(pasta & ARQ_LOG, 8, True)
    f.WriteLine Now & " | " & SoAnsi(msg)
    f.Close
    Err.Clear
    On Error GoTo 0
End Sub

Sub AnotaFeito(campos, origem)
    Dim f, chaveItem
    chaveItem = ChaveItem(campos)
    feitos(chaveItem) = True
    feitosMat(ChaveMaterial(campos)) = True
    On Error Resume Next
    Set f = fso.OpenTextFile(pasta & ARQ_FEITOS, 8, True)
    f.WriteLine chaveItem & ";" & Now & ";" & origem & ";" & Ativos(campos)
    f.Close
    Err.Clear
    On Error GoTo 0
End Sub

Sub Pendente(campos, motivo)
    Dim f, novo, m, txt, chItem
    chItem = ChaveItem(campos)
    If pendDic.Exists(chItem) Or feitos.Exists(chItem) Then Exit Sub
    pendDic.Add chItem, True
    nPend = nPend + 1
    m = SoAnsi(Trim(Replace(Replace(Replace(motivo, ";", ","), vbCr, " "), vbLf, " ")))
    txt = ""
    If UBound(campos) >= 7 Then txt = campos(7)
    Registra "PEND | lista " & campos(1) & "/" & campos(2) & " op " & campos(3) & " | material " & campos(4) & " | " & m & " | ativos " & Ativos(campos)
    On Error Resume Next
    novo = Not fso.FileExists(pasta & ARQ_PEND)
    Set f = fso.OpenTextFile(pasta & ARQ_PEND, 8, True)
    If novo Then f.WriteLine "GRUPO;CONTADOR;OPERACAO;MATERIAL;QUANTIDADE;UM;TEXTO;MOTIVO;DATA;ATIVOS"
    f.WriteLine campos(1) & ";" & campos(2) & ";" & campos(3) & ";" & campos(4) & ";" & campos(5) & ";" & campos(6) & ";" & txt & ";" & m & ";" & Now & ";" & Ativos(campos)
    f.Close
    Err.Clear
    On Error GoTo 0
End Sub

Function ConectaSAP()
    Dim gui, app, con
    Set ConectaSAP = Nothing
    On Error Resume Next
    Set gui = GetObject("SAPGUI")
    If Err.Number <> 0 Then
        MsgBox "SAP GUI nao esta aberto ou o scripting esta desabilitado.", vbCritical
        Exit Function
    End If
    Set app = gui.GetScriptingEngine
    Set con = app.Children(0)
    Set ConectaSAP = con.Children(0)
    If Err.Number <> 0 Then
        Set ConectaSAP = Nothing
        MsgBox "Nao encontrei uma sessao SAP aberta.", vbCritical
    End If
    On Error GoTo 0
End Function

Function Casa(nomeReal, padrao)
    Dim alt, p
    Casa = False
    For Each alt In Split(padrao, "|")
        p = Trim(alt)
        If Left(p, 1) = "*" Then
            p = Mid(p, 2)
            If Len(nomeReal) >= Len(p) Then
                If Right(nomeReal, Len(p)) = p Then Casa = True
            End If
        ElseIf nomeReal = p Then
            Casa = True
        End If
        If Casa Then Exit Function
    Next
End Function

Function AchaEntrada(cont, nome)
    Dim i, filho, r, tp
    Set AchaEntrada = Nothing
    On Error Resume Next
    For i = 0 To cont.Children.Count - 1
        Set filho = cont.Children(CInt(i))
        tp = filho.Type
        If filho.Name = nome And (tp = "GuiTextField" Or tp = "GuiCTextField" Or tp = "GuiComboBox") Then
            Set AchaEntrada = filho
            Exit Function
        End If
        If filho.ContainerType And tp <> "GuiTableControl" Then
            Set r = AchaEntrada(filho, nome)
            If Not r Is Nothing Then
                Set AchaEntrada = r
                Exit Function
            End If
        End If
    Next
    On Error GoTo 0
End Function

Function Preenche(nome, valor)
    Dim c
    Preenche = False
    Set c = AchaEntrada(session.findById("wnd[0]/usr"), nome)
    If c Is Nothing Then
        DespejaTela "Campo de entrada nao encontrado: " & nome
        Exit Function
    End If
    On Error Resume Next
    c.Text = valor
    If Err.Number <> 0 Then
        Err.Clear
        On Error GoTo 0
        DespejaTela "Campo nao aceita digitacao: " & nome & " (" & c.Id & ")"
        Exit Function
    End If
    On Error GoTo 0
    Preenche = True
End Function

Function IndiceColuna(tab, padrao)
    Dim i, filho, id, p1, p2, ch
    ch = tab.Name & "|" & padrao
    If cacheCol.Exists(ch) Then
        IndiceColuna = cacheCol(ch)
        Exit Function
    End If
    IndiceColuna = -1
    On Error Resume Next
    For i = 0 To tab.Children.Count - 1
        Set filho = tab.Children(CInt(i))
        If Casa(filho.Name, padrao) And filho.Type <> "GuiLabel" Then
            id = filho.Id
            p1 = InStrRev(id, "[")
            p2 = InStrRev(id, ",")
            If p1 > 0 And p2 > p1 Then
                IndiceColuna = CInt(Mid(id, p1 + 1, p2 - p1 - 1))
                Exit For
            End If
        End If
    Next
    On Error GoTo 0
    If IndiceColuna >= 0 Then cacheCol.Add ch, IndiceColuna
End Function

Function AchaTabela(cont, padraoColuna)
    Dim i, filho, r
    Set AchaTabela = Nothing
    On Error Resume Next
    For i = 0 To cont.Children.Count - 1
        Set filho = cont.Children(CInt(i))
        If filho.Type = "GuiTableControl" Then
            If IndiceColuna(filho, padraoColuna) >= 0 Then
                Set AchaTabela = filho
                Exit Function
            End If
        ElseIf filho.ContainerType Then
            Set r = AchaTabela(filho, padraoColuna)
            If Not r Is Nothing Then
                Set AchaTabela = r
                Exit Function
            End If
        End If
    Next
    On Error GoTo 0
End Function

Function Celula(tab, padraoColuna, linhaVisivel)
    Dim col
    Set Celula = Nothing
    col = IndiceColuna(tab, padraoColuna)
    If col < 0 Then Exit Function
    On Error Resume Next
    Set Celula = tab.GetCell(CLng(linhaVisivel), CLng(col))
    If Err.Number <> 0 Then Set Celula = Nothing
    Err.Clear
    On Error GoTo 0
End Function

Function AchaBotao(cont, trecho)
    Dim i, filho, r, txt
    Set AchaBotao = Nothing
    On Error Resume Next
    For i = 0 To cont.Children.Count - 1
        Set filho = cont.Children(CInt(i))
        If filho.Type = "GuiButton" Then
            txt = ""
            txt = filho.Text & " " & filho.Tooltip
            If InStr(1, txt, trecho, vbTextCompare) > 0 Then
                Set AchaBotao = filho
                Exit Function
            End If
        ElseIf filho.ContainerType And filho.Type <> "GuiTableControl" Then
            Set r = AchaBotao(filho, trecho)
            If Not r Is Nothing Then
                Set AchaBotao = r
                Exit Function
            End If
        End If
    Next
    On Error GoTo 0
End Function

Sub DespejaTela(motivo)
    Dim f
    On Error Resume Next
    Set f = fso.OpenTextFile(pasta & ARQ_TELAS, 8, True)
    f.WriteLine String(100, "=")
    f.WriteLine Now & " | " & motivo
    f.WriteLine "Transacao: " & session.Info.Transaction & " | Programa: " & session.Info.Program & " | Tela: " & session.Info.ScreenNumber
    f.WriteLine "Barra de status: " & session.findById("wnd[0]/sbar").Text
    DespejaRec session.findById("wnd[0]"), f, 0
    f.WriteLine "--- janela wnd[1] (popup), se houver ---"
    DespejaRec session.findById("wnd[1]"), f, 0
    f.Close
    Err.Clear
    On Error GoTo 0
End Sub

Sub DespejaRec(cont, f, nivel)
    Dim i, filho, txt
    On Error Resume Next
    For i = 0 To cont.Children.Count - 1
        Set filho = cont.Children(CInt(i))
        txt = ""
        txt = filho.Text
        f.WriteLine Space(nivel * 2) & filho.Type & " | " & filho.Id & " | " & filho.Name & " | " & txt
        If filho.ContainerType And nivel < 6 Then DespejaRec filho, f, nivel + 1
    Next
    On Error GoTo 0
End Sub

Sub Comando(cod)
    session.findById("wnd[0]/tbar[0]/okcd").Text = cod
    session.findById("wnd[0]").sendVKey 0
End Sub

Function BarraStatus()
    BarraStatus = session.findById("wnd[0]/sbar").MessageType & " " & session.findById("wnd[0]/sbar").Text
End Function

Function TemPopup()
    TemPopup = (session.Children.Count > 1)
End Function

Function TextosDe(cont, nivel)
    Dim i, filho, t, s
    s = ""
    On Error Resume Next
    For i = 0 To cont.Children.Count - 1
        Set filho = cont.Children(CInt(i))
        t = ""
        If filho.Type = "GuiLabel" Or filho.Type = "GuiTextField" Or filho.Type = "GuiCTextField" Then t = Trim(filho.Text)
        If t <> "" Then s = s & t & " "
        If filho.ContainerType And nivel < 5 Then s = s & TextosDe(filho, nivel + 1)
    Next
    On Error GoTo 0
    TextosDe = s
End Function

Function TextoPopup()
    Dim w, s
    s = ""
    On Error Resume Next
    Set w = session.findById("wnd[1]")
    s = w.Text & ": " & TextosDe(w, 0)
    Err.Clear
    On Error GoTo 0
    s = Trim(Replace(Replace(s, vbCr, " "), vbLf, " "))
    If Len(s) > 250 Then s = Left(s, 250)
    TextoPopup = s
End Function

Sub FechaPopups(comEnter)
    Dim n
    n = 0
    On Error Resume Next
    Do While session.Children.Count > 1 And n < 4
        If comEnter And n < 2 Then
            session.findById("wnd[1]").sendVKey 0
        Else
            session.findById("wnd[1]").sendVKey 12
        End If
        n = n + 1
    Loop
    Err.Clear
    On Error GoTo 0
End Sub

Sub SaiSemGravar()
    On Error Resume Next
    FechaPopups False
    Comando "/n"
    If session.Children.Count > 1 Then session.findById("wnd[1]/usr/btnSPOP-OPTION2").press
    FechaPopups False
    Err.Clear
    On Error GoTo 0
End Sub

Function NaSintese()
    Dim usr
    NaSintese = False
    If TemPopup() Then Exit Function
    Set usr = session.findById("wnd[0]/usr")
    If AchaTabela(usr, COL_OPERACAO) Is Nothing Then Exit Function
    If Not AchaTabela(usr, COL_MATERIAL) Is Nothing Then Exit Function
    NaSintese = True
End Function

' =============================== PASSOS DA TRANSACAO ================================
Function AbreLista(grupo, contador)
    Dim tab, lin, cel, b, tp
    AbreLista = ""
    FechaPopups False
    Comando "/n" & TCODE
    If Not Preenche(CAMPO_GRUPO, grupo) Then
        AbreLista = "tela inicial diferente do esperado"
        Exit Function
    End If
    If Not AchaEntrada(session.findById("wnd[0]/usr"), CAMPO_CONTADOR) Is Nothing Then Preenche CAMPO_CONTADOR, contador
    session.findById("wnd[0]").sendVKey 0
    tp = session.findById("wnd[0]/sbar").MessageType
    If tp = "E" Or tp = "A" Then
        AbreLista = "ERRO SAP: " & session.findById("wnd[0]/sbar").Text
        Exit Function
    End If
    If TemPopup() Then
        AbreLista = "POPUP ao abrir a lista: " & TextoPopup()
        DespejaTela "Popup ao abrir a lista " & grupo
        Exit Function
    End If
    If Not AchaTabela(session.findById("wnd[0]/usr"), COL_OPERACAO) Is Nothing Then Exit Function
    Set tab = AchaTabela(session.findById("wnd[0]/usr"), COL_ROTEIRO)
    If Not tab Is Nothing Then
        For lin = 0 To tab.VisibleRowCount - 1
            Set cel = Celula(tab, COL_ROTEIRO, lin)
            If Not cel Is Nothing Then
                If Trim(cel.Text) <> "" Then
                    If CLng("0" & Trim(cel.Text)) = CLng("0" & Trim(contador)) Then
                        tab.GetAbsoluteRow(lin).Selected = True
                        Exit For
                    End If
                End If
            End If
        Next
    End If
    On Error Resume Next
    Set b = Nothing
    Set b = session.findById(BOTAO_OPERACAO)
    If b Is Nothing Then Set b = AchaBotao(session.findById("wnd[0]/tbar[1]"), "Opera")
    On Error GoTo 0
    If b Is Nothing Then
        DespejaTela "Botao Operacao nao encontrado na lista " & grupo
        AbreLista = "botao Operacao nao encontrado"
        Exit Function
    End If
    b.press
    If AchaTabela(session.findById("wnd[0]/usr"), COL_OPERACAO) Is Nothing Then
        DespejaTela "Sintese de operacoes nao abriu na lista " & grupo
        AbreLista = "sintese de operacoes nao abriu"
    End If
End Function

Function SelecionaOperacao(numOp)
    Dim tab, pos, lin, cel, maxPos, vis, achouPos, achouLin, base
    SelecionaOperacao = False
    Set tab = AchaTabela(session.findById("wnd[0]/usr"), COL_OPERACAO)
    If tab Is Nothing Then
        DespejaTela "Tabela de operacoes nao encontrada (coluna " & COL_OPERACAO & ")"
        Exit Function
    End If
    maxPos = tab.VerticalScrollbar.Maximum
    vis = tab.VisibleRowCount
    achouPos = -1
    pos = 0
    Do
        If pos > maxPos Then pos = maxPos
        If tab.VerticalScrollbar.Position <> pos Then
            tab.VerticalScrollbar.Position = pos
            Set tab = AchaTabela(session.findById("wnd[0]/usr"), COL_OPERACAO)
        End If
        base = tab.VerticalScrollbar.Position
        For lin = 0 To vis - 1
            Set cel = Celula(tab, COL_OPERACAO, lin)
            If Not cel Is Nothing Then
                If Trim(cel.Text) <> "" Then
                    On Error Resume Next
                    If tab.GetAbsoluteRow(base + lin).Selected Then tab.GetAbsoluteRow(base + lin).Selected = False
                    Err.Clear
                    On Error GoTo 0
                    If Trim(cel.Text) = numOp And achouPos < 0 Then
                        achouPos = base
                        achouLin = lin
                    End If
                End If
            End If
        Next
        If pos >= maxPos Then Exit Do
        pos = pos + vis
    Loop
    If achouPos < 0 Then Exit Function
    If tab.VerticalScrollbar.Position <> achouPos Then
        tab.VerticalScrollbar.Position = achouPos
        Set tab = AchaTabela(session.findById("wnd[0]/usr"), COL_OPERACAO)
    End If
    tab.GetAbsoluteRow(achouPos + achouLin).Selected = True
    SelecionaOperacao = True
End Function

Function AbreComponentes()
    Dim b
    AbreComponentes = False
    Set b = AchaBotao(session.findById("wnd[0]/usr"), BOTAO_COMPONENTES)
    If b Is Nothing Then
        DespejaTela "Botao de componentes nao encontrado (texto contendo '" & BOTAO_COMPONENTES & "')"
        Exit Function
    End If
    b.press
    If AchaTabela(session.findById("wnd[0]/usr"), COL_MATERIAL) Is Nothing Then
        DespejaTela "Botao de componentes pressionado, mas a tabela de componentes nao foi reconhecida"
        Exit Function
    End If
    AbreComponentes = True
End Function

Function GravaLista()
    Dim tp, n
    GravaLista = ""
    session.findById("wnd[0]").sendVKey 11
    n = 0
    Do While n < 3
        If TemPopup() Then Exit Do
        If session.findById("wnd[0]/sbar").MessageType <> "W" Then Exit Do
        Registra "AVIS | ao gravar: " & session.findById("wnd[0]/sbar").Text & " (confirmado com Enter)"
        session.findById("wnd[0]").sendVKey 0
        n = n + 1
    Loop
    If TemPopup() Then
        GravaLista = "POPUP ao gravar: " & TextoPopup()
        DespejaTela "Popup ao gravar a lista"
        Exit Function
    End If
    tp = session.findById("wnd[0]/sbar").MessageType
    If tp = "E" Or tp = "A" Or tp = "W" Then GravaLista = BarraStatus()
End Function

Function Op4(op)
    Op4 = Trim(op)
    If IsNumeric(Op4) And Len(Op4) < 4 Then Op4 = Right("0000" & Op4, 4)
End Function

Function ChaveItem(campos)
    ChaveItem = campos(1) & ";" & campos(2) & ";" & campos(3) & ";" & campos(4)
End Function

' Lista + material, sem a operacao e sem zeros a esquerda: o mesmo material nunca entra duas vezes na lista
Function ChaveMaterial(campos)
    ChaveMaterial = UCase(Trim(campos(1))) & ";" & Trim(campos(2)) & ";" & UCase(SemZeros(campos(4)))
End Function

' Ativos para os quais a peca e incluida (coluna ATIVOS do CSV)
Function Ativos(campos)
    Ativos = ""
    If UBound(campos) >= 8 Then Ativos = Trim(campos(8))
End Function

' Codigo sem zeros a esquerda (o SAP pode mostrar o material com ou sem eles)
Function SemZeros(s)
    Dim t
    t = Trim(s)
    Do While Len(t) > 1 And Left(t, 1) = "0"
        t = Mid(t, 2)
    Loop
    SemZeros = t
End Function

' Linha absoluta do material na tela de componentes, ou -1 (percorre todas as paginas, a ultima inclusive)
Function AchaLinhaMaterial(material)
    Dim tab, pos, lin, cel, maxPos, vis, base, alvo
    AchaLinhaMaterial = -1
    alvo = SemZeros(material)
    Set tab = AchaTabela(session.findById("wnd[0]/usr"), COL_MATERIAL)
    If tab Is Nothing Then Exit Function
    maxPos = tab.VerticalScrollbar.Maximum
    vis = tab.VisibleRowCount
    pos = 0
    Do
        If pos > maxPos Then pos = maxPos
        If tab.VerticalScrollbar.Position <> pos Then
            tab.VerticalScrollbar.Position = pos
            Set tab = AchaTabela(session.findById("wnd[0]/usr"), COL_MATERIAL)
        End If
        base = tab.VerticalScrollbar.Position
        For lin = 0 To vis - 1
            Set cel = Celula(tab, COL_MATERIAL, lin)
            If Not cel Is Nothing Then
                If Trim(cel.Text) <> "" Then
                    If SemZeros(cel.Text) = alvo Then
                        AchaLinhaMaterial = base + lin
                        Exit Function
                    End If
                End If
            End If
        Next
        If pos >= maxPos Then Exit Do
        pos = pos + vis
    Loop
End Function

' Primeira linha com o campo de material vazio e editavel, ou -1 (a ultima pagina inclusive)
Function PrimeiraLinhaLivre()
    Dim tab, pos, lin, cel, maxPos, vis, livre, base
    PrimeiraLinhaLivre = -1
    Set tab = AchaTabela(session.findById("wnd[0]/usr"), COL_MATERIAL)
    If tab Is Nothing Then Exit Function
    maxPos = tab.VerticalScrollbar.Maximum
    vis = tab.VisibleRowCount
    pos = 0
    Do
        If pos > maxPos Then pos = maxPos
        If tab.VerticalScrollbar.Position <> pos Then
            tab.VerticalScrollbar.Position = pos
            Set tab = AchaTabela(session.findById("wnd[0]/usr"), COL_MATERIAL)
        End If
        base = tab.VerticalScrollbar.Position
        For lin = 0 To vis - 1
            Set cel = Celula(tab, COL_MATERIAL, lin)
            If Not cel Is Nothing Then
                livre = False
                On Error Resume Next
                livre = (Trim(cel.Text) = "" And cel.Changeable)
                Err.Clear
                On Error GoTo 0
                If livre Then
                    PrimeiraLinhaLivre = base + lin
                    Exit Function
                End If
            End If
        Next
        If pos >= maxPos Then Exit Do
        pos = pos + vis
    Loop
End Function

' Escreve numa celula da linha visivel; True se escreveu (coluna inexistente ou bloqueada = False)
Function Escreve(tab, padrao, lin, valor)
    Dim cel
    Escreve = False
    Set cel = Celula(tab, padrao, lin)
    If cel Is Nothing Then Exit Function
    On Error Resume Next
    If cel.Changeable Then
        cel.Text = valor
        If Err.Number = 0 Then Escreve = True
    End If
    Err.Clear
    On Error GoTo 0
End Function

' Inclui o material na operacao aberta. "" = incluiu; "JA" = ja estava; senao o motivo.
Function IncluiComponente(material, qtd)
    Dim ab, tab, vis, pos, lin, cel, tp, n, maxPos
    IncluiComponente = ""
    If AchaLinhaMaterial(material) >= 0 Then
        IncluiComponente = "JA"
        Exit Function
    End If
    ab = PrimeiraLinhaLivre()
    If ab < 0 Then
        IncluiComponente = "nenhuma linha livre na tela de componentes"
        DespejaTela "Sem linha livre para incluir " & material
        Exit Function
    End If
    Set tab = AchaTabela(session.findById("wnd[0]/usr"), COL_MATERIAL)
    vis = tab.VisibleRowCount
    maxPos = tab.VerticalScrollbar.Maximum
    pos = Int(ab / vis) * vis
    If pos > maxPos Then pos = maxPos
    If tab.VerticalScrollbar.Position <> pos Then
        tab.VerticalScrollbar.Position = pos
        Set tab = AchaTabela(session.findById("wnd[0]/usr"), COL_MATERIAL)
    End If
    lin = ab - tab.VerticalScrollbar.Position
    If lin < 0 Or lin >= vis Then
        IncluiComponente = "a linha livre nao ficou visivel na tela"
        DespejaTela "Linha livre fora da tela ao incluir " & material
        Exit Function
    End If
    Set cel = Celula(tab, COL_CATEGORIA, lin)
    If Not cel Is Nothing Then
        If Trim(cel.Text) = "" Then Escreve tab, COL_CATEGORIA, lin, "L"
    End If
    If Not Escreve(tab, COL_MATERIAL, lin, material) Then
        IncluiComponente = "o campo de material nao aceitou a digitacao"
        DespejaTela "Campo de material bloqueado ao incluir " & material
        Exit Function
    End If
    If Not Escreve(tab, COL_QUANTIDADE, lin, qtd) Then
        IncluiComponente = "o campo de quantidade nao aceitou a digitacao"
        DespejaTela "Campo de quantidade bloqueado ao incluir " & material
        Exit Function
    End If
    session.findById("wnd[0]").sendVKey 0
    n = 0
    Do While n < 3
        If TemPopup() Then Exit Do
        If session.findById("wnd[0]/sbar").MessageType <> "W" Then Exit Do
        Registra "AVIS | material " & material & ": " & session.findById("wnd[0]/sbar").Text & " (confirmado com Enter)"
        session.findById("wnd[0]").sendVKey 0
        n = n + 1
    Loop
    If TemPopup() Then
        IncluiComponente = "POPUP ao incluir: " & TextoPopup()
        DespejaTela "Popup ao incluir " & material
        FechaPopups False
        Exit Function
    End If
    tp = session.findById("wnd[0]/sbar").MessageType
    If tp = "E" Or tp = "A" Then
        IncluiComponente = "ERRO SAP: " & session.findById("wnd[0]/sbar").Text
        Exit Function
    End If
    If AchaLinhaMaterial(material) < 0 Then
        IncluiComponente = "o material nao apareceu na tela depois de incluir"
        DespejaTela "Material " & material & " nao apareceu depois de incluir"
    End If
End Function

' "" = incluiu (falta gravar); "JA" = ja estava; "PEND:motivo" = segue a lista; "REFAZ:motivo" = reabre a lista
Function TrataItem(campos)
    Dim res
    If Not NaSintese() Then
        TrataItem = "REFAZ:tela fora da sintese de operacoes"
        Exit Function
    End If
    If Not SelecionaOperacao(campos(3)) Then
        TrataItem = "PEND:operacao " & campos(3) & " nao encontrada na lista"
        Exit Function
    End If
    If Not AbreComponentes() Then
        TrataItem = "REFAZ:tela de componentes nao abriu"
        Exit Function
    End If
    res = IncluiComponente(campos(4), campos(5))
    If res <> "" And res <> "JA" Then
        TrataItem = "REFAZ:" & res
        Exit Function
    End If
    session.findById("wnd[0]").sendVKey 3
    If TemPopup() Then FechaPopups False
    If Not NaSintese() Then
        TrataItem = "REFAZ:a tela nao voltou para a sintese de operacoes (" & BarraStatus() & ")"
        Exit Function
    End If
    TrataItem = res
End Function

Sub ProcessaLista(grupo, contador, itens)
    Dim fora, volta, refazer, incluidos, novos, it, campos, chItem, res, falha, motivo, p
    Set fora = CreateObject("Scripting.Dictionary")
    volta = 0
    Do
        volta = volta + 1
        refazer = False: incluidos = 0: novos = ""
        falha = ""
        On Error Resume Next
        falha = AbreLista(grupo, contador)
        If Err.Number <> 0 Then
            falha = "erro do script ao abrir a lista: " & Err.Description
            Err.Clear
        End If
        On Error GoTo 0
        If falha <> "" Then
            Registra "ERRO | lista " & grupo & "/" & contador & " | " & falha
            erros = erros + 1
            If Left(falha, 8) = "ERRO SAP" Or Left(falha, 5) = "POPUP" Then telaRuim = 0 Else telaRuim = telaRuim + 1
            If telaRuim >= MAX_TELA_RUIM Then parar = True
            For Each it In itens
                If Trim(it) <> "" Then Pendente Split(it, ";"), "lista nao abriu: " & falha
            Next
            SaiSemGravar
            Exit Sub
        End If
        For Each it In itens
            If Trim(it) <> "" Then
                campos = Split(it, ";")
                chItem = ChaveItem(campos)
                If Not fora.Exists(chItem) And Not feitos.Exists(chItem) And Not pendDic.Exists(chItem) Then
                    res = ""
                    On Error Resume Next
                    res = TrataItem(campos)
                    If Err.Number <> 0 Then
                        res = "REFAZ:erro do script: " & Err.Description
                        Err.Clear
                    End If
                    On Error GoTo 0
                    If res = "" Then
                        Registra "INCL | lista " & campos(1) & " op " & campos(3) & " | material " & campos(4) & " | qtd " & campos(5) & " | ativos " & Ativos(campos)
                        incluidos = incluidos + 1
                        novos = novos & it & vbLf
                        telaRuim = 0
                    ElseIf res = "JA" Then
                        Registra "JA   | lista " & campos(1) & " op " & campos(3) & " | material " & campos(4) & " ja estava na operacao | ativos " & Ativos(campos)
                        If Not MODO_TESTE Then AnotaFeito campos, "ja estava"
                        jaEstavam = jaEstavam + 1
                        telaRuim = 0
                    Else
                        motivo = Mid(res, InStr(res, ":") + 1)
                        fora(chItem) = True
                        erros = erros + 1
                        Pendente campos, motivo
                        If Left(res, 6) = "REFAZ:" Then
                            refazer = True
                            Exit For
                        End If
                    End If
                End If
            End If
        Next
        If telaRuim >= MAX_TELA_RUIM Then parar = True
        If parar Then
            SaiSemGravar
        ElseIf refazer Then
            SaiSemGravar
            Registra "---- | lista " & grupo & "/" & contador & " | saiu sem gravar e vai reabrir a lista"
        ElseIf MODO_TESTE Or incluidos = 0 Then
            SaiSemGravar
            Registra "---- | lista " & grupo & "/" & contador & " | NAO gravada (" & IIf(MODO_TESTE, "modo teste", "nada a incluir") & ")"
        Else
            falha = ""
            On Error Resume Next
            falha = GravaLista()
            If Err.Number <> 0 Then
                falha = "erro do script ao gravar: " & Err.Description
                Err.Clear
            End If
            On Error GoTo 0
            If falha = "" Then
                Registra "GRAV | lista " & grupo & "/" & contador & " | " & incluidos & " incluidos | " & BarraStatus()
                For Each p In Split(novos, vbLf)
                    If p <> "" Then AnotaFeito Split(p, ";"), "incluido"
                Next
                total = total + incluidos
            Else
                Registra "ERRO | lista " & grupo & "/" & contador & " | nao gravou: " & falha
                erros = erros + 1
                SaiSemGravar
                For Each p In Split(novos, vbLf)
                    If p <> "" Then Pendente Split(p, ";"), "lista nao gravou: " & falha
                Next
            End If
        End If
    Loop While refazer And Not parar And volta <= UBound(itens) + 3
End Sub

Sub Principal()
    Dim arq, linha, campos, dados, chItem, jaFeitos, chave, partes, itens, vistos, chMat
    If Not fso.FileExists(pasta & ARQ_CSV) Then
        MsgBox "Arquivo nao encontrado: " & pasta & ARQ_CSV & vbCrLf & "Salve o CSV na mesma pasta deste script.", vbCritical
        Exit Sub
    End If
    Set feitos = CreateObject("Scripting.Dictionary")
    Set pendDic = CreateObject("Scripting.Dictionary")
    Set feitosMat = CreateObject("Scripting.Dictionary")
    If fso.FileExists(pasta & ARQ_FEITOS) Then
        Set arq = fso.OpenTextFile(pasta & ARQ_FEITOS, 1)
        Do Until arq.AtEndOfStream
            campos = Split(arq.ReadLine, ";")
            If UBound(campos) >= 3 Then
                feitos(campos(0) & ";" & campos(1) & ";" & Op4(campos(2)) & ";" & campos(3)) = True
                feitosMat(UCase(Trim(campos(0))) & ";" & Trim(campos(1)) & ";" & UCase(SemZeros(campos(3)))) = True
            End If
        Loop
        arq.Close
    End If
    Set dados = CreateObject("Scripting.Dictionary")
    Set vistos = CreateObject("Scripting.Dictionary")
    jaFeitos = 0: repetidos = 0
    Set arq = fso.OpenTextFile(pasta & ARQ_CSV, 1)
    arq.ReadLine
    Do Until arq.AtEndOfStream
        linha = arq.ReadLine
        campos = Split(linha, ";")
        If UBound(campos) >= 6 Then
            campos(3) = Op4(campos(3))
            If Trim(campos(5)) = "" Then campos(5) = "1"
            linha = Join(campos, ";")
            If UCase(Trim(campos(0))) = "X" Then
                chItem = ChaveItem(campos)
                chMat = ChaveMaterial(campos)
                If feitos.Exists(chItem) Or feitosMat.Exists(chMat) Then
                    jaFeitos = jaFeitos + 1
                ElseIf vistos.Exists(chMat) Then
                    ' o mesmo material na mesma lista outra vez (outra operacao ou outra linha): nunca inclui repetido
                    repetidos = repetidos + 1
                Else
                    vistos.Add chMat, True
                    chave = campos(1) & "|" & campos(2)
                    If Not dados.Exists(chave) Then dados.Add chave, ""
                    dados(chave) = dados(chave) & linha & vbLf
                End If
            End If
        End If
    Loop
    arq.Close
    If dados.Count = 0 Then
        MsgBox "Nada a fazer: nenhuma linha pendente com EXECUTAR = X." & vbCrLf & "Ja incluidos antes: " & jaFeitos & vbCrLf & _
               "Repetidos no CSV (pulados): " & repetidos, vbInformation
        Exit Sub
    End If
    If MsgBox(dados.Count & " listas com materiais a INCLUIR." & vbCrLf & "Ja incluidos antes (pulados): " & jaFeitos & vbCrLf & _
              "Repetidos no CSV (pulados): " & repetidos & vbCrLf & _
              "Modo: " & IIf(MODO_TESTE, "TESTE (nao grava)", "GRAVACAO") & vbCrLf & "Continuar?", vbYesNo + vbQuestion) = vbNo Then Exit Sub
    Set session = ConectaSAP()
    If session Is Nothing Then Exit Sub
    On Error Resume Next
    If fso.FileExists(pasta & ARQ_PEND) Then fso.DeleteFile pasta & ARQ_PEND, True
    Err.Clear
    On Error GoTo 0
    Registra "===== INICIO INCLUSAO | modo " & IIf(MODO_TESTE, "TESTE", "GRAVACAO") & " | " & dados.Count & " listas ====="
    total = 0: jaEstavam = 0: erros = 0: nPend = 0: telaRuim = 0: parar = False
    For Each chave In dados.Keys
        partes = Split(chave, "|")
        itens = Split(dados(chave), vbLf)
        ProcessaLista partes(0), partes(1), itens
        If parar Then Exit For
    Next
    Registra "===== FIM | incluidos e gravados: " & total & " | ja estavam: " & jaEstavam & " | pendentes: " & nPend & " | repetidos pulados: " & repetidos & " | erros: " & erros & IIf(parar, " | INTERROMPIDO", "") & " ====="
    MsgBox IIf(parar, "Interrompido: tela do SAP nao reconhecida.", "Concluido.") & vbCrLf & _
           IIf(MODO_TESTE, "Modo teste: nada foi gravado.", "Incluidos: " & total) & vbCrLf & "Ja estavam: " & jaEstavam & vbCrLf & _
           "Pendentes: " & nPend & vbCrLf & "Log: " & ARQ_LOG & " em " & pasta, vbInformation
End Sub
`;
