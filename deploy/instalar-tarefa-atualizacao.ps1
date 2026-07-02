#requires -RunAsAdministrator
<#
.SYNOPSIS
  Registra a tarefa agendada do Windows que roda o deploy automatico noturno do SenaHub.
.DESCRIPTION
  So faz UMA coisa: cria/recria (idempotente) uma tarefa no Windows Task Scheduler que,
  todo dia no horario escolhido, chama:

    powershell -NoProfile -ExecutionPolicy Bypass -File deploy\gerenciar-servidor.ps1 -Acao DeployAutomatico

  Roda como SYSTEM (privilegio total local, sem precisar guardar senha de admin), pensado
  para disparar alguns minutos depois do backup diario as 03:00 (agendado dentro do proprio
  app via pg-boss - ver src/lib/jobs.ts). O comando em si (Invoke-DeployAutomatico, dentro de
  gerenciar-servidor.ps1) SO reinicia o servico se houver commit novo na master - nas noites
  sem mudanca, roda e sai sem downtime.

  Rode este script UMA VEZ, como Administrador. Depois disso a tarefa fica agendada sozinha;
  nao precisa rodar de novo a menos que queira mudar o horario ou recriar a tarefa.
.EXAMPLE
  .\deploy\instalar-tarefa-atualizacao.ps1
.EXAMPLE
  .\deploy\instalar-tarefa-atualizacao.ps1 -Hora "04:00"
#>
param(
  [string]$TaskName = "SenaHub - Deploy Automatico",
  [string]$Hora = "03:30"
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

# Raiz do projeto = pasta-pai deste script (deploy/ -> app root).
$AppRoot = Split-Path -Parent $PSScriptRoot
$ps1 = Join-Path $AppRoot "deploy\gerenciar-servidor.ps1"
if (-not (Test-Path $ps1)) {
  throw "Nao encontrei gerenciar-servidor.ps1 em $ps1."
}

Write-Host "Projeto: $AppRoot"
Write-Host "Script chamado pela tarefa: $ps1"

# Remove tarefa anterior (idempotencia), igual ao padrao de scripts\instalar-servico.ps1.
$existente = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existente) {
  Write-Host "Tarefa '$TaskName' ja existe - recriando..."
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ps1`" -Acao DeployAutomatico" `
  -WorkingDirectory $AppRoot

$trigger = New-ScheduledTaskTrigger -Daily -At $Hora

# SYSTEM: privilegio total nos servicos locais (Stop-Service/Start-Service do SenaHub),
# sem precisar guardar credencial de administrador na tarefa.
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopOnIdleEnd `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
  -RestartCount 0

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings `
  -Description "Deploy automatico do SenaHub (git pull / build / migrate / restart), diario apos o backup das 03:00. So mexe no servico se houver commit novo." `
  | Out-Null

Write-Host ""
Write-Host "[OK] Tarefa '$TaskName' registrada, diaria as $Hora, rodando como SYSTEM." -ForegroundColor Green
Write-Host ""
Write-Host "Para testar AGORA sem esperar o horario (recomendado antes de confiar na automacao):" -ForegroundColor Yellow
Write-Host "  Start-ScheduledTask -TaskName `"$TaskName`""
Write-Host "  Get-ScheduledTaskInfo -TaskName `"$TaskName`"   (confira LastTaskResult = 0)"
Write-Host ""
Write-Host "Logs depois de cada execucao: $AppRoot\logs\deploy-automatico.log e $AppRoot\logs\menu-audit.log"
