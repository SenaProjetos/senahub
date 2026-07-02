#requires -Version 5.1
<#
.SYNOPSIS
  Funcoes de apoio do menu de gestao do servidor SenaHub (chamado por gerenciar-servidor.bat).
.DESCRIPTION
  Nao roda nada sozinho de forma destrutiva sem confirmacao. Todo texto em pt-BR sem
  acentos (mesma convencao do deploy-servidor.bat) para evitar problemas de encoding
  no PowerShell 5.1 / console do Windows.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Acao,
    [string]$Sub = "",
    [switch]$Confirmar
)

$ErrorActionPreference = "Stop"

# Log e .env sao UTF-8; sem isso o console mostra os acentos corrompidos
# mesmo com o texto sendo lido corretamente (mesma familia de bug de
# encoding que ja vimos hoje no instalar-servico.ps1).
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

# Raiz do projeto = pasta-pai deste script (deploy/ -> app root).
$AppRoot = Split-Path -Parent $PSScriptRoot
$LogsDir = Join-Path $AppRoot "logs"
$AuditLogPath = Join-Path $LogsDir "menu-audit.log"

if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null
}

# ======================== FUNCOES DE APOIO ========================

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-EnvValue {
    param([string]$Key)
    $envPath = Join-Path $AppRoot ".env"
    if (-not (Test-Path $envPath)) { return $null }
    $linha = Get-Content $envPath -Encoding UTF8 | Where-Object { $_ -match "^$Key=" } | Select-Object -First 1
    if (-not $linha) { return $null }
    $valor = $linha -replace "^$Key=", ""
    $valor = $valor.Trim().Trim('"')
    $valor = $valor -replace '\\\\', '\'
    return $valor
}

function Write-Audit {
    param([string]$AcaoNome, [string]$Detalhe = "")
    $linha = "{0} | {1} | {2} | {3}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $env:USERNAME, $AcaoNome, $Detalhe
    Add-Content -Path $AuditLogPath -Value $linha -Encoding UTF8
}

function Confirm-Typed {
    param([string]$Palavra = "CONFIRMAR")
    if ($Confirmar) { return $true }
    Write-Host ""
    Write-Host "Digite '$Palavra' para confirmar (qualquer outra coisa cancela):" -ForegroundColor Yellow
    $resp = Read-Host ">"
    return ($resp -eq $Palavra)
}

function Assert-Admin {
    if (-not (Test-Admin)) {
        Write-Host ""
        Write-Host "[ERRO] Esta acao precisa ser executada como Administrador." -ForegroundColor Red
        Write-Host "       Feche o menu e abra de novo com 'Executar como administrador'." -ForegroundColor Red
        return $false
    }
    return $true
}

function Test-PostgresConnection {
    $dbUrl = Get-EnvValue -Key "DATABASE_URL"
    $pgDumpPath = Get-EnvValue -Key "PG_DUMP_PATH"
    if (-not $dbUrl -or -not $pgDumpPath) { return $false }
    if ($dbUrl -notmatch "postgresql://([^:]+):([^@]+)@([^:/]+):(\d+)/([\w-]+)") { return $false }
    $dbUser = $Matches[1]; $dbPass = $Matches[2]; $dbHost = $Matches[3]; $dbPort = $Matches[4]; $dbName = $Matches[5]
    $psqlPath = Join-Path (Split-Path $pgDumpPath -Parent) "psql.exe"
    if (-not (Test-Path $psqlPath)) { return $false }
    $env:PGPASSWORD = $dbPass
    try {
        & $psqlPath -h $dbHost -p $dbPort -U $dbUser -d $dbName -t -c "select 1" *> $null
        $ok = ($LASTEXITCODE -eq 0)
    } catch {
        $ok = $false
    } finally {
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    }
    return $ok
}

# ======================== ACOES ========================

