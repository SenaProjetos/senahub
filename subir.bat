@echo off
REM Atalho direto: promover dev -> producao (Direto).
REM   subir          publica de verdade (verifica, mescla em master, push -> deploy)
REM   subir --dry    simula os passos sem alterar nada
if /i "%~1"=="--dry" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev\gerenciar-dev.ps1" -Acao Promover -Sub Direto -DryRun
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev\gerenciar-dev.ps1" -Acao Promover -Sub Direto
)
pause
