@echo off
setlocal enableextensions enabledelayedexpansion
title SenaHub - Deploy no servidor
color 0B

REM ============================================================
REM  SenaHub - deploy/atualizacao no servidor (Windows)
REM  Idempotente: 1a vez clona; nas seguintes faz pull e rebuild.
REM  NAO cobre partes interativas (instalar PostgreSQL no wizard,
REM  preencher .env, cloudflared login) - ele PARA e te avisa.
REM ============================================================

REM ===================== CONFIG (ajuste) ======================
set "REPO_URL=https://github.com/SenaProjetos/senahub.git"
REM IMPORTANTE: use a branch que voce JA fez push para o GitHub.
set "BRANCH=master"
set "APP_DIR=F:\SenaHub\app"
set "SERVICE_PORT=3000"
set "SERVICE_NAME=SenaHub"
REM ============================================================

echo(
echo === SenaHub :: deploy ===
echo Repo .....: %REPO_URL%
echo Branch ...: %BRANCH%
echo Pasta ....: %APP_DIR%
echo Porta ....: %SERVICE_PORT%
echo(

REM --- admin? (necessario para instalar o servico) ---
net session >nul 2>&1
if errorlevel 1 (
  echo [AVISO] Nao esta como Administrador. O passo do servico Windows sera pulado.
  echo         Para instalar o servico, rode este .bat como Administrador.
  set "EH_ADMIN=0"
) else (
  set "EH_ADMIN=1"
)
echo(

REM ============== 1) PRE-REQUISITOS ==============
echo [1/7] Verificando pre-requisitos...

call :precisa git    "Git.Git"
if errorlevel 1 goto :erro
call :precisa node   "OpenJS.NodeJS.LTS"
if errorlevel 1 goto :erro
call :precisa npm    ""
if errorlevel 1 goto :erro

REM cloudflared e nssm: opcionais aqui (tunel/servico). Tenta instalar se faltar.
where cloudflared >nul 2>&1 || (echo   - cloudflared ausente; tentando instalar... & call winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements >nul 2>&1)
where nssm        >nul 2>&1 || (echo   - nssm ausente; tentando instalar...        & call winget install --id NSSM.NSSM -e --accept-source-agreements --accept-package-agreements >nul 2>&1)

REM PostgreSQL: NAO instalamos em silencio (precisa do wizard + senha). Apenas avisamos.
where psql >nul 2>&1 || (
  echo(
  echo [AVISO] PostgreSQL ^(psql^) nao encontrado no PATH.
  echo         Instale o PostgreSQL 17 e crie o banco vazio antes de seguir:
  echo            CREATE USER senahub WITH PASSWORD 'SENHA';
  echo            CREATE DATABASE senahub OWNER senahub;
  echo         Veja docs\DEPLOY.md secao 2.
)
echo(

REM ============== 2) CLONE / PULL ==============
echo [2/7] Obtendo o codigo (%BRANCH%)...
if exist "%APP_DIR%\.git" (
  pushd "%APP_DIR%"
  call git fetch origin || goto :erro
  call git checkout %BRANCH% || goto :erro
  call git pull --ff-only origin %BRANCH% || goto :erro
) else (
  call git clone -b %BRANCH% "%REPO_URL%" "%APP_DIR%" || goto :erro
  pushd "%APP_DIR%"
)
echo(

REM ============== 3) .ENV ==============
echo [3/7] Conferindo o .env...
if not exist ".env" (
  copy /y ".env.production.example" ".env" >nul
  echo   .env criado a partir do modelo. ABRINDO no Notepad para voce preencher.
  echo   Preencha DATABASE_URL, APP_URL, BETTER_AUTH_URL, BETTER_AUTH_SECRET, etc.
  start /wait notepad ".env"
)
REM Aborta se ainda tiver placeholders <<...>>
findstr /c:"<<" ".env" >nul 2>&1 && (
  echo(
  echo [ERRO] O .env ainda contem placeholders ^<^<...^>^>. Preencha e rode de novo.
  goto :fim
)
echo   .env OK.
echo(

REM ============== 4) DEPENDENCIAS + BUILD ==============
echo [4/7] npm ci + build... (pode demorar)
call npm ci || goto :erro
call npm run build || goto :erro
echo(

REM ============== 5) BANCO (migrations + seed) ==============
echo [5/7] Banco: migrate deploy + seed...
call npx prisma migrate deploy || goto :erro
echo   Aplicando seed (admin + permissoes + catalogos; idempotente)...
call npm run db:seed || goto :erro
echo(

REM ============== 6) SERVICO WINDOWS ==============
echo [6/7] Servico Windows...
if "%EH_ADMIN%"=="1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\instalar-servico.ps1" -Port %SERVICE_PORT% -ServiceName %SERVICE_NAME%
  if errorlevel 1 (
    echo [AVISO] Falha ao instalar o servico. Verifique se o NSSM esta no PATH.
  ) else (
    net stop %SERVICE_NAME% >nul 2>&1
    net start %SERVICE_NAME%
    echo   Servico %SERVICE_NAME% iniciado na porta %SERVICE_PORT%.
  )
) else (
  echo   Pulado ^(rode como Administrador para instalar o servico^).
  echo   Manual: npm start   ^(roda em http://localhost:%SERVICE_PORT%^)
)
echo(

REM ============== 7) PROXIMOS PASSOS (manual) ==============
echo [7/7] Pronto. Passos MANUAIS restantes (uma vez):
echo(
echo   Cloudflare Tunnel:
echo     cloudflared tunnel login
echo     cloudflared tunnel create senahub
echo     cloudflared tunnel route dns senahub SEU.DOMINIO
echo     ^(crie o config.yml a partir de deploy\cloudflared-config.example.yml^)
echo     cloudflared service install  ^&^&  net start cloudflared
echo(
echo   Verifique: https://SEU.DOMINIO  (login admin: tadrio@senaprojetos.com.br / SenaHub@2026)
echo   Detalhes completos em docs\DEPLOY.md
echo(
popd >nul 2>&1
echo === concluido com sucesso ===
goto :fim

REM ============== sub-rotina: precisa <cmd> <wingetId> ==============
:precisa
where %1 >nul 2>&1 && (echo   - %1 OK & exit /b 0)
echo   - %1 ausente.
if "%~2"=="" (
  echo     Instale manualmente e rode de novo.
  exit /b 1
)
echo     Tentando instalar via winget (%~2)...
call winget install --id %~2 -e --accept-source-agreements --accept-package-agreements
where %1 >nul 2>&1 && (echo     %1 instalado. & exit /b 0)
echo     [ERRO] %1 ainda ausente. Feche/reabra o terminal (PATH) ou instale manualmente.
exit /b 1

:erro
echo(
echo *** ERRO no deploy. Veja a mensagem acima. Nada foi finalizado. ***
popd >nul 2>&1

:fim
echo(
pause
endlocal
