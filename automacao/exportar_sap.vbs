' ============================================================================
'  Exporta IW38, MB52 e IP19 do SAP GUI direto para a pasta monitorada pelo app.
'  Agende no Agendador de Tarefas do Windows (ver README) para rodar sozinho.
'
'  PRÉ-REQUISITOS
'   1. SAP GUI aberto e logado (o script usa a sessão já aberta).
'   2. SAP GUI Scripting habilitado: no SAP GUI, Opções > Acessibilidade e
'      Scripting > "Habilitar scripting"; no servidor, o parâmetro
'      sapgui/user_scripting = TRUE (pedir à equipe SAP/Basis).
'   3. Uma VARIANTE salva em cada transação com a seleção e o layout desejados
'      (ex.: /CENTRAL). No IW38 use o layout com as colunas do relatório atual.
'
'  IMPORTANTE: os IDs de tela abaixo são os mais comuns, mas variam conforme a
'  versão do SAP GUI. Se algum passo falhar, use Personalizar layout local
'  (Alt+F12) > Script Recording and Playback, grave a exportação manualmente
'  uma vez e substitua as linhas do passo correspondente.
' ============================================================================
Option Explicit

Dim PASTA
PASTA = CreateObject("WScript.Shell").ExpandEnvironmentStrings("%USERPROFILE%") & _
        "\OneDrive - Alpargatas S.A\PCM F26 - Documentos\0.1 - Indicadores\Exportacao SAP"

Dim fso : Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FolderExists(PASTA) Then fso.CreateFolder PASTA

Dim SapGuiAuto, application, connection, session
On Error Resume Next
Set SapGuiAuto = GetObject("SAPGUI")
If Err.Number <> 0 Then
    WScript.Echo "SAP GUI não está aberto. Abra e faça login antes de rodar."
    WScript.Quit 1
End If
On Error GoTo 0
Set application = SapGuiAuto.GetScriptingEngine
Set connection = application.Children(0)
Set session = connection.Children(0)

Exportar "IW38", "/CENTRAL", "IW38.XLSX"
Exportar "MB52", "/CENTRAL", "MB52.XLSX"
Exportar "IP19", "/CENTRAL", "IP19.XLSX"   ' IP19 em modo lista (não o gráfico)

Sub Exportar(transacao, variante, arquivo)
    ' 1) abre a transação
    session.findById("wnd[0]/tbar[0]/okcd").Text = "/n" & transacao
    session.findById("wnd[0]").sendVKey 0

    ' 2) carrega a variante (Shift+F5 = "Obter variante")
    session.findById("wnd[0]").sendVKey 17
    session.findById("wnd[1]/usr/txtV-LOW").Text = variante
    session.findById("wnd[1]/usr/txtENAME-LOW").Text = ""
    session.findById("wnd[1]/tbar[0]/btn[8]").press

    ' 3) executa (F8)
    session.findById("wnd[0]").sendVKey 8

    ' 4) exporta para planilha: Lista > Exportar > Planilha  (grave e ajuste se necessário)
    session.findById("wnd[0]/mbar/menu[0]/menu[3]/menu[1]").Select
    ' formato: mantém o padrão (xlsx) e confirma
    session.findById("wnd[1]/tbar[0]/btn[0]").press

    ' 5) pasta e nome do arquivo; btn[11] = "Substituir" (sobrescreve o anterior)
    session.findById("wnd[1]/usr/ctxtDY_PATH").Text = PASTA
    session.findById("wnd[1]/usr/ctxtDY_FILENAME").Text = arquivo
    session.findById("wnd[1]/tbar[0]/btn[11]").press

    ' volta à tela inicial
    session.findById("wnd[0]/tbar[0]/okcd").Text = "/n"
    session.findById("wnd[0]").sendVKey 0
End Sub