function Invoke-Status {
    Write-Host ""
    Write-Host "==================== STATUS DO SISTEMA ====================" -ForegroundColor Cyan
    Write-Host ""

    $problemas = @()

    foreach ($nome in @("SenaHub", "cloudflared", "postgresql-x64-17")) {
        $svc = Get-Service -Name $nome -ErrorAction SilentlyContinue
        if ($svc -and $svc.Status -eq "Running") {
            Write-Host ("  [OK]   Servico {0,-20} Running" -f $nome) -ForegroundColor Green
        } elseif ($svc) {
            Write-Host ("  [FALHA] Servico {0,-20} {1}" -f $nome, $svc.Status) -ForegroundColor Red
            $problemas += "Servico $nome nao esta Running (estado atual: $($svc.Status))"
        } else {
            Write-Host ("  [FALHA] Servico {0,-20} NAO INSTALADO" -f $nome) -ForegroundColor Red
            $problemas += "Servico $nome nao esta instalado"
        }
    }

    $portaOk = $false
    try {
        $teste = Test-NetConnection -ComputerName 127.0.0.1 -Port 3000 -WarningAction SilentlyContinue -InformationLevel Quiet
        $portaOk = [bool]$teste
    } catch { $portaOk = $false }
    if ($portaOk) {
        Write-Host "  [OK]   Porta 3000 (app) respondendo" -ForegroundColor Green
    } else {
        Write-Host "  [FALHA] Porta 3000 (app) nao responde" -ForegroundColor Red
        $problemas += "Porta 3000 nao esta aceitando conexoes"
    }

    $appUrl = Get-EnvValue -Key "APP_URL"
    if (-not $appUrl) { $appUrl = "https://hub.senaprojetos.com.br" }
    $urlLogin = "$appUrl/login"
    try {
        $resp = Invoke-WebRequest -Uri $urlLogin -TimeoutSec 15 -UseBasicParsing -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            Write-Host "  [OK]   URL publica respondendo (HTTP 200)" -ForegroundColor Green
        } else {
            Write-Host ("  [FALHA] URL publica respondeu HTTP {0}" -f $resp.StatusCode) -ForegroundColor Red
            $problemas += "URL publica respondeu HTTP $($resp.StatusCode)"
        }
    } catch {
        $codigo = $null
        if ($_.Exception.Response) { $codigo = [int]$_.Exception.Response.StatusCode }
        Write-Host ("  [FALHA] URL publica nao respondeu corretamente (HTTP {0})" -f $codigo) -ForegroundColor Red
        $problemas += "URL publica inacessivel (se HTTP 530/1033: tunel cloudflared parado ou DNS apontando para o tunel errado)"
    }

    if (Test-PostgresConnection) {
        Write-Host "  [OK]   Banco de dados (autenticacao) OK" -ForegroundColor Green
    } else {
        Write-Host "  [FALHA] Banco de dados: nao foi possivel autenticar/conectar" -ForegroundColor Red
        $problemas += "Falha ao autenticar no Postgres (veja se o servico postgresql-x64-17 esta rodando)"
    }

    Write-Host ""
    if ($problemas.Count -eq 0) {
        Write-Host "  RESULTADO: Sistema OK" -ForegroundColor Green
    } else {
        Write-Host "  RESULTADO: Sistema com problemas:" -ForegroundColor Red
        foreach ($p in $problemas) { Write-Host "    - $p" -ForegroundColor Yellow }
    }
    Write-Host "=============================================================" -ForegroundColor Cyan
}

function Invoke-TailLog {
    param([string]$Nome)
    if ($Nome -eq "SenaHub") {
        $out = Join-Path $LogsDir "senahub.out.log"
        $err = Join-Path $LogsDir "senahub.err.log"
    } else {
        $out = Join-Path $LogsDir "cloudflared-nssm.out.log"
        $err = Join-Path $LogsDir "cloudflared-nssm.err.log"
    }
    Write-Host ""
    Write-Host "---- Ultimas 40 linhas: $out ----" -ForegroundColor Cyan
    if (Test-Path $out) { Get-Content $out -Tail 40 -Encoding UTF8 } else { Write-Host "(arquivo nao encontrado)" }
    Write-Host ""
    Write-Host "---- Ultimas 40 linhas: $err ----" -ForegroundColor Cyan
    if (Test-Path $err) { Get-Content $err -Tail 40 -Encoding UTF8 } else { Write-Host "(arquivo nao encontrado)" }

    if ($Nome -eq "Cloudflared") {
        $debugLog = Join-Path $LogsDir "cloudflared.log"
        if (Test-Path $debugLog) {
            Write-Host ""
            Write-Host "---- Ultimas 20 linhas (debug json): $debugLog ----" -ForegroundColor Cyan
            Get-Content $debugLog -Tail 20 -Encoding UTF8
        }
    }
}

