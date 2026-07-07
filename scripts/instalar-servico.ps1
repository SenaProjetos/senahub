#requires -RunAsAdministrator
<#
.SYNOPSIS
  Instala o SenaHub como serviço do Windows via NSSM (produção).
.DESCRIPTION
  Roda `node node_modules/tsx server.ts` (= o que `npm start` faz): Next em produção +
  Socket.io + pg-boss no mesmo processo. Configura diretório, variáveis de ambiente,
  logs com rotação e reinício automático em falha. Idempotente: recria o serviço se já existir.

  Pré-requisitos:
    - NSSM instalado (https://nssm.cc) e no PATH, ou informe -NssmPath.
    - `npm install` e `npm run build` já executados na pasta do projeto.
    - .env de produção configurado (DATABASE_URL, BETTER_AUTH_SECRET, APP_URL, SMTP, STORAGE_BASE_PATH, NODE_ENV=production).

.EXAMPLE
  .\scripts\instalar-servico.ps1 -Port 3000
.EXAMPLE
  .\scripts\instalar-servico.ps1 -ServiceName SenaHub -NssmPath "C:\nssm\nssm.exe"
#>
param(
  [string]$ServiceName = "SenaHub",
  [int]$Port = 3000,
  [string]$NssmPath = "nssm"
)

$ErrorActionPreference = "Stop"

# Raiz do projeto = pasta-pai deste script.
$root = Split-Path -Parent $PSScriptRoot
Write-Host "Projeto: $root"

# Resolve node e o CLI do tsx.
$node = (Get-Command node -ErrorAction Stop).Source
$tsx = Join-Path $root "node_modules\tsx\dist\cli.mjs"
if (-not (Test-Path $tsx)) {
  throw "tsx não encontrado em $tsx. Rode 'npm install' na pasta do projeto primeiro."
}
$serverEntry = Join-Path $root "server.ts"
if (-not (Test-Path $serverEntry)) { throw "server.ts não encontrado em $root." }
if (-not (Test-Path (Join-Path $root ".next"))) {
  Write-Warning ".next não encontrado — rode 'npm run build' antes de iniciar o serviço."
}

# Confirma NSSM.
try { & $NssmPath version | Out-Null } catch { throw "NSSM não encontrado ('$NssmPath'). Instale e/ou informe -NssmPath." }

# Logs.
$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Remove serviço anterior (idempotência).
$existe = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existe) {
  Write-Host "Serviço '$ServiceName' já existe — recriando…"
  & $NssmPath stop $ServiceName | Out-Null
  & $NssmPath remove $ServiceName confirm | Out-Null
  Start-Sleep -Seconds 1
}

# Instala: node <tsx cli> --tsconfig tsconfig.server.json server.ts
& $NssmPath install $ServiceName $node $tsx "--tsconfig" "tsconfig.server.json" "server.ts"
& $NssmPath set $ServiceName AppDirectory $root
& $NssmPath set $ServiceName DisplayName "SenaHub — ERP BIM"
& $NssmPath set $ServiceName Description "SenaHub (Next + Socket.io + pg-boss)"
& $NssmPath set $ServiceName Start SERVICE_AUTO_START
& $NssmPath set $ServiceName AppEnvironmentExtra "NODE_ENV=production" "PORT=$Port"

# Logs com rotação (10 MB).
& $NssmPath set $ServiceName AppStdout (Join-Path $logDir "senahub.out.log")
& $NssmPath set $ServiceName AppStderr (Join-Path $logDir "senahub.err.log")
& $NssmPath set $ServiceName AppRotateFiles 1
& $NssmPath set $ServiceName AppRotateOnline 1
& $NssmPath set $ServiceName AppRotateBytes 10485760

# Reinício automático em falha (throttle 10s, delay 5s).
& $NssmPath set $ServiceName AppThrottle 10000
& $NssmPath set $ServiceName AppExit Default Restart
& $NssmPath set $ServiceName AppRestartDelay 5000

Write-Host ""
Write-Host "✔ Serviço '$ServiceName' instalado (porta $Port)." -ForegroundColor Green
Write-Host "  Iniciar:  nssm start $ServiceName   (ou Start-Service $ServiceName)"
Write-Host "  Logs:     $logDir"
Write-Host ""
Write-Host "Próximo: cloudflared apontando para http://localhost:$Port (rota nova ou troca no cutover)."
