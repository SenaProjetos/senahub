#requires -RunAsAdministrator
<#
.SYNOPSIS
  Registra a tarefa agendada que inicia o SenaHub Manager (bandeja) ao fazer logon.
.DESCRIPTION
  Roda uma vez, como Administrador. Depois disso o SenaHub Manager sobe sozinho a cada
  logon do usuario administrador, ja elevado (sem UAC de novo), via Task Scheduler com
  "executar com privilegios mais altos" - mesmo padrao de instalar-tarefa-atualizacao.ps1.
.EXAMPLE
  .\deploy\instalar-monitor-bandeja.ps1
#>
param(
  [string]$TaskName = "SenaHub - Monitor Bandeja",
  [string]$ExePath = ""
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$AppRoot = Split-Path -Parent $PSScriptRoot
if (-not $ExePath) {
  $ExePath = Join-Path $AppRoot "deploy\gui\SenaHubManager\publish\SenaHubManager.exe"
}
if (-not (Test-Path $ExePath)) {
  throw "Nao encontrei o executavel em $ExePath. Rode 'dotnet publish' antes (ver docs\DEPLOY.md)."
}

Write-Host "Executavel: $ExePath"

$existente = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existente) {
  Write-Host "Tarefa '$TaskName' ja existe - recriando..."
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute $ExePath -WorkingDirectory (Split-Path -Parent $ExePath)
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -RestartCount 0

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings `
  -Description "Inicia o SenaHub Manager (bandeja, monitor de saude) ao fazer logon, ja elevado." `
  | Out-Null

Write-Host ""
Write-Host "[OK] Tarefa '$TaskName' registrada - inicia ao fazer logon deste usuario." -ForegroundColor Green
Write-Host ""
Write-Host "Para testar AGORA sem fazer logoff/logon:" -ForegroundColor Yellow
Write-Host "  Start-ScheduledTask -TaskName `"$TaskName`""
Write-Host "  (confira se o icone aparece na bandeja em alguns segundos)"