function Invoke-CrashLoopCheck {
    Write-Host ""
    Write-Host "---- Reinicios recentes (ultima hora) ----" -ForegroundColor Cyan
    $umaHoraAtras = (Get-Date).AddHours(-1)
    foreach ($padrao in @("senahub.err-*.log", "senahub.out-*.log", "cloudflared-nssm.err-*.log", "cloudflared-nssm.out-*.log")) {
        $arquivos = Get-ChildItem -Path $LogsDir -Filter $padrao -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt $umaHoraAtras }
        $qtd = ($arquivos | Measure-Object).Count
        $cor = if ($qtd -gt 5) { "Red" } elseif ($qtd -gt 0) { "Yellow" } else { "Green" }
        Write-Host ("  {0,-34} {1} reinicio(s)" -f $padrao, $qtd) -ForegroundColor $cor
    }
    Write-Host ""
    Write-Host "  (mais de 5 reinicios/hora pode indicar crash-loop - veja os logs de erro)" -ForegroundColor DarkGray
}

function Invoke-Diagnostico {
    param([string]$Tipo)
    switch ($Tipo) {
        "Upload" {
            $storage = Get-EnvValue -Key "STORAGE_BASE_PATH"
            Write-Host ""
            Write-Host "Verificando STORAGE_BASE_PATH: $storage" -ForegroundColor Cyan
            if ($storage -and (Test-Path $storage)) {
                Write-Host "[OK] A pasta existe." -ForegroundColor Green
                try {
                    $testFile = Join-Path $storage ".teste-escrita-menu.tmp"
                    Set-Content -Path $testFile -Value "teste" -ErrorAction Stop
                    Remove-Item $testFile -ErrorAction SilentlyContinue
                    Write-Host "[OK] Tem permissao de escrita." -ForegroundColor Green
                } catch {
                    Write-Host "[FALHA] Sem permissao de escrita nessa pasta - provavel causa do problema." -ForegroundColor Red
                }
            } else {
                Write-Host "[FALHA] A pasta nao existe - essa e a causa provavel do problema de upload." -ForegroundColor Red
            }
        }
        "Chat" {
            $svc = Get-Service -Name "SenaHub" -ErrorAction SilentlyContinue
            Write-Host ""
            if ($svc -and $svc.Status -eq "Running") {
                Write-Host "[OK] Servico SenaHub esta rodando (chat/Socket.io fica no mesmo processo)." -ForegroundColor Green
                Write-Host "Se o chat ainda assim nao conecta, verifique BETTER_AUTH_URL e cookies no navegador." -ForegroundColor Yellow
            } else {
                Write-Host "[FALHA] Servico SenaHub nao esta rodando - essa e a causa provavel." -ForegroundColor Red
            }
        }
        "PDF" {
            $chrome = Get-EnvValue -Key "CHROME_PATH"
            Write-Host ""
            Write-Host "Verificando CHROME_PATH: $chrome" -ForegroundColor Cyan
            if ($chrome -and (Test-Path $chrome)) {
                Write-Host "[OK] Chrome encontrado nesse caminho." -ForegroundColor Green
            } else {
                Write-Host "[FALHA] Chrome nao encontrado nesse caminho - essa e a causa provavel da falha ao gerar PDF." -ForegroundColor Red
            }
        }
        "Site" {
            Invoke-Status
        }
        default {
            Write-Host "Tipo de diagnostico desconhecido: $Tipo" -ForegroundColor Red
        }
    }
}

