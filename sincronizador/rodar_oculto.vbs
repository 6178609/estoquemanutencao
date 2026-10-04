' Inicia o sincronizador em segundo plano, sem janela. Usado pela tarefa agendada
' "Central Manutencao - Sincronizador" (criada pelo configurar.bat) a cada logon.
Option Explicit
Dim fso, sh, pasta, raiz, uv
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
raiz = fso.GetParentFolderName(pasta)
sh.CurrentDirectory = raiz
uv = sh.ExpandEnvironmentStrings("%USERPROFILE%") & "\.local\bin\uv.exe"
If Not fso.FileExists(uv) Then uv = "uv"
sh.Run """" & uv & """ run --quiet python sincronizador\sincronizar.py --loop", 0, False
