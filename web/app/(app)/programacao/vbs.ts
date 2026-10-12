/**
 * Script VBS (SAP GUI Scripting) que muda as datas das ordens no SAP pela programação do mês — para rodar direto
 * no PC com o SAP aberto, sem o sincronizador. Mesmas regras do robô (automacao/robo_sap.py, rodar_mudancas):
 * para cada dia, a IW38 traz as ordens abertas/em processamento das máquinas do dia (campo de ordenação, pela
 * seleção múltipla) no período da consulta; em cada ordem, a IW32 recebe InícioBase = Fim-base = o dia, grava e a
 * IW33 confere. No estilo dos scripts da equipe (SAP_IA06_…vbs): log, feitos (não repete), pendentes com o motivo,
 * despejo da tela quando algo não é reconhecido, MODO_TESTE (troca na tela e não grava).
 */
import type { Consulta } from "./logica";

const ascii = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "?");
const vbsTexto = (s: string) => ascii(s).replaceAll('"', "'");

export function nomeArquivoVbs(de: string, ate: string, teste: boolean) {
  return `SAP_IW32_datas_${de.replaceAll("-", "")}_${ate.replaceAll("-", "")}${teste ? "_TESTE" : ""}.vbs`;
}

export function gerarVbs(cons: Consulta[], o: { teste: boolean; de: string; ate: string; por: string; geradoEm: string;
  nomes?: Record<string, string>; atrasadas?: boolean }): string {
  const dias = cons.map((c) => {
    const nomes = c.campos.map((k) => `${k}${o.nomes?.[k] ? " = " + o.nomes[k].slice(0, 40) : ""}`).join(" | ");
    return `    ' ${c.dia}: ${vbsTexto(nomes)}\r\n    Junta "${c.dia};${c.de};${c.ate};${vbsTexto(c.campos.join(","))}"`;
  }).join("\r\n");
  const cab = [
    "' =====================================================================================",
    "'  SAP GUI Scripting - IW38 + IW32: MUDA AS DATAS das ordens pela PROGRAMACAO DO MES",
    "'  (Central de Manutencao > Programacao do mes). Segue o CAMPO DE ORDENACAO de cada dia.",
    "'",
    `'  Gerado em ${vbsTexto(o.geradoEm)} por ${vbsTexto(o.por)} | dias ${o.de} a ${o.ate}${o.atrasadas ? " | com atrasadas" : ""}`,
    "'",
    "'  Como usar: salve este arquivo numa pasta, deixe o SAP aberto e logado (tela inicial) e de duplo clique.",
    "'  - Para cada dia: IW38 com os campos de ordenacao do dia (selecao multipla, seta a direita), status",
    "'    Em aberto + Em processamento e o periodo das ordens; cada ordem da lista vai para o dia.",
    "'  - Em cada ordem (IW32): InicioBase e Fim-base = o dia, Enter, grava e confere na IW33.",
    "'  - Ordem que ja esta na data conta como feita. Ordem em mais de um dia: vale o primeiro.",
    "'  - Feitas vao para SAP_IW32_DATAS_feitos.csv (com as datas antigas, para desfazer) e nao se repetem.",
    "'  - O que nao der certo vai para SAP_IW32_DATAS_pendentes.csv, com o motivo, e o script segue.",
    "'  MODO_TESTE = True  -> troca na tela mas NAO grava. MODO_TESTE = False -> grava.",
    "' =====================================================================================",
    "Option Explicit",
    "",
    "' ----------------------------- CONFIGURACAO ---------------------------------------",
    `Const MODO_TESTE = ${o.teste ? "True" : "False"}`,
  ].join("\r\n");
  return `${cab}\r\n${MOTOR.replace("'@@DADOS@@", dias || "    ' (nenhum dia com campo de ordenacao)")}`.replace(/\r?\n/g, "\r\n");
}