function Invoke-Backup {
    $pgDumpPath = Get-EnvValue -Key "PG_DUMP_PATH"
    $backupPath = Get-EnvValue -Key "BACKUP_PATH"
    $dbUrl = Get-EnvValue -Key "DATABASE_URL"

    if (-not $pgDumpPath -or -not (Test-Path $pgDumpPath)) {
        Write-Host "[ERRO] PG_DUMP_PATH invalido ou nao definido no .env." -ForegroundColor Red
        return $false
    }
    if (-not $backupPath) {
        Write-Host "[ERRO] BACKUP_PATH nao definido no .env." -ForegroundColor Red
        return $false
    }
    if (-not (Test-Path $backupPath)) {
        New-Item -ItemType Directory -Force -Path $backupPath | Out-Null
    }
    if (-not $dbUrl -or $dbUrl -notmatch "postgresql://([^:]+):([^@]+)@([^:/]+):(\d+)/([\w-]+)") {
        Write-Host "[ERRO] Nao foi possivel interpretar DATABASE_URL." -ForegroundColor Red
        return $false
    }
    $dbUser = $Matches[1]; $dbPass = $Matches[2]; $dbHost = $Matches[3]; $dbPort = $Matches[4]; $dbName = $Matches[5]

    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $arquivo = Join-Path $backupPath "senahub_$timestamp.backup"
    Write-Host ""
    Write-Host "Gerando backup em: $arquivo" -ForegroundColor Cyan

    $env:PGPASSWORD = $dbPass
    try {
        & $pgDumpPath -h $dbHost -p $dbPort -U $dbUser -d $dbName -Fc -f $arquivo
        $ok = ($LASTEXITCODE -eq 0)
    } catch {
        $ok = $false
    } finally {
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    }

    if ($ok -and (Test-Path $arquivo)) {
        $tamanho = [math]::Round((Get-Item $arquivo).Length / 1MB, 2)
        Write-Host "[OK] Backup concluido: $arquivo ($tamanho MB)" -ForegroundColor Green
        Write-Audit -AcaoNome "Backup" -Detalhe "$arquivo ($tamanho MB)"
        return $true
    } else {
        Write-Host "[ERRO] Falha ao gerar backup." -ForegroundColor Red
        Write-Audit -AcaoNome "Backup" -Detalhe "FALHOU"
        return $false
    }
}

function Invoke-ListarBackups {
    $backupPath = Get-EnvValue -Key "BACKUP_PATH"
    Write-Host ""
    if (-not $backupPath -or -not (Test-Path $backupPath)) {
        Write-Host "[FALHA] Pasta de backups nao encontrada: $backupPath" -ForegroundColor Red
        return
    }
    $arquivos = Get-ChildItem -Path $backupPath -Filter "*.backup" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
    if (-not $arquivos -or $arquivos.Count -eq 0) {
        Write-Host "[FALHA] Nenhum backup encontrado em $backupPath" -ForegroundColor Red
        return
    }
    Write-Host "Backups em $backupPath :" -ForegroundColor Cyan
    foreach ($a in ($arquivos | Select-Object -First 15)) {
        $tamanho = [math]::Round($a.Length / 1MB, 2)
        Write-Host ("  {0}  {1,10} MB  {2}" -f $a.LastWriteTime, $tamanho, $a.Name)
    }
    $maisRecente = $arquivos[0]
    $idadeHoras = ((Get-Date) - $maisRecente.LastWriteTime).TotalHours
    if ($idadeHoras -gt 24) {
        Write-Host ""
        Write-Host ("[ATENCAO] O backup mais recente tem {0:N0} horas - considere gerar um novo." -f $idadeHoras) -ForegroundColor Yellow
    }
}

function Invoke-SmokeTests {
    $ondas = @("smoke:onda1", "smoke:onda2", "smoke:onda3", "smoke:onda3efg", "smoke:onda4", "smoke:onda5")
    $resultados = @()
    Push-Location $AppRoot
    try {
        foreach ($onda in $ondas) {
            Write-Host ""
            Write-Host "==== npm run $onda ====" -ForegroundColor Cyan
            & npm run $onda
            $ok = ($LASTEXITCODE -eq 0)
            $resultados += [PSCustomObject]@{ Onda = $onda; Ok = $ok }
        }
    } finally {
        Pop-Location
    }
    Write-Host ""
    Write-Host "---- Resumo ----" -ForegroundColor Cyan
    foreach ($r in $resultados) {
        if ($r.Ok) { Write-Host ("  [OK]     {0}" -f $r.Onda) -ForegroundColor Green }
        else { Write-Host ("  [FALHOU] {0}" -f $r.Onda) -ForegroundColor Red }
    }
    Write-Audit -AcaoNome "SmokeTests" -Detalhe (($resultados | ForEach-Object { "$($_.Onda)=$($_.Ok)" }) -join "; ")
}

