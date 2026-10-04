@echo off
REM ==========================================================================
REM  Central de Manutencao - inicia o app neste computador.
REM  Duplo clique para abrir. Deixe a janela aberta enquanto o app estiver em uso.
REM  Outras pessoas da rede acessam por  http://NOME-DESTE-PC:8501
REM ==========================================================================
cd /d "%~dp0"
chcp 65001 >nul

where uv >nul 2>nul
if errorlevel 1 (
    echo Instalando o uv ^(gerenciador do Python^) - so na primeira vez...
    powershell -ExecutionPolicy ByPass -NoProfile -Command "irm https://astral.sh/uv/install.ps1 | iex"
    set "PATH=%USERPROFILE%\.local\bin;%PATH%"
)

echo Preparando o ambiente ^(a primeira vez demora alguns minutos^)...
uv sync --quiet
if errorlevel 1 (
    echo Falha ao instalar as dependencias. Verifique a internet/proxy e tente de novo.
    pause
    exit /b 1
)

echo.
echo  Central de Manutencao iniciando...
echo  Neste PC:        http://localhost:8501
echo  Outros na rede:  http://%COMPUTERNAME%:8501
echo.
start "" http://localhost:8501
uv run streamlit run streamlit_app.py --server.port 8501 --server.address 0.0.0.0
pause
