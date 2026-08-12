#requires -RunAsAdministrator
<#
.SYNOPSIS
  Registra a tarefa agendada do Windows que roda o deploy automatico noturno do SenaHub.
.DESCRIPTION
  So faz UMA coisa: cria/recria (idempotente) uma tarefa no Windows Task Scheduler que,
  todo dia no horario escolhido, chama:

    powershell -NoProfile -ExecutionPolicy Bypass -File deploy\gerenciar-servidor.ps1 -Acao DeployAutomatico

  Roda como SYSTEM (privilegio total local, sem precisar guardar senha de admin).

  HORARIO PADRAO 04:00 - nao mude para 03:30. O deploy PARA o servico SenaHub, e o pg-boss
  (que roda dentro dele) tem DOIS jobs agendados para 03:30: o backup de ARQUIVOS via robocopy
  e o alerta de jornadas abertas - ver src/lib/jobs.ts. Marcar o deploy para 03:30 mataria o
  espelho do storage no meio, e ele e o UNICO backup dos uploads: o dump do Postgres nao
  contem arquivo nenhum. As 04:00 o espelho ja teve 30 min para terminar. O backup do BANCO
  (03:00) nao entra nessa conta - o proprio deploy faz um antes de migrar.

  O comando em si (Invoke-DeployAutomatico, dentro de gerenciar-servidor.ps1) SO reinicia o
  servico se houver commit novo na master - nas noites sem mudanca, roda e sai sem downtime.

  PRE-REQUISITO: 'git config --system --add safe.directory <raiz>'. A tarefa roda como SYSTEM
  e o git recusa repositorio de outro dono ("detected dubious ownership") - sem isso o deploy
  morre no primeiro comando git, toda noite.

  Rode este script UMA VEZ, como Administrador. Depois disso a tarefa fica agendada sozinha;
  nao precisa rodar de novo a menos que queira mudar o horario ou recriar a tarefa.
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File "F:\SenaHub\app\deploy\instalar-tarefa-atualizacao.ps1"
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File "F:\SenaHub\app\deploy\instalar-tarefa-atualizacao.ps1" -Hora "04:30"
#>
param(
  [string]$TaskName = "SenaHub - Deploy Automatico",
  # 04:00 e deliberado - ver o aviso de horario acima antes de mudar.
  [string]$Hora = "04:00"
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
  -Description "Deploy automatico do SenaHub (git pull / build / migrate / restart), diario depois dos backups das 03:00 e 03:30. So mexe no servico se houver commit novo." `
  | Out-Null

Write-Host ""
Write-Host "[OK] Tarefa '$TaskName' registrada, diaria as $Hora, rodando como SYSTEM." -ForegroundColor Green
Write-Host ""
Write-Host "Para testar AGORA sem esperar o horario (recomendado antes de confiar na automacao):" -ForegroundColor Yellow
Write-Host "  Start-ScheduledTask -TaskName `"$TaskName`""
Write-Host "  Get-ScheduledTaskInfo -TaskName `"$TaskName`"   (confira LastTaskResult = 0)"
Write-Host ""
Write-Host "Logs depois de cada execucao: $AppRoot\logs\deploy-automatico.log e $AppRoot\logs\menu-audit.log"