function Invoke-DeployCompleto {
    if (-not (Assert-Admin)) { return }
    Push-Location $AppRoot
    try {
        Write-Host ""
        Write-Host "---- Verificando mudancas locais nao commitadas ----" -ForegroundColor Cyan
        $statusGit = git status --porcelain
        if ($statusGit) {
            Write-Host "[ERRO] Ha mudancas locais nao commitadas. Resolva antes de atualizar." -ForegroundColor Red
            Write-Host $statusGit
            return
        }
        Write-Host "[OK] Nada pendente." -ForegroundColor Green

        Write-Host ""
        Write-Host "---- git pull ----" -ForegroundColor Cyan
        git pull
        if ($LASTEXITCODE -ne 0) { Write-Host "[ERRO] git pull falhou." -ForegroundColor Red; return }

        Write-Host ""
        Write-Host "---- Parando SenaHub ----" -ForegroundColor Cyan
        Write-Host "No Windows, node_modules/.next ficam travados (arquivos em uso) enquanto" -ForegroundColor Yellow
        Write-Host "o servico esta rodando - por isso ele para aqui, antes de mexer no codigo." -ForegroundColor Yellow
        Stop-Service -Name "SenaHub" -Force
        Start-Sleep -Seconds 2

        Write-Host ""
        Write-Host "---- npm ci ----" -ForegroundColor Cyan
        npm ci
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERRO] npm ci falhou. O SenaHub continua PARADO (site fora do ar)." -ForegroundColor Red
            Write-Host "Corrija o erro acima e rode esta opcao de novo, ou use a opcao 4 para so reiniciar com o que ja esta no disco." -ForegroundColor Yellow
            return
        }

        Write-Host ""
        Write-Host "---- npm run build ----" -ForegroundColor Cyan
        npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERRO] Build falhou. O SenaHub continua PARADO (site fora do ar)." -ForegroundColor Red
            Write-Host "Corrija o erro acima; se o build ficou corrompido, use a opcao 12 -> 'Corrigir build corrompido'." -ForegroundColor Yellow
            return
        }

        Write-Host ""
        Write-Host "---- Backup de seguranca antes da migration ----" -ForegroundColor Cyan
        $backupOk = Invoke-Backup
        if (-not $backupOk) {
            if (-not (Confirm-Typed -Palavra "CONTINUAR")) {
                Write-Host "Cancelado pelo operador. O SenaHub continua PARADO - inicie com a opcao 4 quando quiser." -ForegroundColor Yellow
                return
            }
        }

        Write-Host ""
        Write-Host "---- prisma migrate deploy ----" -ForegroundColor Cyan
        npx prisma migrate deploy
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERRO] Migration falhou. O SenaHub continua PARADO. Avalie restaurar o backup se necessario." -ForegroundColor Red
            return
        }

        Write-Host ""
        Write-Host "---- Iniciando servico SenaHub ----" -ForegroundColor Cyan
        Start-Service -Name "SenaHub"
        Start-Sleep -Seconds 8

        Write-Host ""
        Write-Host "---- Checagem final ----" -ForegroundColor Cyan
        Invoke-Status
        Write-Audit -AcaoNome "DeployCompleto" -Detalhe "OK"
    } finally {
        Pop-Location
    }
}

function Write-DeployLog {
    param([string]$Linha)
    $logPath = Join-Path $LogsDir "deploy-automatico.log"
    $linhaComData = "{0} | {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Linha
    Add-Content -Path $logPath -Value $linhaComData -Encoding UTF8
}

function Invoke-Notificacao {
    param([string]$Status, [string]$Detalhe)
    $logPath = Join-Path $LogsDir "deploy-automatico.log"
    try {
        & npx tsx --tsconfig tsconfig.server.json scripts/notificar-deploy.ts --status $Status --detalhe $Detalhe *>> $logPath
    } catch {
        Write-DeployLog "[aviso] falha ao notificar por e-mail (nao bloqueia o resultado do deploy): $($_.Exception.Message)"
    }
}