// o motor: só ASCII (o Windows lê o .vbs como ANSI)
const MOTOR = String.raw`Const ARQ_FEITOS = "SAP_IW32_DATAS_feitos.csv"
Const ARQ_PEND = "SAP_IW32_DATAS_pendentes.csv"
Const ARQ_LOG = "SAP_IW32_DATAS_log.txt"
Const ARQ_TELAS = "SAP_IW32_DATAS_telas.txt"
Const FORMATO_SEP = "."                    ' o SAP mostra as datas como DD.MM.AAAA
Const CONFERIR = True                      ' reabre a ordem na IW33 e confere a data gravada
Const MAX_ORDENS = 300                     ' limite por execucao (rode de novo para as restantes)
Const MAX_TELA_RUIM = 4                    ' falhas de tela seguidas ate o script parar
' IW38 (selecao)
Const CAMPO_ORDENACAO = ""                 ' nome tecnico (ex.: EQFNR); vazio = acha pelo texto "Campo de ordenacao"
Const IW38_DE = "wnd[0]/usr/ctxtDATUV"     ' Periodo (de)
Const IW38_ATE = "wnd[0]/usr/ctxtDATUB"    ' Periodo (ate)
Const IW38_ABERTO = "wnd[0]/usr/chkDY_OFN"
Const IW38_PROCESSO = "wnd[0]/usr/chkDY_IAR"
Const IW38_CONCLUIDA = "wnd[0]/usr/chkDY_MAB"
Const IW38_HISTORICO = "wnd[0]/usr/chkDY_HIS"
Const GRADE_IW38 = "wnd[0]/usr/cntlGRID1/shellcont/shell"
Const TABELA_MULTIPLA = "wnd[1]/usr/tabsTAB_STRIP/tabpSIVA/ssubSCREEN_HEADER:SAPLALDB:3010/tblSAPLALDBSINGLE"
' IW32/IW33 (ordem): aba "Dados principais", InicioBase e Fim-base
Const CAMPO_ORDEM = "wnd[0]/usr/ctxtCAUFVD-AUFNR"
Const TELA_ORDEM = "wnd[0]/usr/subSUB_ALL:SAPLCOIH:3001/ssubSUB_LEVEL:SAPLCOIH:1100"
Const CAMPO_INICIO = "CAUFVD-GSTRP"
Const CAMPO_FIM = "CAUFVD-GLTRP"
' -----------------------------------------------------------------------------------

Dim fso, pasta, session, consultas, feitos, pendDic, nFeitas, nJa, nTeste, nPend, erros, parar, telaRuim, vistas
Set fso = CreateObject("Scripting.FileSystemObject")
Set consultas = CreateObject("Scripting.Dictionary")
pasta = ""
On Error Resume Next
pasta = fso.GetParentFolderName(WScript.ScriptFullName) & "\"
If Err.Number <> 0 Or pasta = "" Or pasta = "\" Then pasta = CreateObject("WScript.Shell").SpecialFolders("MyDocuments") & "\"
Err.Clear
On Error GoTo 0

Dados
Principal

' ================================ DIAS DA PROGRAMACAO ==============================
' DIA;ORDENS DE;ORDENS ATE;CAMPOS DE ORDENACAO (separados por virgula)
Sub Dados()
'@@DADOS@@
End Sub

Sub Junta(linha)
    consultas.Add CStr(consultas.Count), linha
End Sub

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

' Maiusculas e sem acento (para achar o campo pelo texto da tela)
Function SemAcento(s)
    Dim de, para, i, r
    de = Array(&HE1, &HE0, &HE2, &HE3, &HE4, &HE9, &HE8, &HEA, &HED, &HEC, &HEE, &HF3, &HF2, &HF4, &HF5, &HF6, &HFA, &HF9, &HFB, &HFC, &HE7)
    para = Array("A", "A", "A", "A", "A", "E", "E", "E", "I", "I", "I", "O", "O", "O", "O", "O", "U", "U", "U", "U", "C")
    r = LCase(Trim(s))
    For i = 0 To UBound(de)
        r = Replace(r, ChrW(de(i)), para(i))
    Next
    SemAcento = UCase(r)
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

Function Limpa(s)
    Limpa = SoAnsi(Trim(Replace(Replace(Replace(s, ";", ","), vbCr, " "), vbLf, " ")))
End Function

Sub AnotaFeito(ordem, diaIso, iniAntes, fimAntes, obs)
    Dim f, novo
    feitos(ordem & ";" & diaIso) = True
    On Error Resume Next
    novo = Not fso.FileExists(pasta & ARQ_FEITOS)
    Set f = fso.OpenTextFile(pasta & ARQ_FEITOS, 8, True)
    If novo Then f.WriteLine "ORDEM;DIA;INICIO_ANTES;FIM_ANTES;INICIO_NOVO;FIM_NOVO;QUANDO;OBS"
    f.WriteLine ordem & ";" & diaIso & ";" & iniAntes & ";" & fimAntes & ";" & DataSap(diaIso) & ";" & DataSap(diaIso) & ";" & Now & ";" & Limpa(obs)
    f.Close
    Err.Clear
    On Error GoTo 0
End Sub

Sub Pendente(ordem, diaIso, campo, motivo)
    Dim f, novo, m
    If pendDic.Exists(ordem & ";" & diaIso) Then Exit Sub
    pendDic.Add ordem & ";" & diaIso, True
    nPend = nPend + 1
    m = Limpa(motivo)
    Registra "PEND | ordem " & ordem & " | dia " & diaIso & " | " & campo & " | " & m
    On Error Resume Next
    novo = Not fso.FileExists(pasta & ARQ_PEND)
    Set f = fso.OpenTextFile(pasta & ARQ_PEND, 8, True)
    If novo Then f.WriteLine "ORDEM;DIA;CAMPO_ORDENACAO;MOTIVO;DATA"
    f.WriteLine ordem & ";" & diaIso & ";" & campo & ";" & m & ";" & Now
    f.Close
    Err.Clear
    On Error GoTo 0
End Sub

' "2026-10-14" -> "14.10.2026"
Function DataSap(iso)
    DataSap = Mid(iso, 9, 2) & FORMATO_SEP & Mid(iso, 6, 2) & FORMATO_SEP & Left(iso, 4)
End Function

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

Function Existe(id)
    Set Existe = Nothing
    On Error Resume Next
    Set Existe = session.findById(id)
    If Err.Number <> 0 Then Set Existe = Nothing
    Err.Clear
    On Error GoTo 0
End Function

' Campo de ENTRADA pelo nome tecnico, em qualquer subtela ou aba (ignora rotulos)
Function AchaEntrada(cont, nome)
    Dim i, filho, r, tp
    Set AchaEntrada = Nothing
    On Error Resume Next
    For i = 0 To cont.Children.Count - 1
        Set filho = cont.Children(CInt(i))
        tp = filho.Type
        If filho.Name = nome And (tp = "GuiTextField" Or tp = "GuiCTextField") Then
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

Sub DespejaTela(motivo)
    Dim f
    On Error Resume Next
    Set f = fso.OpenTextFile(pasta & ARQ_TELAS, 8, True)
    f.WriteLine String(100, "=")
    f.WriteLine Now & " | " & SoAnsi(motivo)
    f.WriteLine "Transacao: " & session.Info.Transaction & " | Programa: " & session.Info.Program & " | Tela: " & session.Info.ScreenNumber
    f.WriteLine "Barra de status: " & SoAnsi(session.findById("wnd[0]/sbar").Text)
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
        f.WriteLine Space(nivel * 2) & filho.Type & " | " & filho.Id & " | " & filho.Name & " | " & SoAnsi(txt)
        If filho.ContainerType And nivel < 8 Then DespejaRec filho, f, nivel + 1
    Next
    On Error GoTo 0
End Sub

Sub Comando(cod)
    session.findById("wnd[0]/tbar[0]/okcd").Text = cod
    session.findById("wnd[0]").sendVKey 0
End Sub

Function TipoStatus()
    TipoStatus = session.findById("wnd[0]/sbar").MessageType
End Function

Function TextoStatus()
    TextoStatus = SoAnsi(session.findById("wnd[0]/sbar").Text)
End Function

Function TemPopup()
    TemPopup = (session.Children.Count > 1)
End Function

Function TextoPopup()
    Dim s
    s = ""
    On Error Resume Next
    s = session.findById("wnd[1]").Text
    Err.Clear
    On Error GoTo 0
    TextoPopup = SoAnsi(Trim(s))
End Function

' Fecha os popups: Enter (resposta padrao) nas mensagens; anota o titulo de cada um em avisos
Sub FechaPopups(ByRef avisos)
    Dim n
    n = 0
    On Error Resume Next
    Do While session.Children.Count > 1 And n < 4
        avisos = avisos & IIf(avisos = "", "", "; ") & TextoPopup()
        If n < 3 Then session.findById("wnd[1]").sendVKey 0 Else session.findById("wnd[1]").sendVKey 12
        n = n + 1
    Loop
    Err.Clear
    On Error GoTo 0
End Sub

' Textos de uma janela (titulo, rotulos e campos), sem acento e em maiusculas
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
        Err.Clear
    Next
    On Error GoTo 0
    TextosDe = s
End Function

' Botao do popup cujo texto (sem acento) e uma das palavras da lista
Function BotaoDoPopup(cont, palavras, nivel)
    Dim i, filho, r, t, p
    Set BotaoDoPopup = Nothing
    On Error Resume Next
    For i = 0 To cont.Children.Count - 1
        Set filho = cont.Children(CInt(i))
        If filho.Type = "GuiButton" Then
            t = SemAcento(filho.Text)
            For Each p In palavras
                If t = p Then
                    Set BotaoDoPopup = filho
                    Exit Function
                End If
            Next
        ElseIf filho.ContainerType And nivel < 5 Then
            Set r = BotaoDoPopup(filho, palavras, nivel + 1)
            If Not r Is Nothing Then
                Set BotaoDoPopup = r
                Exit Function
            End If
        End If
        Err.Clear
    Next
    On Error GoTo 0
End Function

' Sai da ordem SEM GRAVAR: se o SAP perguntar "gravar?", responde Nao; se perguntar "sair e perder os dados?", Sim.
' Nunca usa o Enter numa pergunta (o padrao pode ser gravar).
Sub SaiSemGravar()
    Dim n, w, txt, b
    On Error Resume Next
    Comando "/n"
    n = 0
    Do While session.Children.Count > 1 And n < 4
        Set w = session.findById("wnd[1]")
        txt = SemAcento(w.Text & " " & TextosDe(w, 0))
        Set b = Nothing
        If InStr(txt, "GRAVA") > 0 Or InStr(txt, "SALVA") > 0 Or InStr(txt, "SAVE") > 0 Then
            Set b = BotaoDoPopup(w, Array("NAO", "NO"), 0)
            If b Is Nothing Then Set b = Existe("wnd[1]/usr/btnSPOP-OPTION2")
        ElseIf InStr(txt, "PERD") > 0 Or InStr(txt, "SAIR") > 0 Or InStr(txt, "LOST") > 0 Or InStr(txt, "EXIT") > 0 Then
            Set b = BotaoDoPopup(w, Array("SIM", "YES"), 0)
            If b Is Nothing Then Set b = Existe("wnd[1]/usr/btnSPOP-OPTION1")
        End If
        If b Is Nothing Then
            Registra "AVIS | popup ao sair sem gravar nao reconhecido (" & SoAnsi(w.Text) & "): cancelado"
            w.sendVKey 12
        Else
            b.press
        End If
        n = n + 1
        Err.Clear
    Loop
    If session.Children.Count > 1 Then DespejaTela "Popup continua aberto depois de sair sem gravar"
    Err.Clear
    On Error GoTo 0
End Sub

' =============================== IW38: ORDENS DO DIA ================================
' Nome tecnico do campo de ordenacao pelo texto ao lado (ex.: EQFNR)
Function NomeCampoOrdenacao()
    Dim usr, i, filho, id, p1, p2
    NomeCampoOrdenacao = CAMPO_ORDENACAO
    If NomeCampoOrdenacao <> "" Then Exit Function
    Set usr = session.findById("wnd[0]/usr")
    On Error Resume Next
    For i = 0 To usr.Children.Count - 1
        Set filho = usr.Children(CInt(i))
        If SemAcento(filho.Text) = "CAMPO DE ORDENACAO" Then
            id = filho.Id
            p1 = InStr(id, "%_")
            p2 = InStr(id, "_%_APP_%-TEXT")
            If p1 > 0 And p2 > p1 Then
                NomeCampoOrdenacao = Mid(id, p1 + 2, p2 - p1 - 2)
                Exit For
            End If
        End If
    Next
    Err.Clear
    On Error GoTo 0
End Function

Sub Marca(id, valor)
    Dim c
    Set c = Existe(id)
    If Not c Is Nothing Then c.Selected = valor
End Sub

' Celula da tabela da selecao multipla (linha visivel)
Function CelulaMultipla(lin)
    Set CelulaMultipla = Existe(TABELA_MULTIPLA & "/ctxtRSCSEL_255-SLOW_I[1," & lin & "]")
    If CelulaMultipla Is Nothing Then Set CelulaMultipla = Existe(TABELA_MULTIPLA & "/txtRSCSEL_255-SLOW_I[1," & lin & "]")
End Function

' Seta a direita -> apaga o que havia -> um campo por linha -> Copiar (F8). "" = ok, senao o motivo
Function SelecaoMultipla(nome, campos)
    Dim b, tab, i, pos, vis, cel
    SelecaoMultipla = ""
    Set b = Existe("wnd[0]/usr/btn%_" & nome & "_%_APP_%-VALU_PUSH")
    If b Is Nothing Then
        DespejaTela "Seta da selecao multipla do campo " & nome & " nao encontrada na IW38"
        SelecaoMultipla = "seta da selecao multipla do campo de ordenacao nao encontrada na IW38"
        Exit Function
    End If
    b.press
    If Not TemPopup() Then
        SelecaoMultipla = "a janela de selecao multipla nao abriu"
        Exit Function
    End If
    If Not Existe("wnd[1]/tbar[0]/btn[16]") Is Nothing Then session.findById("wnd[1]/tbar[0]/btn[16]").press   ' excluir todas as linhas
    pos = 0
    For i = 0 To UBound(campos)
        Set tab = Existe(TABELA_MULTIPLA)
        If tab Is Nothing Then
            DespejaTela "Tabela da selecao multipla nao encontrada"
            SelecaoMultipla = "tabela da selecao multipla nao encontrada"
            Exit Function
        End If
        vis = tab.VisibleRowCount
        If vis < 1 Then vis = 8
        If i - pos >= vis Then
            pos = i
            tab.VerticalScrollbar.Position = pos
        End If
        Set cel = CelulaMultipla(i - pos)
        If cel Is Nothing Then
            DespejaTela "Celula da selecao multipla nao encontrada (linha " & (i - pos) & ")"
            SelecaoMultipla = "celula da selecao multipla nao encontrada"
            Exit Function
        End If
        cel.Text = campos(i)
    Next
    session.findById("wnd[1]/tbar[0]/btn[8]").press                     ' Copiar
End Function

' Ordens da IW38 para os campos e o periodo: devolve "ordem|campo" por linha (vbLf), ou "ERRO:motivo"
Function OrdensDoDia(campos, deIso, ateIso)
    Dim nome, baixo, falha, grade, n, i, ordem, campo, saida, avisos, cOrdem
    OrdensDoDia = ""
    saida = ""
    avisos = ""
    FechaPopups avisos
    Comando "/nIW38"
    Marca IW38_ABERTO, True
    Marca IW38_PROCESSO, True
    Marca IW38_CONCLUIDA, False
    Marca IW38_HISTORICO, False
    nome = NomeCampoOrdenacao()
    If nome = "" Then
        DespejaTela "Campo de ordenacao nao encontrado na tela de selecao da IW38"
        OrdensDoDia = "ERRO:campo de ordenacao nao encontrado na IW38 (preencha CAMPO_ORDENACAO no inicio do script)"
        Exit Function
    End If
    Set baixo = Existe("wnd[0]/usr/ctxt" & nome & "-LOW")
    If baixo Is Nothing Then Set baixo = Existe("wnd[0]/usr/txt" & nome & "-LOW")
    If Not baixo Is Nothing Then baixo.Text = ""
    falha = SelecaoMultipla(nome, campos)
    If falha <> "" Then
        FechaPopups avisos
        OrdensDoDia = "ERRO:" & falha
        Exit Function
    End If
    If Existe(IW38_DE) Is Nothing Or Existe(IW38_ATE) Is Nothing Then
        DespejaTela "Campos do periodo da IW38 nao encontrados"
        OrdensDoDia = "ERRO:campos do periodo da IW38 nao encontrados (veja IW38_DE e IW38_ATE no inicio do script)"
        Exit Function
    End If
    session.findById(IW38_DE).Text = DataSap(deIso)
    session.findById(IW38_ATE).Text = DataSap(ateIso)
    session.findById("wnd[0]").sendVKey 8                              ' Executar
    FechaPopups avisos
    If TipoStatus() = "E" Or TipoStatus() = "A" Then
        OrdensDoDia = "ERRO:" & TextoStatus()
        Exit Function
    End If
    Set grade = Existe(GRADE_IW38)
    If Not grade Is Nothing Then
        n = grade.RowCount
        For i = 0 To n - 1
            If i Mod 30 = 0 Then
                On Error Resume Next
                grade.firstVisibleRow = i                                  ' a grade carrega as linhas aos poucos
                Err.Clear
                On Error GoTo 0
            End If
            ordem = Trim(grade.GetCellValue(i, "AUFNR"))
            Do While Left(ordem, 1) = "0"
                ordem = Mid(ordem, 2)
            Loop
            campo = ""
            On Error Resume Next
            campo = Trim(grade.GetCellValue(i, "EQFNR"))
            Err.Clear
            On Error GoTo 0
            If ordem <> "" Then saida = saida & ordem & "|" & campo & vbLf
        Next
    Else
        ' uma ordem so: a IW38 abre a ordem direto
        Set cOrdem = AchaEntrada(session.findById("wnd[0]/usr"), "CAUFVD-AUFNR")
        If Not cOrdem Is Nothing Then
            ordem = Trim(cOrdem.Text)
            Do While Left(ordem, 1) = "0"
                ordem = Mid(ordem, 2)
            Loop
            If ordem <> "" Then saida = ordem & "|" & IIf(UBound(campos) = 0, campos(0), "") & vbLf
        End If
    End If
    Comando "/n"
    FechaPopups avisos
    OrdensDoDia = saida
End Function

' =============================== IW32: MUDA A ORDEM ================================
Sub AbaDadosPrincipais()
    Dim aba
    Set aba = Existe(TELA_ORDEM & "/tabsTS_1100/tabpIHKZ")
    If aba Is Nothing Then Exit Sub
    On Error Resume Next
    aba.Select
    Err.Clear
    On Error GoTo 0
End Sub

Function CampoData(nome)
    Set CampoData = Existe(TELA_ORDEM & "/tabsTS_1100/tabpIHKZ/ssubSUB_AUFTRAG:SAPLCOIH:1120/subTERM:SAPLCOIH:7300/ctxt" & nome)
    If CampoData Is Nothing Then Set CampoData = AchaEntrada(session.findById("wnd[0]/usr"), nome)
End Function

Function AbreOrdem(tcode, ordem, ByRef avisos)
    AbreOrdem = ""
    FechaPopups avisos
    Comando "/n" & tcode
    If Existe(CAMPO_ORDEM) Is Nothing Then
        DespejaTela "Campo da ordem nao encontrado na " & tcode
        AbreOrdem = "TELA:tela inicial da " & tcode & " diferente do esperado"
        Exit Function
    End If
    session.findById(CAMPO_ORDEM).Text = ordem
    session.findById("wnd[0]").sendVKey 0
    FechaPopups avisos
    If TipoStatus() = "E" Or TipoStatus() = "A" Then
        AbreOrdem = "SAP:" & TextoStatus()
        Exit Function
    End If
    AbaDadosPrincipais
    If CampoData(CAMPO_INICIO) Is Nothing Or CampoData(CAMPO_FIM) Is Nothing Then
        DespejaTela "Campos de data nao encontrados na ordem " & ordem & " (" & tcode & ")"
        AbreOrdem = "TELA:campos InicioBase/Fim-base nao encontrados na tela da ordem"
    End If
End Function

' Muda InicioBase e Fim-base da ordem para o dia.
' Devolve "OK:", "JA:", "TESTE:" (com a mensagem) ou "PEND:" / "TELA:" / "SAP:" (com o motivo).
' iniAntes/fimAntes recebem as datas que a ordem tinha.
Function MudaOrdem(ordem, diaIso, ByRef iniAntes, ByRef fimAntes)
    Dim novo, avisos, falha, cIni, cFim, n, tp, gravado
    novo = DataSap(diaIso)
    avisos = ""
    iniAntes = "": fimAntes = ""
    falha = AbreOrdem("IW32", ordem, avisos)
    If falha <> "" Then
        MudaOrdem = falha
        SaiSemGravar
        Exit Function
    End If
    Set cIni = CampoData(CAMPO_INICIO)
    Set cFim = CampoData(CAMPO_FIM)
    iniAntes = Trim(cIni.Text): fimAntes = Trim(cFim.Text)
    If iniAntes = novo And fimAntes = novo Then
        MudaOrdem = "JA:ja estava nesta data"
        SaiSemGravar
        Exit Function
    End If
    If Not cIni.Changeable Then
        MudaOrdem = "PEND:a data de inicio nao pode ser alterada (ordem encerrada ou bloqueada por outro usuario?)"
        SaiSemGravar
        Exit Function
    End If
    ' como na planilha Mudar_STATUS: inicio, fim, cursor no fim e Enter (o SAP valida as duas juntas)
    cIni.Text = novo
    cFim.Text = novo
    On Error Resume Next
    cFim.SetFocus
    cFim.CaretPosition = Len(novo)
    Err.Clear
    On Error GoTo 0
    For n = 1 To 3
        session.findById("wnd[0]").sendVKey 0
        FechaPopups avisos
        tp = TipoStatus()
        If tp = "E" Or tp = "A" Then
            MudaOrdem = "SAP:" & TextoStatus()
            SaiSemGravar
            Exit Function
        End If
        If tp <> "W" Then Exit For
        avisos = avisos & IIf(avisos = "", "", "; ") & TextoStatus()
    Next
    If MODO_TESTE Then
        MudaOrdem = "TESTE:o SAP aceitou " & novo & " (nada gravado)" & IIf(avisos = "", "", " | avisos: " & avisos)
        SaiSemGravar
        Exit Function
    End If
    session.findById("wnd[0]/tbar[0]/btn[11]").press                 ' Gravar
    FechaPopups avisos
    tp = TipoStatus()
    If tp = "E" Or tp = "A" Then
        MudaOrdem = "SAP:nao gravou: " & TextoStatus()
        SaiSemGravar
        Exit Function
    End If
    MudaOrdem = "OK:" & TextoStatus() & IIf(avisos = "", "", " | avisos: " & avisos)
    If CONFERIR Then
        falha = AbreOrdem("IW33", ordem, avisos)
        If falha = "" Then
            gravado = Trim(CampoData(CAMPO_INICIO).Text)
            If gravado <> novo Then MudaOrdem = "PEND:depois de gravar o SAP mostra inicio " & gravado & " (a programacao da ordem pode ter recalculado a data)"
        End If
        Comando "/n"
    End If
End Function

' ================================== PRINCIPAL ======================================
Sub Principal()
    Dim arq, campos, k, partes, lista, linha, it, ordem, campo, res, tipo, iniAntes, fimAntes, txtDias, nOrdens
    If consultas.Count = 0 Then
        MsgBox "Nenhum dia com campo de ordenacao neste arquivo. Gere de novo no site (Programacao do mes).", vbInformation
        Exit Sub
    End If
    Set feitos = CreateObject("Scripting.Dictionary")
    Set pendDic = CreateObject("Scripting.Dictionary")
    Set vistas = CreateObject("Scripting.Dictionary")
    If fso.FileExists(pasta & ARQ_FEITOS) Then
        Set arq = fso.OpenTextFile(pasta & ARQ_FEITOS, 1)
        Do Until arq.AtEndOfStream
            campos = Split(arq.ReadLine, ";")
            If UBound(campos) >= 1 Then feitos(campos(0) & ";" & campos(1)) = True
        Loop
        arq.Close
    End If
    txtDias = ""
    For Each k In consultas.Keys
        partes = Split(consultas(k), ";")
        txtDias = txtDias & DataSap(partes(0)) & ": " & partes(3) & vbCrLf
    Next
    If Len(txtDias) > 900 Then txtDias = Left(txtDias, 900) & "..." & vbCrLf
    If MsgBox(consultas.Count & " consulta(s) na IW38 (dia: campos de ordenacao):" & vbCrLf & txtDias & vbCrLf & _
              "Modo: " & IIf(MODO_TESTE, "TESTE (troca na tela e NAO grava)", "GRAVACAO (muda as datas no SAP)") & vbCrLf & _
              "Deixe o SAP aberto e nao mexa nele ate o fim. Continuar?", vbYesNo + vbQuestion) = vbNo Then Exit Sub
    Set session = ConectaSAP()
    If session Is Nothing Then Exit Sub
    On Error Resume Next
    If fso.FileExists(pasta & ARQ_PEND) Then fso.DeleteFile pasta & ARQ_PEND, True
    Err.Clear
    On Error GoTo 0
    Registra "===== INICIO MUDANCA DE DATAS | modo " & IIf(MODO_TESTE, "TESTE", "GRAVACAO") & " | " & consultas.Count & " consulta(s) ====="
    nFeitas = 0: nJa = 0: nTeste = 0: nPend = 0: erros = 0: telaRuim = 0: parar = False: nOrdens = 0
    For Each k In consultas.Keys
        partes = Split(consultas(k), ";")           ' 0 dia, 1 de, 2 ate, 3 campos
        campos = Split(partes(3), ",")
        res = ""
        On Error Resume Next
        lista = OrdensDoDia(campos, partes(1), partes(2))
        If Err.Number <> 0 Then
            lista = "ERRO:erro do script na IW38: " & Err.Description
            Err.Clear
        End If
        On Error GoTo 0
        If Left(lista, 5) = "ERRO:" Then
            Registra "ERRO | IW38 dia " & partes(0) & " (" & partes(3) & ") | " & Mid(lista, 6)
            erros = erros + 1
            telaRuim = telaRuim + 1
            Pendente "(IW38)", partes(0), partes(3), Mid(lista, 6)
            SaiSemGravar
            If telaRuim >= MAX_TELA_RUIM Then parar = True
        Else
            Registra "IW38 | dia " & partes(0) & " | " & partes(3) & " | ordens de " & partes(1) & " a " & partes(2) & " | " & UBound(Split(lista, vbLf)) & " ordem(ns)"
            For Each linha In Split(lista, vbLf)
                If linha <> "" And Not parar Then
                    it = Split(linha, "|")
                    ordem = it(0): campo = it(1)
                    If vistas.Exists(ordem) Then
                        Registra "PULA | ordem " & ordem & " ja tratada no dia " & vistas(ordem)
                    ElseIf feitos.Exists(ordem & ";" & partes(0)) Then
                        vistas(ordem) = partes(0)
                        nJa = nJa + 1
                        Registra "PULA | ordem " & ordem & " ja feita antes para " & partes(0)
                    ElseIf nOrdens >= MAX_ORDENS Then
                        Pendente ordem, partes(0), campo, "limite de " & MAX_ORDENS & " ordens por execucao: rode o script de novo"
                    Else
                        vistas(ordem) = partes(0)
                        nOrdens = nOrdens + 1
                        res = ""
                        On Error Resume Next
                        res = MudaOrdem(ordem, partes(0), iniAntes, fimAntes)
                        If Err.Number <> 0 Then
                            res = "TELA:erro do script: " & Err.Description
                            Err.Clear
                        End If
                        On Error GoTo 0
                        tipo = Left(res, InStr(res & ":", ":") - 1)
                        Select Case tipo
                            Case "OK"
                                nFeitas = nFeitas + 1: telaRuim = 0
                                Registra "MUDOU| ordem " & ordem & " | " & campo & " | " & iniAntes & " -> " & DataSap(partes(0)) & " | " & Mid(res, 4)
                                AnotaFeito ordem, partes(0), iniAntes, fimAntes, Mid(res, 4)
                            Case "JA"
                                nJa = nJa + 1: telaRuim = 0
                                Registra "JA   | ordem " & ordem & " | " & campo & " | ja estava em " & DataSap(partes(0))
                                AnotaFeito ordem, partes(0), iniAntes, fimAntes, "ja estava nesta data"
                            Case "TESTE"
                                nTeste = nTeste + 1: telaRuim = 0
                                Registra "TESTE| ordem " & ordem & " | " & campo & " | " & iniAntes & " -> " & DataSap(partes(0)) & " | " & Mid(res, 7)
                            Case Else
                                erros = erros + 1
                                If tipo = "TELA" Then telaRuim = telaRuim + 1 Else telaRuim = 0
                                Pendente ordem, partes(0), campo, Mid(res, Len(tipo) + 2)
                                SaiSemGravar
                                If telaRuim >= MAX_TELA_RUIM Then parar = True
                        End Select
                    End If
                End If
            Next
        End If
        If parar Then Exit For
    Next
    Registra "===== FIM | mudadas: " & nFeitas & " | ja estavam: " & nJa & " | teste: " & nTeste & " | pendentes: " & nPend & " | erros: " & erros & IIf(parar, " | INTERROMPIDO", "") & " ====="
    MsgBox IIf(parar, "Interrompido: tela do SAP nao reconhecida (veja " & ARQ_TELAS & ").", "Concluido.") & vbCrLf & _
           IIf(MODO_TESTE, "Modo teste: nada foi gravado. Ordens conferidas: " & nTeste, "Datas mudadas: " & nFeitas) & vbCrLf & _
           "Ja estavam na data: " & nJa & vbCrLf & "Pendentes: " & nPend & IIf(nPend > 0, " (" & ARQ_PEND & ")", "") & vbCrLf & _
           "Log: " & ARQ_LOG & " em " & pasta, vbInformation
End Sub
`;
