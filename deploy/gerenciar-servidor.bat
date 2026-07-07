@echo off
setlocal enableextensions enabledelayedexpansion
title SenaHub - Gerenciar Servidor
color 0B

REM ============================================================
REM  SenaHub - menu de gerenciamento do servidor (Windows)
REM  Uso continuo (dia a dia), complementar ao deploy-servidor.bat
REM  (que e so para a primeira subida). Texto em pt-BR sem acentos
REM  de proposito - mesma convencao do deploy-servidor.bat, evita
REM  problemas de encoding no console/PowerShell 5.1.
REM ============================================================

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "APP_DIR=%%~fI"
set "PS1=%SCRIPT_DIR%gerenciar-servidor.ps1"
set "SERVICE_APP=SenaHub"
set "SERVICE_TUNNEL=cloudflared"
set "SERVICE_DB=postgresql-x64-17"

if not exist "%PS1%" (
  echo(
  echo [ERRO] Nao encontrei gerenciar-servidor.ps1 ao lado deste .bat.
  pause
  exit /b 1
)
if not exist "%APP_DIR%\package.json" (
  echo(
  echo [ERRO] Nao encontrei o projeto em "%APP_DIR%".
  pause
  exit /b 1
)

cd /d "%APP_DIR%"

goto :menu

REM ============================================================
REM  MENU PRINCIPAL
REM ============================================================
:menu
cls
echo(
echo  ===================================================
echo   SenaHub - Menu de Gerenciamento do Servidor
echo  ===================================================
echo(
echo    1. Ver status do sistema
echo    2. Iniciar todos os servicos
echo    3. Parar todos os servicos
echo    4. Reiniciar SenaHub (aplicacao)
echo    5. Reiniciar tunel Cloudflare
echo    6. Abrir o SenaHub no navegador
echo    7. Ver logs recentes
echo    8. Diagnostico: por que algo nao esta funcionando?
echo    9. Backup manual do banco agora
echo   10. Atualizar e reiniciar (deploy completo)
echo   11. Rodar testes de fumaca (smoke tests)
echo   12. Ferramentas avancadas
echo   13. Ajuda / Sobre este menu
echo(
echo    0. Sair
echo(
set /p opcao="Escolha uma opcao: "

if "%opcao%"=="1" (
  call :acao_status
  goto :menu
)
if "%opcao%"=="2" (
  call :acao_iniciar_todos
  goto :menu
)
if "%opcao%"=="3" (
  call :acao_parar_todos
  goto :menu
)
if "%opcao%"=="4" (
  call :acao_reiniciar_app
  goto :menu
)
if "%opcao%"=="5" (
  call :acao_reiniciar_tunel
  goto :menu
)
if "%opcao%"=="6" (
  call :acao_abrir_navegador
  goto :menu
)
if "%opcao%"=="7" (
  call :menu_logs
  goto :menu
)
if "%opcao%"=="8" (
  call :menu_diagnostico
  goto :menu
)
if "%opcao%"=="9" (
  call :acao_backup
  goto :menu
)
if "%opcao%"=="10" (
  call :acao_deploy
  goto :menu
)
if "%opcao%"=="11" (
  call :acao_smoke
  goto :menu
)
if "%opcao%"=="12" (
  call :menu_avancado
  goto :menu
)
if "%opcao%"=="13" (
  call :acao_ajuda
  goto :menu
)
if "%opcao%"=="0" goto :sair

echo(
echo Opcao invalida.
pause
goto :menu

:sair
echo(
echo Ate mais.
endlocal
exit /b 0

REM ============================================================
REM  ACOES DO MENU PRINCIPAL
REM ============================================================

:acao_status
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Status
pause
exit /b

:acao_iniciar_todos
call :requer_admin
if errorlevel 1 (
  pause
  exit /b
)
echo(
echo Iniciando servicos (Postgres -^> SenaHub -^> cloudflared)...
echo(
REM "net start" devolve 2 quando o servico ja estava rodando - isso NAO e erro,
REM por isso comparamos o codigo exato em vez de usar "if errorlevel 1".
net start %SERVICE_DB%
set "RC=%errorlevel%"
if not "%RC%"=="0" if not "%RC%"=="2" (
  echo [ERRO] Falha ao iniciar %SERVICE_DB% ^(codigo %RC%^).
  pause
  exit /b
)
net start %SERVICE_APP%
set "RC=%errorlevel%"
if not "%RC%"=="0" if not "%RC%"=="2" (
  echo [ERRO] Falha ao iniciar %SERVICE_APP% ^(codigo %RC%^).
  pause
  exit /b
)
net start %SERVICE_TUNNEL%
set "RC=%errorlevel%"
if not "%RC%"=="0" if not "%RC%"=="2" (
  echo [ERRO] Falha ao iniciar %SERVICE_TUNNEL% ^(codigo %RC%^).
  pause
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Audit -Sub IniciarTodos >nul
echo(
echo [OK] Servicos iniciados.
pause
exit /b

:acao_parar_todos
call :requer_admin
if errorlevel 1 (
  pause
  exit /b
)
echo(
echo Isso vai TIRAR O SITE DO AR (para todos os servicos).
set /p confirma="Continuar? (S/N): "
if /i not "%confirma%"=="S" (
  echo Cancelado.
  pause
  exit /b
)
echo(
net stop %SERVICE_TUNNEL%
net stop %SERVICE_APP%
net stop %SERVICE_DB%
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Audit -Sub PararTodos >nul
echo(
echo [OK] Servicos parados.
pause
exit /b

:acao_reiniciar_app
call :requer_admin
if errorlevel 1 (
  pause
  exit /b
)
echo(
echo Isso vai desconectar os usuarios conectados por alguns segundos.
set /p confirma="Continuar? (S/N): "
if /i not "%confirma%"=="S" (
  echo Cancelado.
  pause
  exit /b
)
echo(
net stop %SERVICE_APP%
net start %SERVICE_APP%
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Audit -Sub ReiniciarApp >nul
echo(
echo Ultimas linhas do log apos reiniciar:
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao LogsSenaHub
pause
exit /b

:acao_reiniciar_tunel
call :requer_admin
if errorlevel 1 (
  pause
  exit /b
)
echo(
net stop %SERVICE_TUNNEL%
net start %SERVICE_TUNNEL%
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Audit -Sub ReiniciarTunel >nul
echo(
echo [OK] Tunel reiniciado.
pause
exit /b

:acao_abrir_navegador
start "" "https://hub.senaprojetos.com.br"
exit /b

:acao_backup
echo(
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Backup
pause
exit /b

:acao_deploy
echo(
echo Isso vai: parar o SenaHub, baixar codigo novo, instalar dependencias,
echo rebuildar, fazer backup, aplicar migrations e iniciar de novo. O SITE FICA
echo FORA DO AR durante todo o processo (nao so no restart final) - pode demorar
echo alguns minutos. Precisa estar sem alteracoes locais pendentes no git.
echo(
set /p confirma="Continuar? (S/N): "
if /i not "%confirma%"=="S" (
  echo Cancelado.
  pause
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao DeployCompleto
pause
exit /b

:acao_smoke
echo(
echo Isso roda os testes de fumaca contra o banco de dados REAL (idempotentes,
echo mas geram e limpam dados de teste). Pode levar alguns minutos.
echo(
set /p confirma="Continuar? (S/N): "
if /i not "%confirma%"=="S" (
  echo Cancelado.
  pause
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao SmokeTests
pause
exit /b

:acao_ajuda
cls
echo(
echo  ===================================================
echo   Ajuda / Sobre este menu
echo  ===================================================
echo(
echo    1  - Ver status do sistema: mostra se os servicos, a porta, o site
echo         publico e o banco de dados estao OK.
echo    2  - Inicia todos os servicos na ordem certa (banco antes da app).
echo    3  - Para todos os servicos (derruba o site temporariamente).
echo    4  - Reinicia so a aplicacao SenaHub (uso mais comum no dia a dia).
echo    5  - Reinicia so o tunel Cloudflare (acesso publico).
echo    6  - Abre https://hub.senaprojetos.com.br no navegador.
echo    7  - Mostra os logs mais recentes de erro/saida.
echo    8  - Perguntas guiadas para os problemas mais comuns.
echo    9  - Faz um backup do banco na hora (sem risco, nao apaga nada).
echo   10  - Atualiza o codigo, builda e reinicia (uso no dia de deploy).
echo   11  - Roda os testes automatizados contra o sistema real.
echo   12  - Ferramentas raras/avancadas (servico travado, reboot, etc).
echo(
echo   Duvidas ou problemas nao cobertos aqui: veja docs\DEPLOY.md
echo   ou fale com quem administra o servidor.
echo(
echo   Recuperacao de senha do Postgres (procedimento raro e manual,
echo   NAO automatizado por este menu, pois desliga a autenticacao por
echo   senha do banco inteiro enquanto ativo): veja docs\DEPLOY.md.
echo(
pause
exit /b

REM ============================================================
REM  SUBMENU: LOGS
REM ============================================================
:menu_logs
cls
echo(
echo  ===================================================
echo   Logs recentes
echo  ===================================================
echo(
echo   1. Log do SenaHub (aplicacao)
echo   2. Log do Cloudflared (tunel)
echo   3. Contar reinicios recentes (detector de crash-loop)
echo   4. Abrir pasta de logs no Explorer
echo(
echo   0. Voltar
echo(
set /p subop="Escolha uma opcao: "

if "%subop%"=="1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao LogsSenaHub
  pause
  goto :menu_logs
)
if "%subop%"=="2" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao LogsCloudflared
  pause
  goto :menu_logs
)
if "%subop%"=="3" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao CrashLoop
  pause
  goto :menu_logs
)
if "%subop%"=="4" (
  explorer "%APP_DIR%\logs"
  goto :menu_logs
)
if "%subop%"=="0" exit /b

echo(
echo Opcao invalida.
pause
goto :menu_logs

REM ============================================================
REM  SUBMENU: DIAGNOSTICO GUIADO
REM ============================================================
:menu_diagnostico
cls
echo(
echo  ===================================================
echo   Diagnostico: por que algo nao esta funcionando?
echo  ===================================================
echo(
echo   1. Upload de arquivo esta falhando
echo   2. Chat nao conecta
echo   3. PDF nao gera
echo   4. Site parece fora do ar
echo(
echo   0. Voltar
echo(
set /p subop="Escolha uma opcao: "

if "%subop%"=="1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Diagnostico -Sub Upload
  pause
  goto :menu_diagnostico
)
if "%subop%"=="2" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Diagnostico -Sub Chat
  pause
  goto :menu_diagnostico
)
if "%subop%"=="3" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Diagnostico -Sub PDF
  pause
  goto :menu_diagnostico
)
if "%subop%"=="4" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Diagnostico -Sub Site
  pause
  goto :menu_diagnostico
)
if "%subop%"=="0" exit /b

echo(
echo Opcao invalida.
pause
goto :menu_diagnostico

REM ============================================================
REM  SUBMENU: FERRAMENTAS AVANCADAS
REM ============================================================
:menu_avancado
cls
echo(
echo  ===================================================
echo   Ferramentas avancadas
echo  ===================================================
echo(
echo   1. Forcar encerramento de servico travado (STOP_PENDING)
echo   2. Verificar processos orfaos / portas em uso
echo   3. Corrigir build corrompido (limpar .next e reconstruir)
echo   4. Aplicar apenas migrations (sem pull/build)
echo   5. Reaplicar seed (idempotente - NAO e o seed de demonstracao)
echo   6. Listar / verificar backups
echo   7. Resetar senha do admin (emergencia)
echo   8. Ver log de auditoria do menu
echo   9. Reiniciar o servidor Windows (reboot)
echo(
echo   0. Voltar
echo(
set /p subop="Escolha uma opcao: "

if "%subop%"=="1" (
  echo(
  set "svcalvo="
  set /p svcalvo="Nome do servico travado (SenaHub ou cloudflared) [SenaHub]: "
  if "!svcalvo!"=="" set "svcalvo=SenaHub"
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao ForcarEncerramento -Sub "!svcalvo!"
  pause
  goto :menu_avancado
)
if "%subop%"=="2" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao ProcessosPortas
  pause
  goto :menu_avancado
)
if "%subop%"=="3" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao CorrigirNext
  pause
  goto :menu_avancado
)
if "%subop%"=="4" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Migrations
  pause
  goto :menu_avancado
)
if "%subop%"=="5" (
  echo(
  set "confirma="
  set /p confirma="Isso reaplica o seed de producao (admin/permissoes/catalogos). Continuar? (S/N): "
  if /i "!confirma!"=="S" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao ReaplicarSeed
  ) else (
    echo Cancelado.
  )
  pause
  goto :menu_avancado
)
if "%subop%"=="6" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao ListarBackups
  pause
  goto :menu_avancado
)
if "%subop%"=="7" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao ResetAdminSenha
  pause
  goto :menu_avancado
)
if "%subop%"=="8" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao VerAuditoria
  pause
  goto :menu_avancado
)
if "%subop%"=="9" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Reboot
  pause
  goto :menu_avancado
)
if "%subop%"=="0" exit /b

echo(
echo Opcao invalida.
pause
goto :menu_avancado

REM ============================================================
REM  SUB-ROTINA: checagem de admin (nao encerra o menu, so avisa)
REM ============================================================
:requer_admin
net session >nul 2>&1
if errorlevel 1 (
  echo(
  echo [ERRO] Esta acao precisa ser executada como Administrador.
  echo        Feche o menu e abra de novo clicando com botao direito
  echo        e escolhendo "Executar como administrador".
  exit /b 1
)
exit /b 0