function Invoke-DeployAutomatico {
    # Variante NAO INTERATIVA de Invoke-DeployCompleto, para rodar via Windows Task
    # Scheduler (sem ninguem para responder Confirm-Typed). Roda todo santo dia, mas
    # so para/rebuilda/reinicia o servico se houver commit novo em origin/master - nas
    # noites sem mudanca, sai cedo sem downtime nenhum.
    Push-Location $AppRoot
    $inicio = Get-Date
    $logPath = Join-Path $LogsDir "deploy-automatico.log"
    try {
        Write-DeployLog "===== INICIO deploy automatico ====="

        $commitAntes = (git rev-parse HEAD).Trim()

        $statusGit = git status --porcelain
        if ($statusGit) {
            Write-DeployLog "ABORTADO: ha mudancas locais nao commitadas."
            Invoke-Notificacao -Status "falhou" -Detalhe "Mudancas locais nao commitadas impediram o deploy automatico. Servico NAO foi tocado."
            Write-Audit -AcaoNome "DeployAutomatico" -Detalhe "ABORTADO: git status sujo"
            return
        }

        git pull *>> $logPath
        if ($LASTEXITCODE -ne 0) {
            Write-DeployLog "ABORTADO: git pull falhou."
            Invoke-Notificacao -Status "falhou" -Detalhe "git pull falhou. Servico NAO foi tocado."
            Write-Audit -AcaoNome "DeployAutomatico" -Detalhe "FALHOU: git pull"
            return
        }

        $commitDepois = (git rev-parse HEAD).Trim()
        if ($commitAntes -eq $commitDepois) {
            Write-DeployLog "Nada a fazer: nenhum commit novo (HEAD=$commitDepois)."
            Write-Audit -AcaoNome "DeployAutomatico" -Detalhe "SEM MUDANCAS ($commitDepois)"
            return
        }

        Write-DeployLog "Commits novos detectados: $commitAntes -> $commitDepois. Parando SenaHub..."
        Stop-Service -Name "SenaHub" -Force
        Start-Sleep -Seconds 2

        npm ci *>> $logPath
        if ($LASTEXITCODE -ne 0) {
            Write-DeployLog "FALHOU: npm ci. Servico continua PARADO."
            Invoke-Notificacao -Status "falhou" -Detalhe "npm ci falhou no commit $commitDepois. Site FORA DO AR ate correcao manual (menu opcao 4 ou 12)."
            Write-Audit -AcaoNome "DeployAutomatico" -Detalhe "FALHOU: npm ci ($commitDepois)"
            return
        }

        npm run build *>> $logPath
        if ($LASTEXITCODE -ne 0) {
            Write-DeployLog "FALHOU: npm run build. Servico continua PARADO."
            Invoke-Notificacao -Status "falhou" -Detalhe "Build falhou no commit $commitDepois. Site FORA DO AR ate correcao manual (veja 'Corrigir build corrompido' na opcao 12)."
            Write-Audit -AcaoNome "DeployAutomatico" -Detalhe "FALHOU: build ($commitDepois)"
            return
        }

        $backupOk = Invoke-Backup
        if (-not $backupOk) {
            Write-DeployLog "FALHOU: backup pre-migration. Abortado por seguranca. Servico continua PARADO."
            Invoke-Notificacao -Status "falhou" -Detalhe "Backup pre-migration falhou no commit $commitDepois. Deploy abortado por seguranca - servico PARADO."
            Write-Audit -AcaoNome "DeployAutomatico" -Detalhe "FALHOU: backup ($commitDepois)"
            return
        }

        npx prisma migrate deploy *>> $logPath
        if ($LASTEXITCODE -ne 0) {
            Write-DeployLog "FALHOU: migration. Servico continua PARADO."
            Invoke-Notificacao -Status "falhou" -Detalhe "Migration falhou no commit $commitDepois. Avalie restaurar o backup. Servico PARADO - URGENTE."
            Write-Audit -AcaoNome "DeployAutomatico" -Detalhe "FALHOU: migration ($commitDepois)"
            return
        }

        Start-Service -Name "SenaHub"
        Start-Sleep -Seconds 8
        Invoke-Status *>> $logPath

        $duracaoMin = [math]::Round(((Get-Date) - $inicio).TotalMinutes, 1)
        Write-DeployLog "OK: deploy automatico concluido ($commitAntes -> $commitDepois, $duracaoMin min)."
        Invoke-Notificacao -Status "ok" -Detalhe "Deploy automatico concluido: $commitAntes -> $commitDepois ($duracaoMin min)."
        Write-Audit -AcaoNome "DeployAutomatico" -Detalhe "OK ($commitDepois, $duracaoMin min)"
    } catch {
        Write-DeployLog "ERRO NAO TRATADO: $($_.Exception.Message)"
        Invoke-Notificacao -Status "falhou" -Detalhe "Erro inesperado no deploy automatico: $($_.Exception.Message)"
        Write-Audit -AcaoNome "DeployAutomatico" -Detalhe "ERRO NAO TRATADO"
    } finally {
        Pop-Location
    }
}

