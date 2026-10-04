' Roda o robo do SAP sem abrir janela (usado pelas tarefas agendadas).
Option Explicit
Dim fso, sh, pasta, raiz, uv
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
raiz = fso.GetParentFolderName(pasta)
sh.CurrentDirectory = raiz
uv = sh.ExpandEnvironmentStrings("%USERPROFILE%") & "\.local\bin\uv.exe"
If Not fso.FileExists(uv) Then uv = "uv"
sh.Run """" & uv & """ run --quiet python automacao\robo_sap.py", 0, False
