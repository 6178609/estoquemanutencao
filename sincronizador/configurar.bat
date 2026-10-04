@echo off
REM ==========================================================================
REM  Configura o sincronizador PC -> site na nuvem (rodar uma vez neste PC).
REM  Ele envia o export mais novo de cada base das pastas do OneDrive para o
REM  repositorio privado de dados no GitHub, a cada 5 minutos, sempre que
REM  este usuario estiver logado no Windows.
REM ==========================================================================
cd /d "%~dp0.."
chcp 65001 >nul

where uv >nul 2>nul
if errorlevel 1 (
    echo Instalando o uv ^(gerenciador do Python^) - so na primeira vez...
    powershell -ExecutionPolicy ByPass -NoProfile -Command "irm https://astral.sh/uv/install.ps1 | iex"
    set "PATH=%USERPROFILE%\.local\bin;%PATH%"
)
echo Preparando o ambiente...
uv sync --quiet || (echo Falha ao instalar dependencias. & pause & exit /b 1)

echo.
set "REPO=6178609/estoquemanutencao-dados"
set /p "REPO=Repositorio de dados [%REPO%]: "
set "TOKEN="
set /p "TOKEN=Cole o token do GitHub (github_pat_...): "
if "%TOKEN%"=="" (echo Token obrigatorio. & pause & exit /b 1)

> "sincronizador\config.toml" (
    echo # Gerado pelo configurar.bat - NAO compartilhe este arquivo ^(tem o token^).
    echo repo = "%REPO%"
    echo token = "%TOKEN%"
    echo intervalo_min = 5
)

echo.
echo Testando: procurando os exports nas pastas e enviando...
uv run python sincronizador\sincronizar.py
if errorlevel 1 (echo. & echo O teste falhou - veja a mensagem acima. & pause & exit /b 1)

echo.
echo Agendando para iniciar sozinho a cada logon do Windows...
schtasks /create /tn "Central Manutencao - Sincronizador" /tr "wscript.exe \"%~dp0rodar_oculto.vbs\"" /sc onlogon /rl limited /f >nul
wscript.exe "%~dp0rodar_oculto.vbs"

echo.
echo Pronto! O sincronizador esta rodando em segundo plano.
echo Registro do que ele faz: sincronizador\sincronizador.log
pause