function Invoke-Migrations {
    Push-Location $AppRoot
    try {
        Write-Host ""
        Write-Host "ATENCAO: nunca use 'migrate dev' em producao. Isto roda 'migrate deploy' (so aplica migrations ja commitadas)." -ForegroundColor Yellow
        npx prisma migrate deploy
        Write-Audit -AcaoNome "MigrationsOnly" -Detalhe "exit=$LASTEXITCODE"
    } finally {
        Pop-Location
    }
}

function Invoke-ReaplicarSeed {
    Push-Location $AppRoot
    try {
        npm run db:seed
        Write-Audit -AcaoNome "ReaplicarSeed" -Detalhe "exit=$LASTEXITCODE"
    } finally {
        Pop-Location
    }
}

function Invoke-ResetAdminSenha {
    Write-Host ""
    Write-Host "Isso vai resetar a senha do admin (tadrio@senaprojetos.com.br) para a senha padrao" -ForegroundColor Yellow
    Write-Host "conhecida do sistema, forcando a troca no proximo login." -ForegroundColor Yellow
    if (-not (Confirm-Typed -Palavra "CONFIRMAR")) {
        Write-Host "Cancelado." -ForegroundColor Yellow
        return
    }
    Push-Location $AppRoot
    try {
        npm run admin:reset-senha
        Write-Audit -AcaoNome "ResetAdminSenha" -Detalhe "exit=$LASTEXITCODE"
    } finally {
        Pop-Location
    }
}

function Invoke-VerAuditoria {
    Write-Host ""
    if (Test-Path $AuditLogPath) {
        Get-Content $AuditLogPath -Tail 50 -Encoding UTF8
    } else {
        Write-Host "(nenhum registro de auditoria ainda)"
    }
}

function Invoke-ForcarEncerramento {
    param([string]$Servico)
    if (-not (Assert-Admin)) { return }
    if (-not $Servico) { $Servico = "SenaHub" }
    $svc = Get-CimInstance Win32_Service -Filter "Name='$Servico'" -ErrorAction SilentlyContinue
    if (-not $svc) {
        Write-Host "[ERRO] Servico $Servico nao encontrado." -ForegroundColor Red
        return
    }
    Write-Host ""
    Write-Host ("Servico: {0}  Estado: {1}  PID: {2}" -f $Servico, $svc.State, $svc.ProcessId) -ForegroundColor Cyan
    if (-not $svc.ProcessId -or $svc.ProcessId -eq 0) {
        Write-Host "Nenhum processo ativo para encerrar." -ForegroundColor Yellow
        return
    }
    Write-Host ("Isso vai FORCAR o encerramento do processo PID {0}." -f $svc.ProcessId) -ForegroundColor Yellow
    if (-not (Confirm-Typed -Palavra "CONFIRMAR")) {
        Write-Host "Cancelado." -ForegroundColor Yellow
        return
    }
    Stop-Process -Id $svc.ProcessId -Force
    Start-Sleep -Seconds 2
    Write-Host "Processo encerrado. Tente iniciar o servico novamente pelo menu." -ForegroundColor Green
    Write-Audit -AcaoNome "ForcarEncerramento" -Detalhe "$Servico PID=$($svc.ProcessId)"
}

