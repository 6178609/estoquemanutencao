@echo off
REM ==========================================================================
REM  Configura o robo do SAP neste PC (rodar uma vez).
REM  - guarda usuario e senha do SAP no Gerenciador de Credenciais do Windows
REM    (criptografados pelo Windows; nunca em arquivo do projeto)
REM  - testa uma exportacao
REM  - agenda o robo para rodar sozinho nos dias uteis
REM  Pre-requisito: SAP GUI Scripting habilitado (SAP GUI > Opcoes >
REM  Acessibilidade e scripting > Scripting > "Habilitar scripting").
REM ==========================================================================
cd /d "%~dp0.."
chcp 65001 >nul

where uv >nul 2>nul
if errorlevel 1 (
    echo Instalando o uv ^(gerenciador do Python^) - so na primeira vez...
    powershell -ExecutionPolicy ByPass -NoProfile -Command "irm https://astral.sh/uv/install.ps1 | iex"
    set "PATH=%USERPROFILE%\.local\bin;%PATH%"
)
uv sync --quiet || (echo Falha ao instalar dependencias. & pause & exit /b 1)

uv run python automacao\robo_sap.py --configurar || (pause & exit /b 1)

echo.
echo Testando: o robo vai abrir o SAP e exportar as transacoes de automacao\transacoes.toml...
uv run python automacao\robo_sap.py
if errorlevel 1 (
    echo.
    echo O teste falhou - veja a mensagem acima e automacao\robo_sap.log.
    pause & exit /b 1
)

echo.
set "HORAS=06:30 12:30"
set /p "HORAS=Horarios para rodar sozinho nos dias uteis [%HORAS%]: "
set N=0
for %%H in (%HORAS%) do (
    set /a N+=1
    call schtasks /create /tn "Central Manutencao - Robo SAP %%N%%" /tr "wscript.exe \"%~dp0rodar_robo_oculto.vbs\"" /sc weekly /d MON,TUE,WED,THU,FRI /st %%H /rl limited /f >nul
)
echo.
echo Pronto! O robo roda nos horarios %HORAS% (dias uteis), com voce logado no Windows.
echo Tambem da para rodar na hora pelo site: Configuracao ^> Fontes de dados ^> Buscar no SAP agora.
pause
