@echo off
setlocal enableextensions enabledelayedexpansion
title SenaHub - Central do Desenvolvedor
color 0A

REM ============================================================
REM  SenaHub - Central do Desenvolvedor (lado DEV, Windows)
REM  Menu do dia a dia: rodar dev, verificar antes do push,
REM  promover dev -> producao, banco de dev, smokes, release e
REM  diagnostico. Complementar ao deploy/gerenciar-servidor.bat
REM  (que e do lado SERVIDOR). Texto pt-BR sem acentos de
REM  proposito - evita problemas de encoding no PowerShell 5.1.
REM
REM  Uso interativo: dev            (abre o menu)
REM  Uso direto:     dev <atalho>   (ex: dev check, dev push, dev subir)
REM ============================================================

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "APP_DIR=%%~fI"
set "PS1=%SCRIPT_DIR%gerenciar-dev.ps1"

if not exist "%PS1%" (
  echo(
  echo [ERRO] Nao encontrei gerenciar-dev.ps1 ao lado deste .bat.
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

REM Dispatch direto por argumento (atalhos). Sem argumento -> menu interativo.
if not "%~1"=="" goto :cli

goto :menu

REM ============================================================
REM  DISPATCH POR ARGUMENTO (atalhos de linha de comando)
REM ============================================================
:cli
if /i "%~1"=="up"         ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao DevServer & exit /b )
if /i "%~1"=="server"     ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao DevServer & exit /b )
if /i "%~1"=="ui"         ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao DevNext & exit /b )
if /i "%~1"=="next"       ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao DevNext & exit /b )
if /i "%~1"=="stop"       ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao PararDev & exit /b )
if /i "%~1"=="kill"       ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao PararDev & exit /b )
if /i "%~1"=="check"      ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Verificar & exit /b )
if /i "%~1"=="verificar"  ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Verificar & exit /b )
if /i "%~1"=="ci"         ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Verificar & exit /b )
if /i "%~1"=="test"       ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Testes & exit /b )
if /i "%~1"=="lint"       ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Lint & exit /b )
if /i "%~1"=="push"       ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Push & exit /b )
if /i "%~1"=="st"         ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao StatusRepo & exit /b )
if /i "%~1"=="status"     ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao StatusRepo & exit /b )
if /i "%~1"=="commit"     ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Commit & exit /b )
if /i "%~1"=="sync"       ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Sincronizar & exit /b )
if /i "%~1"=="sincronizar" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Sincronizar & exit /b )
if /i "%~1"=="doctor"     ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Doctor & exit /b )
if /i "%~1"=="studio"     ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Studio & exit /b )
if /i "%~1"=="seed"       ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao DbSeed & exit /b )
if /i "%~1"=="open"       ( start "" "http://localhost:3000" & exit /b )
if /i "%~1"=="abrir"      ( start "" "http://localhost:3000" & exit /b )
if /i "%~1"=="menu"       goto :menu
if /i "%~1"=="subir" (
  set "DRY="
  if /i "%~2"=="--dry" set "DRY=-DryRun"
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Promover -Sub Direto !DRY!
  exit /b
)
if /i "%~1"=="pr" (
  set "DRY="
  if /i "%~2"=="--dry" set "DRY=-DryRun"
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Promover -Sub PR !DRY!
  exit /b
)
if /i "%~1"=="migrate"    ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao DbMigrate -Sub "%~2" & exit /b )
if /i "%~1"=="smoke"      ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Smoke -Sub "%~2" & exit /b )
if /i "%~1"=="help"       goto :cli_help
if /i "%~1"=="-h"         goto :cli_help
if /i "%~1"=="--help"     goto :cli_help
if /i "%~1"=="/?"         goto :cli_help
echo(
echo Comando desconhecido: %~1
:cli_help
echo(
echo Atalhos disponiveis (dev ^<atalho^>):
echo   up ^| server      iniciar dev completo (chat/jobs/realtime)
echo   ui ^| next         iniciar apenas o Next (UI)
echo   stop ^| kill       parar o dev server (:3000 + esbuild)
echo   check ^| ci        verificar tudo (lint + testes + build)
echo   test              so testes        lint    so lint
echo   push              push da branch   st      status do repo
echo   commit            commit guiado    sync    sincronizar dev com master
echo   subir [--dry]     promover dev-^>producao (Direto)
echo   pr [--dry]        promover via Pull Request
echo   doctor            checar ambiente  studio  abrir Prisma Studio
echo   seed              reaplicar seed   migrate ^<nome^>  criar migration
echo   smoke ^<onda^>      rodar um smoke (onda1..onda5, onda3efg)
echo   open              abrir localhost:3000    menu   abrir o menu interativo
echo(
exit /b 1

REM ============================================================
REM  Cabecalho: branch + ahead/behind (ou sem upstream) + arvore
REM ============================================================
:git_header
set "GITBRANCH=?"
set "GITSYNC=?"
set "GITDIRTY="
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "GITBRANCH=%%b"
git rev-parse --abbrev-ref --symbolic-full-name @{u} >nul 2>&1
if errorlevel 1 (
  set "GITSYNC=sem upstream (branch sem origin)"
) else (
  set "GA=-" & set "GB=-"
  for /f "tokens=1,2" %%a in ('git rev-list --left-right --count HEAD...@{u} 2^>nul') do (
    set "GA=%%a"
    set "GB=%%b"
  )
  set "GITSYNC=ahead: !GA!  behind: !GB!"
)
for /f "delims=" %%s in ('git status --porcelain 2^>nul') do set "GITDIRTY=1"
set "ARV=limpa"
if defined GITDIRTY set "ARV=SUJA"
echo   Branch: %GITBRANCH%   ^|   %GITSYNC%   ^|   arvore: %ARV%
exit /b

REM ============================================================
REM  MENU PRINCIPAL
REM ============================================================
:menu
cls
echo(
echo  =====================================================
echo   SenaHub - Central do Desenvolvedor
echo  =====================================================
call :git_header
echo  -----------------------------------------------------
echo(
echo   DESENVOLVIMENTO
echo    1. Iniciar dev (Next so - UI)
echo    2. Iniciar dev completo (chat/jobs/realtime)
echo    3. Parar dev server (libera porta 3000 + esbuild)
echo    4. Abrir no navegador (localhost:3000)
echo(
echo   QUALIDADE
echo    5. Verificar tudo (lint + testes + build)
echo    6. Testes e qualidade ...
echo(
echo   GIT E PUBLICACAO
echo    7. Git e publicacao (status, commit, push, promover) ...
echo(
echo   AMBIENTE
echo    8. Banco de dados (dev) ...
echo    9. Versao / release ...
echo   10. Diagnostico (doctor, processos, limpar, logs) ...
echo(
echo   11. Ajuda / Sobre
echo    0. Sair
echo(
set "opcao="
set /p opcao="Escolha uma opcao: "
set "opcao=%opcao: =%"

if "%opcao%"=="1" ( call :acao_dev_next & goto :menu )
if "%opcao%"=="2" ( call :acao_dev_server & goto :menu )
if "%opcao%"=="3" ( call :acao_parar_dev & goto :menu )
if "%opcao%"=="4" ( start "" "http://localhost:3000" & goto :menu )
if "%opcao%"=="5" ( call :acao_verificar & goto :menu )
if "%opcao%"=="6" ( call :menu_test & goto :menu )
if "%opcao%"=="7" ( call :menu_git & goto :menu )
if "%opcao%"=="8" ( call :menu_db & goto :menu )
if "%opcao%"=="9" ( call :menu_release & goto :menu )
if "%opcao%"=="10" ( call :menu_diag & goto :menu )
if "%opcao%"=="11" ( call :acao_ajuda & goto :menu )
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
REM  ACOES SIMPLES DO MENU PRINCIPAL
REM ============================================================

:acao_dev_next
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao DevNext
pause
exit /b

:acao_dev_server
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao DevServer
pause
exit /b

:acao_parar_dev
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao PararDev
pause
exit /b

:acao_verificar
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Verificar
pause
exit /b

:acao_ajuda
cls
echo(
echo  =====================================================
echo   Ajuda / Sobre a Central do Desenvolvedor
echo  =====================================================
echo(
echo   Fluxo tipico:
echo    - Trabalhe na branch dev; commite com a opcao 7 -^> 2.
echo    - Antes de subir, rode a opcao 5 (verificar tudo):
echo      lint + testes + build, avisa em qual passo falhou.
echo      Ela detecta o dev server na :3000 e oferece parar
echo      antes de buildar (senao o .next corrompe).
echo    - Publique com a opcao 7 -^> 4 (Promover dev -^> producao):
echo        Direto = merge em master + push (dispara o deploy).
echo        Via PR = abre Pull Request para revisao.
echo      Use a variante SIMULAR (dry-run) para ver os passos
echo      sem alterar nada.
echo(
echo   Atalhos de linha de comando (sem menu): dev ^<atalho^>
echo    ex: dev check ^| dev push ^| dev subir ^| dev subir --dry
echo    dev help  lista todos os atalhos.
echo(
echo   Producao puxa origin/master. dev = desenvolvimento.
echo   Banco de dev: PostgreSQL na porta 5433 (senahub_remake).
echo   Log de auditoria: logs\dev-audit.log
echo   Duvidas de deploy do servidor: docs\DEPLOY.md
echo(
pause
exit /b

REM ============================================================
REM  SUBMENU: TESTES E QUALIDADE
REM ============================================================
:menu_test
cls
echo(
echo  =====================================================
echo   Testes e qualidade
echo  =====================================================
echo(
echo   1. So testes (npm test)
echo   2. So lint (eslint)
echo   3. Testar arquivo / nome especifico
echo   4. Smokes e2e (onda1..5) ...
echo   5. Corrigir build/deps corrompidos
echo(
echo   0. Voltar
echo(
set "subop="
set /p subop="Escolha uma opcao: "
set "subop=%subop: =%"

if "%subop%"=="1" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Testes & pause & goto :menu_test )
if "%subop%"=="2" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Lint & pause & goto :menu_test )
if "%subop%"=="3" goto :input_test
if "%subop%"=="4" ( call :menu_smoke & goto :menu_test )
if "%subop%"=="5" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao CorrigirAmbiente & pause & goto :menu_test )
if "%subop%"=="0" exit /b

echo(
echo Opcao invalida.
pause
goto :menu_test

REM Entrada de texto livre com delayed expansion DESLIGADA (protege '!' e '^' no valor
REM e evita que a barra invertida final corrompa a aspa).
:input_test
setlocal disabledelayedexpansion
echo(
set "padrao="
set /p padrao="Arquivo (ex: src/lib/ofx.test.ts) ou nome do teste: "
if defined padrao if "%padrao:~-1%"=="\" set "padrao=%padrao:~0,-1%"
if defined padrao powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao TestesArquivo -Sub "%padrao%"
endlocal
pause
goto :menu_test

REM ============================================================
REM  SUBMENU: SMOKES
REM ============================================================
:menu_smoke
cls
echo(
echo  =====================================================
echo   Smokes e2e (rodam contra o banco de DEV)
echo  =====================================================
echo(
echo   1. onda1     2. onda2     3. onda3
echo   4. onda3efg  5. onda4     6. onda5
echo   7. Rodar TODOS
echo(
echo   0. Voltar
echo(
set "subop="
set /p subop="Escolha uma opcao: "
set "subop=%subop: =%"

if "%subop%"=="1" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Smoke -Sub onda1 & pause & goto :menu_smoke )
if "%subop%"=="2" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Smoke -Sub onda2 & pause & goto :menu_smoke )
if "%subop%"=="3" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Smoke -Sub onda3 & pause & goto :menu_smoke )
if "%subop%"=="4" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Smoke -Sub onda3efg & pause & goto :menu_smoke )
if "%subop%"=="5" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Smoke -Sub onda4 & pause & goto :menu_smoke )
if "%subop%"=="6" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Smoke -Sub onda5 & pause & goto :menu_smoke )
if "%subop%"=="7" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Smoke -Sub todos & pause & goto :menu_smoke )
if "%subop%"=="0" exit /b

echo(
echo Opcao invalida.
pause
goto :menu_smoke

REM ============================================================
REM  SUBMENU: GIT E PUBLICACAO
REM ============================================================
:menu_git
cls
echo(
echo  =====================================================
echo   Git e publicacao
echo  =====================================================
call :git_header
echo  -----------------------------------------------------
echo(
echo   1. Status do repositorio (ahead/behind, sujo)
echo   2. Commit rapido (Conventional Commit pt-BR)
echo   3. Push da branch atual
echo   4. Promover dev -^> producao ...
echo   5. Sincronizar dev com master
echo(
echo   0. Voltar
echo(
set "subop="
set /p subop="Escolha uma opcao: "
set "subop=%subop: =%"

if "%subop%"=="1" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao StatusRepo & pause & goto :menu_git )
if "%subop%"=="2" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Commit & pause & goto :menu_git )
if "%subop%"=="3" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Push & pause & goto :menu_git )
if "%subop%"=="4" ( call :menu_promover & goto :menu_git )
if "%subop%"=="5" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Sincronizar & pause & goto :menu_git )
if "%subop%"=="0" exit /b

echo(
echo Opcao invalida.
pause
goto :menu_git

REM ============================================================
REM  SUBMENU: PROMOVER
REM ============================================================
:menu_promover
cls
echo(
echo  =====================================================
echo   Promover dev -^> producao
echo  =====================================================
echo(
echo   Verifica (lint+test+build), leva a dev para master e
echo   publica. Producao puxa origin/master.
echo(
echo   1. Direto (merge em master + push)
echo   2. Direto - SIMULAR (dry-run, nao altera nada)
echo   3. Via Pull Request
echo   4. Via Pull Request - SIMULAR (dry-run)
echo(
echo   0. Voltar
echo(
set "subop="
set /p subop="Escolha uma opcao: "
set "subop=%subop: =%"

if "%subop%"=="1" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Promover -Sub Direto & pause & goto :menu_promover )
if "%subop%"=="2" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Promover -Sub Direto -DryRun & pause & goto :menu_promover )
if "%subop%"=="3" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Promover -Sub PR & pause & goto :menu_promover )
if "%subop%"=="4" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Promover -Sub PR -DryRun & pause & goto :menu_promover )
if "%subop%"=="0" exit /b

echo(
echo Opcao invalida.
pause
goto :menu_promover

REM ============================================================
REM  SUBMENU: BANCO DE DADOS (DEV)
REM ============================================================
:menu_db
cls
echo(
echo  =====================================================
echo   Banco de dados (DEV - porta 5433)
echo  =====================================================
echo(
echo   1. Migrar (prisma migrate dev)
echo   2. Gerar cliente Prisma (generate)
echo   3. Reaplicar seed (idempotente)
echo   4. Seed demo (APAGA dados de negocio)
echo   5. Resetar senha do admin
echo   6. Seeds de dev (aniversariantes/melhorias/modalidades) ...
echo   7. Abrir Prisma Studio
echo   8. Status do banco (porta 5433)
echo(
echo   0. Voltar
echo(
set "subop="
set /p subop="Escolha uma opcao: "
set "subop=%subop: =%"

if "%subop%"=="1" goto :input_migrate
if "%subop%"=="2" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao DbGenerate & pause & goto :menu_db )
if "%subop%"=="3" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao DbSeed & pause & goto :menu_db )
if "%subop%"=="4" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao SeedDemo & pause & goto :menu_db )
if "%subop%"=="5" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao ResetSenha & pause & goto :menu_db )
if "%subop%"=="6" ( call :menu_seeds_dev & goto :menu_db )
if "%subop%"=="7" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Studio & pause & goto :menu_db )
if "%subop%"=="8" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao DbStatus & pause & goto :menu_db )
if "%subop%"=="0" exit /b

echo(
echo Opcao invalida.
pause
goto :menu_db

:input_migrate
setlocal disabledelayedexpansion
echo(
set "mig="
set /p mig="Nome da migration (enter para o prisma perguntar): "
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao DbMigrate -Sub "%mig%"
endlocal
pause
goto :menu_db

:menu_seeds_dev
cls
echo(
echo  =====================================================
echo   Seeds de dev (dados ficticios, so para DEV)
echo  =====================================================
echo(
echo   1. Aniversariantes (herocard)
echo   2. Teste de melhorias (nascimento/socio/PJ/ponto/tarefas)
echo   3. Modalidades de licitacao
echo(
echo   0. Voltar
echo(
set "subop="
set /p subop="Escolha uma opcao: "
set "subop=%subop: =%"

if "%subop%"=="1" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao SeedsDev -Sub aniversariantes & pause & goto :menu_seeds_dev )
if "%subop%"=="2" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao SeedsDev -Sub melhorias & pause & goto :menu_seeds_dev )
if "%subop%"=="3" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao SeedsDev -Sub modalidades & pause & goto :menu_seeds_dev )
if "%subop%"=="0" exit /b

echo(
echo Opcao invalida.
pause
goto :menu_seeds_dev

REM ============================================================
REM  SUBMENU: VERSAO / RELEASE
REM ============================================================
:menu_release
cls
echo(
echo  =====================================================
echo   Versao / release (commit-and-tag-version)
echo  =====================================================
echo(
echo   1. Previa (dry-run) - mostra a proxima versao
echo   2. Release patch  (1.0.0 -^> 1.0.1)
echo   3. Release minor  (1.0.0 -^> 1.1.0)
echo   4. Release major  (1.0.0 -^> 2.0.0)
echo(
echo   0. Voltar
echo(
set "subop="
set /p subop="Escolha uma opcao: "
set "subop=%subop: =%"

if "%subop%"=="1" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao ReleaseDry & pause & goto :menu_release )
if "%subop%"=="2" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Release -Sub patch & pause & goto :menu_release )
if "%subop%"=="3" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Release -Sub minor & pause & goto :menu_release )
if "%subop%"=="4" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Release -Sub major & pause & goto :menu_release )
if "%subop%"=="0" exit /b

echo(
echo Opcao invalida.
pause
goto :menu_release

REM ============================================================
REM  SUBMENU: DIAGNOSTICO
REM ============================================================
:menu_diag
cls
echo(
echo  =====================================================
echo   Diagnostico
echo  =====================================================
echo(
echo   1. Doctor: checar ambiente dev
echo   2. Processos / portas (3000, 5433)
echo   3. Limpar caches (.next, node_modules\.cache)
echo   4. Corrigir build/deps corrompidos
echo   5. Abrir pasta de logs
echo   6. Ver ultimo log de verificacao
echo(
echo   0. Voltar
echo(
set "subop="
set /p subop="Escolha uma opcao: "
set "subop=%subop: =%"

if "%subop%"=="1" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao Doctor & pause & goto :menu_diag )
if "%subop%"=="2" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao ProcessosPortas & pause & goto :menu_diag )
if "%subop%"=="3" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao LimparCaches & pause & goto :menu_diag )
if "%subop%"=="4" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Acao CorrigirAmbiente & pause & goto :menu_diag )
if "%subop%"=="5" ( start "" "%APP_DIR%\logs" & goto :menu_diag )
if "%subop%"=="6" (
  if exist "%APP_DIR%\logs\dev-verificacao.log" ( start "" "%APP_DIR%\logs\dev-verificacao.log" ) else ( echo Nenhum log de verificacao ainda. & pause )
  goto :menu_diag
)
if "%subop%"=="0" exit /b

echo(
echo Opcao invalida.
pause
goto :menu_diag
