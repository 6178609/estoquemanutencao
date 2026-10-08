@echo off
REM ==========================================================================
REM  Central de Manutencao - atualiza o sistema neste PC com a versao publicada
REM  no GitHub e reinicia o sincronizador (que leva os pedidos do site, como a
REM  mudanca de datas, ao robo do SAP). As configuracoes deste PC (token do
REM  GitHub, usuario do SAP) nao sao alteradas. O sincronizador tambem faz isto
REM  sozinho a cada 6 horas; use este arquivo para atualizar na hora.
REM ==========================================================================
cd /d "%~dp0"
chcp 65001 >nul
where uv >/dev/null 2>nul
if errorlevel 1 set "PATH=%USERPROFILE%\.local\bin;%PATH%"
where uv >/dev/null 2>nul
if errorlevel 1 (echo O uv nao esta instalado neste PC: rode antes o iniciar.bat. & pause & exit /b 1)
echo Buscando a versao nova no GitHub...
REM tudo numa linha so: o proprio atualizar.bat pode ser trocado durante a atualizacao
uv run --quiet python sincronizador\atualizar.py --reiniciar & echo. & pause & exit /b