function Invoke-ProcessosPortas {
    Write-Host ""
    Write-Host "---- Processos node / cloudflared / postgres ----" -ForegroundColor Cyan
    Get-Process -Name "node", "cloudflared", "postgres" -ErrorAction SilentlyContinue |
        Select-Object Id, ProcessName, StartTime | Format-Table -AutoSize | Out-String | Write-Host

    Write-Host "---- Porta 3000 ----" -ForegroundColor Cyan
    Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
        Select-Object LocalAddress, LocalPort, State, OwningProcess | Format-Table -AutoSize | Out-String | Write-Host

    Write-Host "---- Porta 5432 ----" -ForegroundColor Cyan
    Get-NetTCPConnection -LocalPort 5432 -ErrorAction SilentlyContinue |
        Select-Object LocalAddress, LocalPort, State, OwningProcess | Format-Table -AutoSize | Out-String | Write-Host
}

function Invoke-CorrigirNext {
    if (-not (Assert-Admin)) { return }
    Write-Host ""
    Write-Host "Isso vai parar o SenaHub, apagar a pasta .next e reconstruir o build." -ForegroundColor Yellow
    Write-Host "O site fica fora do ar durante o processo (alguns minutos)." -ForegroundColor Yellow
    if (-not (Confirm-Typed -Palavra "CONFIRMAR")) {
        Write-Host "Cancelado." -ForegroundColor Yellow
        return
    }
    Push-Location $AppRoot
    try {
        Stop-Service -Name "SenaHub" -Force
        $nextDir = Join-Path $AppRoot ".next"
        if (Test-Path $nextDir) { Remove-Item -Recurse -Force $nextDir }
        npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERRO] Build falhou - servico continua parado, corrija o erro antes de iniciar." -ForegroundColor Red
            return
        }
        Start-Service -Name "SenaHub"
        Start-Sleep -Seconds 8
        Invoke-Status
        Write-Audit -AcaoNome "CorrigirNext" -Detalhe "OK"
    } finally {
        Pop-Location
    }
}

function Invoke-Reboot {
    if (-not (Assert-Admin)) { return }
    Write-Host ""
    Write-Host "Isso vai REINICIAR O WINDOWS deste servidor em 60 segundos." -ForegroundColor Red
    Write-Host "Todos os servicos (SenaHub, cloudflared, Postgres) sobem sozinhos depois (inicio automatico)." -ForegroundColor Yellow
    if (-not (Confirm-Typed -Palavra "REINICIAR")) {
        Write-Host "Cancelado." -ForegroundColor Yellow
        return
    }
    Write-Audit -AcaoNome "Reboot" -Detalhe "agendado (60s)"
    shutdown /r /t 60 /c "Reinicio agendado via menu SenaHub"
    Write-Host ""
    Write-Host "Reinicio agendado. Para cancelar nos proximos 60s, rode: shutdown /a" -ForegroundColor Yellow
}

# ======================== DISPATCH ========================

switch ($Acao) {
    "Audit"              { Write-Audit -AcaoNome $Sub -Detalhe "via bat" }
    "Status"             { Invoke-Status }
    "LogsSenaHub"        { Invoke-TailLog -Nome "SenaHub" }
    "LogsCloudflared"    { Invoke-TailLog -Nome "Cloudflared" }
    "CrashLoop"          { Invoke-CrashLoopCheck }
    "Diagnostico"        { Invoke-Diagnostico -Tipo $Sub }
    "Backup"             { Invoke-Backup | Out-Null }
    "ListarBackups"      { Invoke-ListarBackups }
    "DeployCompleto"     { Invoke-DeployCompleto }
    "DeployAutomatico"   { Invoke-DeployAutomatico }
    "SmokeTests"         { Invoke-SmokeTests }
    "Migrations"         { Invoke-Migrations }
    "ReaplicarSeed"      { Invoke-ReaplicarSeed }
    "ResetAdminSenha"    { Invoke-ResetAdminSenha }
    "VerAuditoria"       { Invoke-VerAuditoria }
    "ForcarEncerramento" { Invoke-ForcarEncerramento -Servico $Sub }
    "ProcessosPortas"    { Invoke-ProcessosPortas }
    "CorrigirNext"       { Invoke-CorrigirNext }
    "Reboot"             { Invoke-Reboot }
    default {
        Write-Host "Acao desconhecida: $Acao" -ForegroundColor Red
    }
}
