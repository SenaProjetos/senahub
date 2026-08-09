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
        "DWG" {
            # A conversao DWG->DXF chama o ODA File Converter (exe externo) num child process,
            # disparado por job pg-boss dentro do server.ts. Tres causas possiveis, nessa ordem.
            $oda = Get-EnvValue -Key "ODA_CONVERTER_PATH"
            Write-Host ""
            Write-Host "Verificando ODA_CONVERTER_PATH: $oda" -ForegroundColor Cyan
            if (-not $oda) {
                Write-Host "[FALHA] ODA_CONVERTER_PATH nao esta no .env - essa e a causa provavel." -ForegroundColor Red
                Write-Host "        Instale o ODA File Converter e aponte o .env pro exe (docs/DEPLOY.md secao 4.1)." -ForegroundColor Yellow
            } elseif (-not (Test-Path $oda)) {
                Write-Host "[FALHA] O exe nao existe nesse caminho - essa e a causa provavel." -ForegroundColor Red
            } else {
                Write-Host "[OK] ODA File Converter encontrado." -ForegroundColor Green
            }

            $svc = Get-Service -Name "SenaHub" -ErrorAction SilentlyContinue
            if ($svc -and $svc.Status -eq "Running") {
                Write-Host "[OK] Servico SenaHub rodando (o worker pg-boss que converte vive nele)." -ForegroundColor Green
            } else {
                Write-Host "[FALHA] Servico SenaHub parado - sem worker, o DWG fica preso em 'na fila'." -ForegroundColor Red
            }

            $storage = Get-EnvValue -Key "STORAGE_BASE_PATH"
            if ($storage -and (Test-Path $storage)) {
                Write-Host "[OK] STORAGE_BASE_PATH existe (origem do .dwg e destino do .dxf)." -ForegroundColor Green
            } else {
                Write-Host "[FALHA] STORAGE_BASE_PATH invalido: $storage" -ForegroundColor Red
            }

            Write-Host ""
            Write-Host "Se tudo acima esta OK mas a conversao falha com 'nao gerou o arquivo de saida'," -ForegroundColor Yellow
            Write-Host "o ODA (app Qt) esta sem sessao grafica no servico - ver docs/DEPLOY.md secao 4.1." -ForegroundColor Yellow
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
        # pg_dump com -f nao escreve nada no stdout, entao o valor de retorno da funcao fica
        # sendo so o $true/$false (ao contrario do robocopy - ver Invoke-BackupStorage).
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

# Espelho dos arquivos (STORAGE_BASE_PATH). O dump do Postgres NAO cobre upload nenhum:
# restaurar so o banco deixa todo Upload apontando para caminho inexistente.
function Get-DestinoStorageBackup {
    $explicito = Get-EnvValue -Key "STORAGE_BACKUP_PATH"
    if ($explicito) { return $explicito }
    $backupPath = Get-EnvValue -Key "BACKUP_PATH"
    if (-not $backupPath) { return $null }
    return (Join-Path $backupPath "storage")
}

function Invoke-BackupStorage {
    $origem = Get-EnvValue -Key "STORAGE_BASE_PATH"
    $destino = Get-DestinoStorageBackup

    if (-not $origem -or -not (Test-Path $origem)) {
        Write-Host "[ERRO] STORAGE_BASE_PATH invalido ou nao definido no .env." -ForegroundColor Red
        return $false
    }
    if (-not $destino) {
        Write-Host "[ERRO] Defina BACKUP_PATH (ou STORAGE_BACKUP_PATH) no .env." -ForegroundColor Red
        return $false
    }
    # Destino DENTRO da origem faria o espelho copiar a si mesmo indefinidamente. Guarda ANTES
    # de criar a pasta (senao ja teriamos sujado o storage) e por isso via GetFullPath, que nao
    # exige que o caminho exista. Mesma regra de destinoDentroDaOrigem em lib/backup-storage.ts.
    $oResolvido = (Resolve-Path $origem).Path.TrimEnd('\')
    $dResolvido = [System.IO.Path]::GetFullPath($destino).TrimEnd('\')
    if ($dResolvido -eq $oResolvido -or $dResolvido.StartsWith($oResolvido + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        Write-Host "[ERRO] Destino ($dResolvido) esta dentro de STORAGE_BASE_PATH - escolha outra pasta." -ForegroundColor Red
        return $false
    }

    if (-not (Test-Path $destino)) { New-Item -ItemType Directory -Force -Path $destino | Out-Null }

    if ((Split-Path $origem -Qualifier) -eq (Split-Path $destino -Qualifier)) {
        Write-Host "[ATENCAO] Origem e destino estao no MESMO disco - isso nao protege contra perda de disco." -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "Espelhando arquivos:" -ForegroundColor Cyan
    Write-Host "  de:   $origem"
    Write-Host "  para: $destino"
    Write-Host "(espelho aditivo: copia o que mudou, nunca apaga no destino)" -ForegroundColor DarkGray
    Write-Host ""

    # /E subpastas, /XO nao regrava o que ja esta mais novo no destino. SEM /MIR de proposito.
    # | Out-Host: o robocopy imprime o resumo no STDOUT; sem isso ele vaza para o valor de
    # retorno e "$b = Invoke-BackupStorage" vira @('texto', $true) - sempre truthy, mesmo em
    # falha (mesma pegadinha ja documentada em Invoke-Passo no gerenciar-dev.ps1).
    robocopy $origem $destino /E /XO /DCOPY:DAT /R:1 /W:5 /NFL /NDL /NP | Out-Host
    $rc = $LASTEXITCODE

    # PEGADINHA: robocopy usa o exit code como bitmask - 1 = copiou arquivos, 3 = copiou + extras.
    # Sucesso e < 8. Tratar "-ne 0" como erro marcaria como falha justo o backup que copiou algo.
    if ($rc -lt 8) {
        # Sem isso o $LASTEXITCODE do robocopy (1 = copiou) vaza como exit code do script e
        # qualquer chamador que teste errorlevel leria um backup bem-sucedido como falha.
        $global:LASTEXITCODE = 0
        $tam = 0
        try { $tam = [math]::Round(((Get-ChildItem $destino -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum / 1GB), 2) } catch {}
        Write-Host ""
        Write-Host "[OK] Espelho atualizado (robocopy $rc). Total no destino: $tam GB" -ForegroundColor Green
        Write-Audit -AcaoNome "BackupStorage" -Detalhe "$destino (rc=$rc, $tam GB)"
        return $true
    } else {
        Write-Host ""
        Write-Host "[ERRO] robocopy falhou (codigo $rc). 8 = falha de copia, 16 = origem/destino inacessivel." -ForegroundColor Red
        Write-Audit -AcaoNome "BackupStorage" -Detalhe "FALHOU (rc=$rc)"
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
    # .backup = backup manual e job atual; .dump = job das versoes antigas do lib/backup.ts.
    $arquivos = Get-ChildItem -Path $backupPath -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -in ".backup", ".dump" } |
        Sort-Object LastWriteTime -Descending
    if (-not $arquivos -or $arquivos.Count -eq 0) {
        Write-Host "[FALHA] Nenhum backup de banco encontrado em $backupPath" -ForegroundColor Red
    } else {
        Write-Host "Backups do BANCO em $backupPath :" -ForegroundColor Cyan
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

    Write-Host ""
    $destinoStorage = Get-DestinoStorageBackup
    if (-not $destinoStorage -or -not (Test-Path $destinoStorage)) {
        Write-Host "[ATENCAO] Nenhum espelho dos ARQUIVOS encontrado. O dump do banco sozinho NAO" -ForegroundColor Yellow
        Write-Host "          restaura os uploads - use a opcao de backup dos arquivos." -ForegroundColor Yellow
    } else {
        $ultima = (Get-ChildItem $destinoStorage -Recurse -File -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1)
        Write-Host "Espelho dos ARQUIVOS em $destinoStorage :" -ForegroundColor Cyan
        if ($ultima) {
            Write-Host ("  arquivo mais recente no espelho: {0}" -f $ultima.LastWriteTime)
        } else {
            Write-Host "  [ATENCAO] Pasta existe mas esta vazia." -ForegroundColor Yellow
        }
    }
}

# ---- RESTAURACAO (destrutivo) -------------------------------------------------
# Ordem: valida o dump -> para o SenaHub -> copia de seguranca -> DROP/CREATE ->
# pg_restore -> migrate deploy -> sobe o servico. A logica pesada mora no script TS
# (scripts/restaurar-backup.ts); aqui so orquestramos servico + confirmacao.
function Invoke-RestaurarBackup {
    if (-not (Assert-Admin)) { return }

    # -Confirmar existe para GUI/automacao pular perguntas. Restauracao NAO aceita isso:
    # um clique de botao nao pode derrubar o banco de producao.
    if ($Confirmar) {
        Write-Host ""
        Write-Host "[ERRO] Restauracao nao pode ser disparada de forma automatizada (-Confirmar)." -ForegroundColor Red
        Write-Host "       Abra o menu no console do servidor e faca a confirmacao digitada." -ForegroundColor Red
        Write-Audit -AcaoNome "RestaurarBackup" -Detalhe "RECUSADO: chamado com -Confirmar"
        return
    }

    $backupPath = Get-EnvValue -Key "BACKUP_PATH"
    $arquivo = $Sub
    if (-not $arquivo) {
        Invoke-ListarBackups
        Write-Host ""
        Write-Host "Informe o NOME do arquivo (ou o caminho completo):" -ForegroundColor Yellow
        $arquivo = (Read-Host ">").Trim().Trim('"')
    }
    if (-not $arquivo) { Write-Host "Cancelado." -ForegroundColor Yellow; return }
    if (-not (Test-Path $arquivo)) {
        if ($backupPath) { $arquivo = Join-Path $backupPath $arquivo }
    }
    if (-not (Test-Path $arquivo)) {
        Write-Host "[ERRO] Arquivo nao encontrado: $arquivo" -ForegroundColor Red
        return
    }
    $arquivo = (Resolve-Path $arquivo).Path

    Write-Host ""
    Write-Host "==================== RESTAURAR BACKUP ====================" -ForegroundColor Red
    Write-Host " Isso APAGA o banco de PRODUCAO e o substitui por:" -ForegroundColor Red
    Write-Host "   $arquivo" -ForegroundColor Yellow
    Write-Host " Tudo que entrou no sistema depois desse backup SERA PERDIDO." -ForegroundColor Red
    Write-Host " O SenaHub fica FORA DO AR durante a restauracao." -ForegroundColor Yellow
    Write-Host " Os ARQUIVOS (uploads) nao vem no dump - se voce tambem precisa" -ForegroundColor Yellow
    Write-Host " voltar arquivos, use a restauracao de arquivos depois." -ForegroundColor Yellow
    Write-Host " Uma copia de seguranca do estado ATUAL e gerada antes de apagar." -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Red

    if (-not (Confirm-Typed -Palavra "RESTAURAR")) {
        Write-Host "Cancelado." -ForegroundColor Yellow
        Write-Audit -AcaoNome "RestaurarBackup" -Detalhe "cancelado na confirmacao"
        return
    }

    Write-Audit -AcaoNome "RestaurarBackup" -Detalhe "INICIADO: $arquivo"

    Write-Host ""
    Write-Host "---- Parando o SenaHub (o pg-boss reconecta e impede o DROP) ----" -ForegroundColor Cyan
    Stop-Service SenaHub -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3

    Push-Location $AppRoot
    $ok = $false
    try {
        # --confirmado: a confirmacao digitada ja foi feita acima; nao perguntar duas vezes.
        & npx tsx --tsconfig tsconfig.server.json scripts/restaurar-backup.ts "$arquivo" --confirmado
        $ok = ($LASTEXITCODE -eq 0)

        if ($ok) {
            Write-Host ""
            Write-Host "---- Aplicando migrations pendentes ----" -ForegroundColor Cyan
            npx prisma migrate deploy
            if ($LASTEXITCODE -ne 0) {
                Write-Host "[ATENCAO] migrate deploy falhou. NAO suba o servico antes de resolver." -ForegroundColor Red
                $ok = $false
            }
        }
    } finally {
        Pop-Location
    }

    if ($ok) {
        Write-Host ""
        Write-Host "---- Subindo o SenaHub ----" -ForegroundColor Cyan
        Start-Service SenaHub -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 5
        Write-Host "[OK] Restauracao concluida. Confira o login e uma tela de cada modulo." -ForegroundColor Green
        Write-Audit -AcaoNome "RestaurarBackup" -Detalhe "OK: $arquivo"
    } else {
        Write-Host ""
        Write-Host "[ERRO] Restauracao NAO concluiu. O SenaHub continua PARADO de proposito." -ForegroundColor Red
        Write-Host "       Leia a saida acima: o caminho da copia de seguranca do estado" -ForegroundColor Red
        Write-Host "       anterior foi impresso pelo script e e o caminho de volta." -ForegroundColor Red
        Write-Audit -AcaoNome "RestaurarBackup" -Detalhe "FALHOU: $arquivo"
    }
}

function Invoke-RestaurarStorage {
    if (-not (Assert-Admin)) { return }
    if ($Confirmar) {
        Write-Host ""
        Write-Host "[ERRO] Restauracao de arquivos nao pode ser automatizada (-Confirmar)." -ForegroundColor Red
        Write-Audit -AcaoNome "RestaurarStorage" -Detalhe "RECUSADO: chamado com -Confirmar"
        return
    }

    $destino = Get-EnvValue -Key "STORAGE_BASE_PATH"   # na volta, a origem e o espelho
    $espelho = Get-DestinoStorageBackup

    if (-not $espelho -or -not (Test-Path $espelho)) {
        Write-Host "[ERRO] Espelho de arquivos nao encontrado: $espelho" -ForegroundColor Red
        return
    }
    if (-not $destino) {
        Write-Host "[ERRO] STORAGE_BASE_PATH nao definido no .env." -ForegroundColor Red
        return
    }
    if (-not (Test-Path $destino)) { New-Item -ItemType Directory -Force -Path $destino | Out-Null }

    Write-Host ""
    Write-Host "=============== RESTAURAR ARQUIVOS (uploads) ===============" -ForegroundColor Red
    Write-Host "  do espelho: $espelho" -ForegroundColor Yellow
    Write-Host "  para:       $destino" -ForegroundColor Yellow
    Write-Host " Arquivos com o MESMO nome sao sobrescritos pela versao do espelho." -ForegroundColor Red
    Write-Host " Arquivos que so existem no destino sao MANTIDOS (copia aditiva)." -ForegroundColor Cyan
    Write-Host " O SenaHub e parado durante a copia." -ForegroundColor Yellow
    Write-Host "============================================================" -ForegroundColor Red

    if (-not (Confirm-Typed -Palavra "RESTAURAR")) {
        Write-Host "Cancelado." -ForegroundColor Yellow
        return
    }

    Write-Audit -AcaoNome "RestaurarStorage" -Detalhe "INICIADO: $espelho -> $destino"
    Stop-Service SenaHub -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3

    robocopy $espelho $destino /E /DCOPY:DAT /R:1 /W:5 /NFL /NDL /NP | Out-Host
    $rc = $LASTEXITCODE

    Start-Service SenaHub -ErrorAction SilentlyContinue

    if ($rc -lt 8) {
        $global:LASTEXITCODE = 0
        Write-Host ""
        Write-Host "[OK] Arquivos restaurados (robocopy $rc). SenaHub religado." -ForegroundColor Green
        Write-Audit -AcaoNome "RestaurarStorage" -Detalhe "OK (rc=$rc)"
    } else {
        Write-Host ""
        Write-Host "[ERRO] robocopy falhou (codigo $rc)." -ForegroundColor Red
        Write-Audit -AcaoNome "RestaurarStorage" -Detalhe "FALHOU (rc=$rc)"
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
            if ($Confirmar) {
                Write-Host "[ERRO] Backup falhou. Chamado com -Confirmar (GUI/automatizado) - abortando por seguranca, NAO prossegue com migration sem backup. O SenaHub continua PARADO." -ForegroundColor Red
                Write-Audit -AcaoNome "DeployCompleto" -Detalhe "ABORTADO: backup falhou com -Confirmar"
                return
            }
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
        Write-Host "---- db:seed (permissoes + catalogos; idempotente) ----" -ForegroundColor Cyan
        npm run db:seed
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[AVISO] Seed falhou. O servico VAI SUBIR mesmo assim, mas permissoes/catalogos novos podem faltar (ex.: erro 'Sem permissao para enviar arquivos'). Reaplique pela opcao 'Reaplicar seed'." -ForegroundColor Yellow
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

        # Seed idempotente: garante permissoes/catalogos novos (ex.: `arquivos:enviar`).
        # NAO bloqueia o deploy - se falhar, o servico sobe mesmo assim (so avisa).
        npm run db:seed *>> $logPath
        if ($LASTEXITCODE -ne 0) {
            Write-DeployLog "AVISO: db:seed falhou (nao bloqueia). Permissoes/catalogos novos podem faltar ate reaplicar o seed."
            Invoke-Notificacao -Status "falhou" -Detalhe "db:seed falhou no commit $commitDepois. Servico VAI SUBIR, mas permissoes/catalogos novos podem faltar (ex.: erro 'Sem permissao para enviar arquivos'). Reaplique o seed manualmente (menu -> Reaplicar seed)."
            Write-Audit -AcaoNome "DeployAutomatico" -Detalhe "AVISO: seed falhou ($commitDepois)"
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

function Invoke-IniciarTodos {
    if (-not (Assert-Admin)) { return }
    Write-Host ""
    Write-Host "Iniciando servicos (Postgres -> SenaHub -> cloudflared)..." -ForegroundColor Cyan
    try {
        Start-Service -Name "postgresql-x64-17"
        Start-Service -Name "SenaHub"
        Start-Service -Name "cloudflared"
        Write-Host "[OK] Servicos iniciados." -ForegroundColor Green
        Write-Audit -AcaoNome "IniciarTodos" -Detalhe "OK"
    } catch {
        Write-Host "[ERRO] Falha ao iniciar servicos: $($_.Exception.Message)" -ForegroundColor Red
        Write-Audit -AcaoNome "IniciarTodos" -Detalhe "FALHOU: $($_.Exception.Message)"
        throw
    }
}

function Invoke-PararTodos {
    if (-not (Assert-Admin)) { return }
    Write-Host ""
    Write-Host "Isso vai TIRAR O SITE DO AR." -ForegroundColor Yellow
    if (-not (Confirm-Typed -Palavra "PARAR")) {
        Write-Host "Cancelado." -ForegroundColor Yellow
        return
    }
    Write-Host ""
    Write-Host "Parando servicos (cloudflared -> SenaHub -> Postgres)..." -ForegroundColor Cyan
    try {
        Stop-Service -Name "cloudflared" -ErrorAction SilentlyContinue
        Stop-Service -Name "SenaHub" -ErrorAction SilentlyContinue
        Stop-Service -Name "postgresql-x64-17" -ErrorAction SilentlyContinue
        Write-Host "[OK] Servicos parados." -ForegroundColor Green
        Write-Audit -AcaoNome "PararTodos" -Detalhe "OK"
    } catch {
        Write-Host "[ERRO] Falha ao parar servicos: $($_.Exception.Message)" -ForegroundColor Red
        Write-Audit -AcaoNome "PararTodos" -Detalhe "FALHOU: $($_.Exception.Message)"
        throw
    }
}

function Invoke-ReiniciarApp {
    if (-not (Assert-Admin)) { return }
    Write-Host ""
    Write-Host "Isso vai desconectar os usuarios conectados por alguns segundos." -ForegroundColor Yellow
    if (-not (Confirm-Typed -Palavra "REINICIAR")) {
        Write-Host "Cancelado." -ForegroundColor Yellow
        return
    }
    Write-Host ""
    Write-Host "Reiniciando SenaHub..." -ForegroundColor Cyan
    try {
        Restart-Service -Name "SenaHub" -Force
        Write-Host "[OK] SenaHub reiniciado." -ForegroundColor Green
        Write-Audit -AcaoNome "ReiniciarApp" -Detalhe "OK"
    } catch {
        Write-Host "[ERRO] Falha ao reiniciar SenaHub: $($_.Exception.Message)" -ForegroundColor Red
        Write-Audit -AcaoNome "ReiniciarApp" -Detalhe "FALHOU: $($_.Exception.Message)"
        throw
    }
}

function Invoke-ReiniciarTunel {
    if (-not (Assert-Admin)) { return }
    Write-Host ""
    Write-Host "Reiniciando cloudflared..." -ForegroundColor Cyan
    try {
        Restart-Service -Name "cloudflared" -Force
        Write-Host "[OK] Tunel reiniciado." -ForegroundColor Green
        Write-Audit -AcaoNome "ReiniciarTunel" -Detalhe "OK"
    } catch {
        Write-Host "[ERRO] Falha ao reiniciar tunel: $($_.Exception.Message)" -ForegroundColor Red
        Write-Audit -AcaoNome "ReiniciarTunel" -Detalhe "FALHOU: $($_.Exception.Message)"
        throw
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
    "BackupStorage"      { Invoke-BackupStorage | Out-Null }
    "BackupTudo"         { $a = Invoke-Backup; $b = Invoke-BackupStorage; if (-not ($a -and $b)) { Write-Host "`n[ATENCAO] Algum dos dois backups falhou - veja acima." -ForegroundColor Red } }
    "ListarBackups"      { Invoke-ListarBackups }
    "RestaurarBackup"    { Invoke-RestaurarBackup }
    "RestaurarStorage"   { Invoke-RestaurarStorage }
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
    "IniciarTodos"       { Invoke-IniciarTodos }
    "PararTodos"         { Invoke-PararTodos }
    "ReiniciarApp"       { Invoke-ReiniciarApp }
    "ReiniciarTunel"     { Invoke-ReiniciarTunel }
    default {
        Write-Host "Acao desconhecida: $Acao" -ForegroundColor Red
    }
}
