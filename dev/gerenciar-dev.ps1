#requires -Version 5.1
<#
.SYNOPSIS
  Funcoes de apoio da Central do Desenvolvedor (chamado por gerenciar-dev.bat).
.DESCRIPTION
  Lado DEV: rodar dev server, verificar antes do push (lint+test+build), promover
  dev -> producao (merge direto OU via PR), banco de dados de dev, smokes, release
  e diagnostico. Nada destrutivo roda sem confirmacao. Texto em pt-BR SEM acentos
  (mesma convencao do deploy/gerenciar-servidor.ps1) para evitar problemas de
  encoding no PowerShell 5.1 / console do Windows.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Acao,
    [string]$Sub = "",
    [switch]$Confirmar,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

# Raiz do projeto = pasta-pai deste script (dev/ -> app root).
$AppRoot = Split-Path -Parent $PSScriptRoot
$LogsDir = Join-Path $AppRoot "logs"
$AuditLogPath = Join-Path $LogsDir "dev-audit.log"
$VerificacaoLog = Join-Path $LogsDir "dev-verificacao.log"
$RepoWeb = "https://github.com/SenaProjetos/senahub"

if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null
}

# ======================== FUNCOES DE APOIO ========================

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

# Confirmacao por palavra digitada (destrutivo). Bypass com -Confirmar (uso automatizado).
function Confirm-Typed {
    param([string]$Palavra = "CONFIRMAR")
    if ($Confirmar) { return $true }
    Write-Host ""
    Write-Host "Digite '$Palavra' para confirmar (qualquer outra coisa cancela):" -ForegroundColor Yellow
    $resp = Read-Host ">"
    return ($resp -eq $Palavra)
}

# Confirmacao simples S/N. Bypass com -Confirmar.
function Confirm-SN {
    param([string]$Pergunta)
    if ($Confirmar) { return $true }
    $r = Read-Host ("{0}? (S/N)" -f $Pergunta)
    return ($r -match '^[Ss]')
}

# Banco de dev geralmente nao tem PG_DUMP_PATH; esta funcao so vale se tiver psql.
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

function Test-DevServerRodando {
    try {
        $c = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
        return [bool]$c
    } catch { return $false }
}

# Mata o processo que escuta na :3000 e o servico esbuild (que trava node_modules).
function Stop-DevServer {
    Write-Host "Parando dev server (porta 3000) e esbuild..." -ForegroundColor Cyan
    $encontrou = $false
    try {
        $conns = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
        $procIds = $conns | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($procId in $procIds) {
            if ($procId -and $procId -ne 0) {
                try { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue; $encontrou = $true } catch {}
            }
        }
    } catch {}
    # So mata os esbuild DESTE projeto (exe fica em node_modules do AppRoot) - nao os de outros projetos.
    # foreach statement (nao ForEach-Object) para o $encontrou ser atualizado no escopo da funcao.
    $esbuilds = Get-CimInstance Win32_Process -Filter "Name='esbuild.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($AppRoot, [System.StringComparison]::OrdinalIgnoreCase) }
    foreach ($esb in $esbuilds) {
        try { Stop-Process -Id $esb.ProcessId -Force -ErrorAction SilentlyContinue; $encontrou = $true } catch {}
    }
    Start-Sleep -Seconds 1
    if ($encontrou) { Write-Host "[OK] Dev server encerrado." -ForegroundColor Green }
    else { Write-Host "[OK] Nenhum dev server rodando na :3000." -ForegroundColor Green }
}

# Executa um passo respeitando -DryRun. Retorna o exit code do comando (0 no dry-run).
function Invoke-Passo {
    param([string]$Descricao, [scriptblock]$Bloco)
    if ($DryRun) {
        Write-Host "  [dry-run] $Descricao" -ForegroundColor DarkGray
        return 0
    }
    Write-Host ""
    Write-Host "-> $Descricao" -ForegroundColor Cyan
    # | Out-Host: manda o stdout do comando para o console em vez de deixar vazar para o
    # valor de retorno da funcao (que assim fica sendo SO o int do exit code). Sem isso,
    # git pull/merge/push imprimem no stdout e "$rc = Invoke-Passo" virava @('texto', 0),
    # fazendo "$rc -ne 0" dar truthy e abortar a promocao mesmo com exit 0.
    & $Bloco | Out-Host
    return $LASTEXITCODE
}

# Teste de porta rapido (TcpClient + timeout) - Test-NetConnection trava alguns segundos quando fechada.
function Test-Porta {
    param([string]$Alvo = "127.0.0.1", [int]$Porta, [int]$TimeoutMs = 1000)
    $cliente = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $cliente.BeginConnect($Alvo, $Porta, $null, $null)
        if ($iar.AsyncWaitHandle.WaitOne($TimeoutMs)) {
            $cliente.EndConnect($iar)
            return $true
        }
        return $false
    } catch {
        return $false
    } finally {
        $cliente.Close()
    }
}

# ======================== DESENVOLVIMENTO ========================

function Invoke-DevNext {
    Write-Host ""
    Write-Host "[AVISO] Modo 'Next so': chat, realtime e jobs (pg-boss) NAO funcionam." -ForegroundColor Yellow
    Write-Host "        Para chat/jobs use a opcao 'Iniciar dev completo'." -ForegroundColor Yellow
    Write-Host "Abrindo o dev server (Next) em nova janela..." -ForegroundColor Cyan
    Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "npm run dev" -WorkingDirectory $AppRoot
    Write-Host "[OK] Janela aberta. Feche-a (Ctrl+C) para parar o dev." -ForegroundColor Green
}

function Invoke-DevServer {
    if (Test-DevServerRodando) {
        Write-Host "[ATENCAO] Ja existe algo escutando na porta 3000." -ForegroundColor Yellow
        if (Confirm-SN "Parar o processo atual antes de iniciar") { Stop-DevServer } else { Write-Host "Abortado." -ForegroundColor Yellow; return }
    }
    Write-Host "Abrindo o dev server COMPLETO (Next + Socket.io + pg-boss) em nova janela..." -ForegroundColor Cyan
    Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "npm run dev:server" -WorkingDirectory $AppRoot
    Write-Host "[OK] Janela aberta. Feche-a (Ctrl+C) para parar o dev." -ForegroundColor Green
}

function Invoke-PararDev {
    Stop-DevServer
    Write-Audit -AcaoNome "PararDev" -Detalhe "OK"
}

# ======================== QUALIDADE ========================

# Verificacao completa. Retorna $true/$false (Promover usa esse booleano).
function Invoke-Verificar {
    if (Test-DevServerRodando) {
        Write-Host ""
        Write-Host "[ATENCAO] Dev server rodando na porta 3000." -ForegroundColor Yellow
        Write-Host "Rodar 'next build' agora pode corromper o .next em uso pelo dev server." -ForegroundColor Yellow
        if (Confirm-SN "Parar o dev server e continuar") { Stop-DevServer }
        else { Write-Host "[ERRO] Verificacao abortada (dev server ativo)." -ForegroundColor Red; return $false }
    }
    Push-Location $AppRoot
    try {
        if (Test-Path $VerificacaoLog) { Remove-Item $VerificacaoLog -ErrorAction SilentlyContinue }

        Write-Host ""
        Write-Host "==================== VERIFICACAO (1/3 LINT) ====================" -ForegroundColor Cyan
        npm run lint 2>&1 | Tee-Object -FilePath $VerificacaoLog | Out-Host
        if ($LASTEXITCODE -ne 0) { Write-Host "[FALHOU] Lint. Corrija os erros acima (log: $VerificacaoLog)." -ForegroundColor Red; return $false }
        Write-Host "[OK] Lint" -ForegroundColor Green

        Write-Host ""
        Write-Host "==================== VERIFICACAO (2/3 TESTES) =================" -ForegroundColor Cyan
        npm test 2>&1 | Tee-Object -FilePath $VerificacaoLog -Append | Out-Host
        if ($LASTEXITCODE -ne 0) { Write-Host "[FALHOU] Testes falharam (log: $VerificacaoLog)." -ForegroundColor Red; return $false }
        Write-Host "[OK] Testes" -ForegroundColor Green

        Write-Host ""
        Write-Host "==================== VERIFICACAO (3/3 BUILD) ==================" -ForegroundColor Cyan
        npm run build 2>&1 | Tee-Object -FilePath $VerificacaoLog -Append | Out-Host
        if ($LASTEXITCODE -ne 0) { Write-Host "[FALHOU] Build falhou (log: $VerificacaoLog)." -ForegroundColor Red; return $false }
        Write-Host "[OK] Build" -ForegroundColor Green

        Write-Host ""
        Write-Host "  TUDO OK - pronto para push." -ForegroundColor Green
        Write-Audit -AcaoNome "Verificar" -Detalhe "OK"
        return $true
    } finally {
        Pop-Location
    }
}

function Invoke-Testes {
    Push-Location $AppRoot
    try { npm test } finally { Pop-Location }
}

function Invoke-Lint {
    Push-Location $AppRoot
    try { npm run lint } finally { Pop-Location }
}

function Invoke-TestesArquivo {
    param([string]$Padrao)
    if (-not $Padrao) { Write-Host "[ERRO] Informe um arquivo ou nome de teste." -ForegroundColor Red; return }
    Push-Location $AppRoot
    try {
        if ($Padrao -match '\.test\.' -or $Padrao -match '[\\/]') {
            & npx vitest run $Padrao
        } else {
            & npx vitest run -t $Padrao
        }
    } finally {
        Pop-Location
    }
}

function Invoke-CorrigirAmbiente {
    Write-Host ""
    Write-Host "Isso PARA o dev server, apaga .next e repara as dependencias (npm install)." -ForegroundColor Yellow
    if (-not (Confirm-SN "Continuar")) { Write-Host "Cancelado." -ForegroundColor Yellow; return }
    Stop-DevServer
    Push-Location $AppRoot
    try {
        $next = Join-Path $AppRoot ".next"
        if (Test-Path $next) { Remove-Item -Recurse -Force $next; Write-Host "[OK] .next apagado." -ForegroundColor Green }
        $full = Confirm-SN "Apagar tambem node_modules e reinstalar do zero (mais lento, resolve deps corrompidas)"
        if ($full) {
            $nm = Join-Path $AppRoot "node_modules"
            if (Test-Path $nm) { Write-Host "Apagando node_modules..." -ForegroundColor Cyan; Remove-Item -Recurse -Force $nm }
        }
        Write-Host ""
        Write-Host "-> npm install" -ForegroundColor Cyan
        npm install
        if ($LASTEXITCODE -ne 0) { Write-Host "[ERRO] npm install falhou." -ForegroundColor Red; return }
        Write-Host "[OK] Ambiente reparado." -ForegroundColor Green
        Write-Audit -AcaoNome "CorrigirAmbiente" -Detalhe "full=$full"
    } finally {
        Pop-Location
    }
}

# ======================== GIT & PUBLICACAO ========================

function Invoke-StatusRepo {
    Push-Location $AppRoot
    try {
        Write-Host ""
        Write-Host "==================== STATUS DO REPOSITORIO ====================" -ForegroundColor Cyan
        # fetch silencioso para o ahead/behind refletir o estado REAL de origin (best-effort/offline-safe).
        Write-Host "  (atualizando refs: git fetch)" -ForegroundColor DarkGray
        git fetch --quiet 2>$null
        $branch = (git rev-parse --abbrev-ref HEAD).Trim()
        $commit = (git rev-parse --short HEAD).Trim()
        $subject = (git log -1 --pretty=%s).Trim()
        Write-Host ("  Branch atual : {0}" -f $branch)
        Write-Host ("  Ultimo commit: {0}  {1}" -f $commit, $subject)

        $dirty = git status --porcelain
        if ($dirty) {
            Write-Host "  Arvore       : SUJA (mudancas nao commitadas)" -ForegroundColor Yellow
            git status --short
        } else {
            Write-Host "  Arvore       : limpa" -ForegroundColor Green
        }

        git rev-parse --abbrev-ref --symbolic-full-name "@{u}" *> $null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  Upstream     : nenhum (branch local sem origin). Use 'Push' para criar." -ForegroundColor Yellow
        } else {
            $counts = (git rev-list --left-right --count "HEAD...@{u}").Trim()
            $parts = $counts -split "\s+"
            $ahead = [int]$parts[0]; $behind = [int]$parts[1]
            Write-Host ("  vs origin    : {0} a frente, {1} atras" -f $ahead, $behind)
            if ($ahead -gt 0) { Write-Host ("  -> Faltam {0} commit(s) para push." -f $ahead) -ForegroundColor Yellow }
            if ($behind -gt 0) { Write-Host ("  -> {0} commit(s) novos no servidor: rode 'git pull'." -f $behind) -ForegroundColor Yellow }
            if ($ahead -eq 0 -and $behind -eq 0) { Write-Host "  -> Sincronizado com origin." -ForegroundColor Green }
        }

        $ver = ""
        try { $ver = (Get-Content (Join-Path $AppRoot "package.json") -Raw | ConvertFrom-Json).version } catch {}
        $tag = (git describe --tags --abbrev=0 2>$null | Select-Object -First 1)
        if ($ver) {
            $tagTxt = if ($tag) { "  (ultima tag: $tag)" } else { "  (sem tag ainda)" }
            Write-Host ("  Versao       : {0}{1}" -f $ver, $tagTxt)
        }
        Write-Host "===============================================================" -ForegroundColor Cyan
    } finally {
        Pop-Location
    }
}

function Invoke-Commit {
    Push-Location $AppRoot
    try {
        $st = git status --porcelain
        if (-not $st) { Write-Host "[ATENCAO] Nada para commitar (arvore limpa)." -ForegroundColor Yellow; return }
        Write-Host ""
        Write-Host "Mudancas a incluir (git add -A):" -ForegroundColor Cyan
        git status --short
        Write-Host ""
        $tipos = @("feat", "fix", "docs", "chore", "refactor", "perf", "test", "style", "build", "ci")
        Write-Host "Tipo do commit:" -ForegroundColor Cyan
        for ($i = 0; $i -lt $tipos.Count; $i++) { Write-Host ("  {0,2}. {1}" -f ($i + 1), $tipos[$i]) }
        $numTipo = Read-Host "Numero do tipo"
        $idx = 0
        [int]::TryParse($numTipo, [ref]$idx) | Out-Null
        if ($idx -lt 1 -or $idx -gt $tipos.Count) { Write-Host "[ERRO] Tipo invalido." -ForegroundColor Red; return }
        $tipo = $tipos[$idx - 1]
        $escopo = Read-Host "Escopo (opcional - ex: ponto, chat; enter p/ pular)"
        $desc = Read-Host "Descricao curta (pt-BR, imperativo)"
        if (-not $desc) { Write-Host "[ERRO] Descricao obrigatoria." -ForegroundColor Red; return }
        if ($escopo) { $msg = "{0}({1}): {2}" -f $tipo, $escopo, $desc } else { $msg = "{0}: {1}" -f $tipo, $desc }
        Write-Host ""
        Write-Host ("Previa do commit: {0}" -f $msg) -ForegroundColor Green
        if (-not (Confirm-SN "Confirmar commit")) { Write-Host "Cancelado." -ForegroundColor Yellow; return }
        git add -A
        git commit -m $msg
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] Commit criado." -ForegroundColor Green
            Write-Audit -AcaoNome "Commit" -Detalhe $msg
        } else {
            Write-Host "[ERRO] Falha no commit (veja a mensagem acima)." -ForegroundColor Red
        }
    } finally {
        Pop-Location
    }
}

function Invoke-Push {
    Push-Location $AppRoot
    try {
        $branch = (git rev-parse --abbrev-ref HEAD).Trim()
        git rev-parse --abbrev-ref --symbolic-full-name "@{u}" *> $null
        if ($LASTEXITCODE -ne 0) {
            Write-Host ("Branch '{0}' sem upstream. Criando com -u origin {0}..." -f $branch) -ForegroundColor Cyan
            git push -u origin $branch
        } else {
            Write-Host ("Enviando '{0}' para origin..." -f $branch) -ForegroundColor Cyan
            git push
        }
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] Push concluido." -ForegroundColor Green
            Write-Audit -AcaoNome "Push" -Detalhe $branch
        } else {
            Write-Host "[ERRO] Push falhou (veja a mensagem acima)." -ForegroundColor Red
        }
    } finally {
        Pop-Location
    }
}

function Invoke-Promover {
    param([string]$Modo)   # "Direto" | "PR"
    Push-Location $AppRoot
    try {
        $branch = (git rev-parse --abbrev-ref HEAD).Trim()
        if ($branch -ne "dev") {
            Write-Host "[ERRO] Voce nao esta na branch 'dev' (atual: $branch). Troque para dev antes de promover." -ForegroundColor Red
            return
        }
        $dirty = git status --porcelain
        if ($dirty) {
            Write-Host "[ERRO] Arvore suja - commite ou faca stash antes de promover." -ForegroundColor Red
            git status --short
            return
        }

        if ($DryRun) {
            Write-Host ""
            Write-Host "*** MODO DRY-RUN: nenhum push/merge sera executado ***" -ForegroundColor Yellow
        }

        # --- via Pull Request ---
        if ($Modo -eq "PR") {
            if ($DryRun) { Write-Host "  [dry-run] rodaria verificacao completa (lint+test+build)" -ForegroundColor DarkGray }
            else { if (-not (Invoke-Verificar)) { Write-Host "[ERRO] Verificacao falhou - promocao abortada." -ForegroundColor Red; return } }

            $rc = Invoke-Passo "git push -u origin dev" { git push -u origin dev }
            if ($rc -ne 0 -and -not $DryRun) { Write-Host "[ERRO] Push da dev falhou." -ForegroundColor Red; return }

            $url = "$RepoWeb/compare/master...dev?expand=1"
            $temGh = Get-Command gh -ErrorAction SilentlyContinue
            if ($temGh) {
                $rcGh = Invoke-Passo "gh pr create --base master --head dev --fill" { gh pr create --base master --head dev --fill }
                if (-not $DryRun -and $rcGh -ne 0) {
                    Write-Host ""
                    Write-Host "[ATENCAO] 'gh pr create' falhou (nao autenticado? PR ja existe? sem permissao?)." -ForegroundColor Yellow
                    Write-Host "          Abra o PR manualmente neste link:" -ForegroundColor Yellow
                    Write-Host "  $url" -ForegroundColor Cyan
                    Write-Audit -AcaoNome "PromoverPR" -Detalhe "gh falhou"
                    return
                }
            } else {
                Write-Host ""
                Write-Host "gh (GitHub CLI) nao instalado. Abra este link para criar o PR:" -ForegroundColor Yellow
                Write-Host "  $url" -ForegroundColor Cyan
                if (-not $DryRun) { Start-Process $url }
            }
            Write-Host ""
            Write-Host "Revise e faca o merge do PR pela conta 'servidor'. O deploy de producao puxa origin/master." -ForegroundColor Green
            $det = if ($DryRun) { "dry-run" } else { "OK" }
            Write-Audit -AcaoNome "PromoverPR" -Detalhe $det
            return
        }

        # --- Direto (merge + push master) ---
        if ($DryRun) { Write-Host "  [dry-run] rodaria verificacao completa (lint+test+build)" -ForegroundColor DarkGray }
        else { if (-not (Invoke-Verificar)) { Write-Host "[ERRO] Verificacao falhou - promocao abortada." -ForegroundColor Red; return } }

        $rc = Invoke-Passo "git push -u origin dev (garante origin/dev atualizado)" { git push -u origin dev }
        if ($rc -ne 0 -and -not $DryRun) { Write-Host "[ERRO] Push da dev falhou." -ForegroundColor Red; return }

        $rc = Invoke-Passo "git checkout master" { git checkout master }
        if ($rc -ne 0 -and -not $DryRun) { Write-Host "[ERRO] checkout master falhou." -ForegroundColor Red; return }

        $rc = Invoke-Passo "git pull --ff-only" { git pull --ff-only }
        if ($rc -ne 0 -and -not $DryRun) {
            Write-Host "[ERRO] pull do master falhou. Voltando para dev..." -ForegroundColor Red
            git checkout dev | Out-Host
            return
        }

        # Se o master tem commits que a dev NAO tem (ex: hotfix direto no master), o resultado
        # do merge sera diferente do que a verificacao (rodada na dev) validou -> avisa e oferece rebuild.
        $masterExtra = 0
        if (-not $DryRun) {
            $masterExtra = [int]((git rev-list --count "dev..HEAD" 2>$null) | Select-Object -First 1)
        }

        if ($DryRun) {
            Write-Host "  [dry-run] git merge dev --no-edit" -ForegroundColor DarkGray
        } else {
            Write-Host ""
            Write-Host "-> git merge dev --no-edit" -ForegroundColor Cyan
            git merge dev --no-edit
            if ($LASTEXITCODE -ne 0) {
                Write-Host "[ERRO] CONFLITO ao mesclar dev em master." -ForegroundColor Red
                Write-Host "       Recupere: resolva os conflitos -> git commit -> git push origin master" -ForegroundColor Yellow
                Write-Host "       depois: git checkout dev -> menu 'Sincronizar dev com master'." -ForegroundColor Yellow
                Write-Host "       (ou desfaca com 'git merge --abort' + 'git checkout dev' para NAO publicar)" -ForegroundColor Yellow
                return
            }
            if ($masterExtra -gt 0) {
                Write-Host ""
                Write-Host "[ATENCAO] O master tinha $masterExtra commit(s) que a dev nao tem;" -ForegroundColor Yellow
                Write-Host "          o resultado mesclado NAO foi verificado (a verificacao rodou so na dev)." -ForegroundColor Yellow
                if (Confirm-SN "Rodar 'npm run build' no master mesclado antes de publicar") {
                    npm run build 2>&1 | Tee-Object -FilePath $VerificacaoLog -Append | Out-Host
                    if ($LASTEXITCODE -ne 0) {
                        Write-Host "[ERRO] Build do master mesclado falhou. Publicacao abortada." -ForegroundColor Red
                        Write-Host "       Volte para dev com 'git checkout dev' apos avaliar." -ForegroundColor Yellow
                        return
                    }
                    Write-Host "[OK] Build do master mesclado" -ForegroundColor Green
                }
            }
        }

        Write-Host ""
        Write-Host "[ATENCAO] As migrations pendentes rodarao em PRODUCAO no proximo deploy." -ForegroundColor Yellow
        Write-Host "          Confirme que o backup automatico esta ligado no servidor (ENABLE_BACKUP=1)." -ForegroundColor Yellow

        if (-not $DryRun) {
            if (-not (Confirm-Typed -Palavra "SUBIR")) {
                Write-Host "Cancelado. Voltando para dev..." -ForegroundColor Yellow
                git checkout dev | Out-Null
                return
            }
        }

        if ($DryRun) {
            Write-Host "  [dry-run] git push origin master" -ForegroundColor DarkGray
        } else {
            Write-Host ""
            Write-Host "-> git push origin master (dispara o deploy de producao)" -ForegroundColor Cyan
            git push origin master
            if ($LASTEXITCODE -ne 0) {
                Write-Host "[ERRO] Push do master rejeitado. Se a branch master exige PR (branch protection)," -ForegroundColor Red
                Write-Host "       use 'Promover -> via Pull Request'. Voltando para dev..." -ForegroundColor Yellow
                git checkout dev | Out-Null
                return
            }
        }

        # sincroniza de volta: dev fica com o merge commit. Producao JA foi publicada aqui -
        # entao falhas neste ponto sao [ATENCAO] (nao [ERRO]) e nao desfazem o deploy.
        if ($DryRun) {
            Write-Host "  [dry-run] git checkout dev ; git merge master --no-edit ; git push origin dev" -ForegroundColor DarkGray
        } else {
            $rcCk = Invoke-Passo "git checkout dev" { git checkout dev }
            if ($rcCk -ne 0) {
                Write-Host "[ATENCAO] Producao publicada, mas 'git checkout dev' falhou - voce ainda esta em MASTER. Troque manualmente." -ForegroundColor Yellow
                Write-Audit -AcaoNome "PromoverDireto" -Detalhe "publicado; checkout dev falhou"
                return
            }
            git merge master --no-edit
            if ($LASTEXITCODE -ne 0) {
                Write-Host "[ATENCAO] Producao publicada, mas o merge master->dev falhou. Rode 'Sincronizar dev com master'." -ForegroundColor Yellow
                Write-Audit -AcaoNome "PromoverDireto" -Detalhe "publicado; syncback merge falhou"
                return
            }
            git push origin dev
            if ($LASTEXITCODE -ne 0) {
                Write-Host "[ATENCAO] Producao publicada, mas 'git push origin dev' falhou. Rode 'Push' quando puder." -ForegroundColor Yellow
                Write-Audit -AcaoNome "PromoverDireto" -Detalhe "publicado; push dev falhou"
                return
            }
        }

        Write-Host ""
        Write-Host "[OK] Promocao concluida. O deploy de producao vai puxar origin/master." -ForegroundColor Green
        $det = if ($DryRun) { "dry-run" } else { "OK" }
        Write-Audit -AcaoNome "PromoverDireto" -Detalhe $det
    } finally {
        Pop-Location
    }
}

function Invoke-Sincronizar {
    Push-Location $AppRoot
    try {
        $rc = Invoke-Passo "git checkout dev" { git checkout dev }
        if ($rc -ne 0) { Write-Host "[ERRO] checkout dev falhou." -ForegroundColor Red; return }
        # fetch antes: mescla o origin/master REAL (o master local pode estar velho, ja que
        # em producao o master costuma avancar remoto via PR/deploy).
        $rc = Invoke-Passo "git fetch origin" { git fetch origin }
        if ($rc -ne 0) { Write-Host "[ATENCAO] git fetch falhou; mesclando o master local (pode estar desatualizado)." -ForegroundColor Yellow }
        Write-Host ""
        Write-Host "-> git merge origin/master --no-edit" -ForegroundColor Cyan
        git merge origin/master --no-edit
        if ($LASTEXITCODE -ne 0) { Write-Host "[ERRO] Conflito ao mesclar origin/master em dev. Resolva manualmente." -ForegroundColor Red; return }
        $rc = Invoke-Passo "git push origin dev" { git push origin dev }
        if ($rc -ne 0) { Write-Host "[ERRO] 'git push origin dev' falhou (veja acima)." -ForegroundColor Red; return }
        Write-Host "[OK] dev sincronizada com origin/master." -ForegroundColor Green
        Write-Audit -AcaoNome "Sincronizar" -Detalhe "OK"
    } finally {
        Pop-Location
    }
}

# ======================== BANCO DE DADOS (DEV) ========================

function Invoke-DbMigrate {
    param([string]$Nome)
    Push-Location $AppRoot
    try {
        if ($Nome) { npm run db:migrate -- --name $Nome } else { npm run db:migrate }
        Write-Audit -AcaoNome "DbMigrate" -Detalhe "exit=$LASTEXITCODE nome=$Nome"
    } finally {
        Pop-Location
    }
}

function Invoke-DbGenerate {
    Push-Location $AppRoot
    try { npm run db:generate; Write-Audit -AcaoNome "DbGenerate" -Detalhe "exit=$LASTEXITCODE" } finally { Pop-Location }
}

function Invoke-DbSeed {
    Push-Location $AppRoot
    try { npm run db:seed; Write-Audit -AcaoNome "DbSeed" -Detalhe "exit=$LASTEXITCODE" } finally { Pop-Location }
}

function Invoke-SeedDemo {
    Write-Host ""
    Write-Host "[ATENCAO] seed:demo APAGA todos os dados de negocio do banco de dev e recria dados ficticios." -ForegroundColor Yellow
    if (-not (Confirm-Typed -Palavra "APAGAR")) { Write-Host "Cancelado." -ForegroundColor Yellow; return }
    # snapshot opcional antes do wipe - so quando o .env de dev tiver PG_DUMP_PATH + BACKUP_PATH
    # (normalmente ausente em dev; nesse caso, pula em silencio).
    $pgDump = Get-EnvValue -Key "PG_DUMP_PATH"
    $backupDir = Get-EnvValue -Key "BACKUP_PATH"
    $dbUrl = Get-EnvValue -Key "DATABASE_URL"
    if ($pgDump -and (Test-Path $pgDump) -and $backupDir -and $dbUrl -match "postgresql://([^:]+):([^@]+)@([^:/]+):(\d+)/([\w-]+)") {
        if (Confirm-SN "Fazer um snapshot (pg_dump) do banco de dev antes de apagar") {
            if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Force -Path $backupDir | Out-Null }
            $u = $Matches[1]; $pw = $Matches[2]; $h = $Matches[3]; $pt = $Matches[4]; $n = $Matches[5]
            $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
            $arq = Join-Path $backupDir "dev-antes-demo-$stamp.backup"
            $env:PGPASSWORD = $pw
            try {
                & $pgDump -h $h -p $pt -U $u -d $n -Fc -f $arq
                if ($LASTEXITCODE -eq 0) { Write-Host "[OK] Snapshot: $arq" -ForegroundColor Green }
                else { Write-Host "[ATENCAO] pg_dump falhou; seguindo sem snapshot." -ForegroundColor Yellow }
            } finally {
                Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
            }
        }
    }
    Push-Location $AppRoot
    try { npm run seed:demo; Write-Audit -AcaoNome "SeedDemo" -Detalhe "exit=$LASTEXITCODE" } finally { Pop-Location }
}

function Invoke-ResetSenha {
    Write-Host ""
    Write-Host "Isso reseta a senha do admin para a padrao (SenaHub@2026), forcando troca no login." -ForegroundColor Yellow
    if (-not (Confirm-Typed -Palavra "CONFIRMAR")) { Write-Host "Cancelado." -ForegroundColor Yellow; return }
    Push-Location $AppRoot
    try { npm run admin:reset-senha; Write-Audit -AcaoNome "ResetSenha" -Detalhe "exit=$LASTEXITCODE" } finally { Pop-Location }
}

function Invoke-SeedsDev {
    param([string]$Qual)
    $mapa = @{
        aniversariantes = "scripts/seed-aniversariantes.ts"
        melhorias       = "scripts/seed-teste-melhorias.ts"
        modalidades     = "scripts/seed-modalidades.ts"
    }
    if (-not $mapa.ContainsKey($Qual)) { Write-Host "[ERRO] Seed dev desconhecido: $Qual" -ForegroundColor Red; return }
    Push-Location $AppRoot
    try {
        & npx tsx --tsconfig tsconfig.server.json $mapa[$Qual]
        Write-Audit -AcaoNome "SeedsDev" -Detalhe "$Qual exit=$LASTEXITCODE"
    } finally {
        Pop-Location
    }
}

function Invoke-Studio {
    Write-Host "Abrindo Prisma Studio em nova janela..." -ForegroundColor Cyan
    Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "npx prisma studio" -WorkingDirectory $AppRoot
}

function Invoke-DbStatus {
    $dbUrl = Get-EnvValue -Key "DATABASE_URL"
    Write-Host ""
    if (-not $dbUrl -or $dbUrl -notmatch "postgresql://([^:]+):([^@]+)@([^:/]+):(\d+)/([\w-]+)") {
        Write-Host "[ERRO] DATABASE_URL ausente ou invalida no .env." -ForegroundColor Red
        return
    }
    $dbHost = $Matches[3]; $dbPort = $Matches[4]; $dbName = $Matches[5]
    Write-Host ("Banco: {0} em {1}:{2}" -f $dbName, $dbHost, $dbPort) -ForegroundColor Cyan
    $portaOk = Test-Porta -Alvo $dbHost -Porta ([int]$dbPort)
    if ($portaOk) {
        Write-Host "[OK] Porta $dbPort aceitando conexoes." -ForegroundColor Green
    } else {
        Write-Host "[FALHA] Porta $dbPort nao responde (Postgres de dev parado?)." -ForegroundColor Red
        return
    }
    if (Test-PostgresConnection) {
        Write-Host "[OK] Autenticacao no banco OK (select 1)." -ForegroundColor Green
    } else {
        Write-Host "[ATENCAO] Porta ok, mas nao rodei 'select 1' (PG_DUMP_PATH/psql ausente no .env de dev - normal)." -ForegroundColor Yellow
    }
}

# ======================== SMOKES E2E ========================

function Invoke-Smoke {
    param([string]$Qual)
    Push-Location $AppRoot
    try {
        if ($Qual -eq "todos") {
            $ondas = @("smoke:onda1", "smoke:onda2", "smoke:onda3", "smoke:onda3efg", "smoke:onda4", "smoke:onda5")
            $res = @()
            foreach ($o in $ondas) {
                Write-Host ""
                Write-Host "==== npm run $o ====" -ForegroundColor Cyan
                & npm run $o
                $res += [PSCustomObject]@{ Onda = $o; Ok = ($LASTEXITCODE -eq 0) }
            }
            Write-Host ""
            Write-Host "---- Resumo ----" -ForegroundColor Cyan
            foreach ($r in $res) {
                if ($r.Ok) { Write-Host "  [OK]     $($r.Onda)" -ForegroundColor Green }
                else { Write-Host "  [FALHOU] $($r.Onda)" -ForegroundColor Red }
            }
            Write-Audit -AcaoNome "Smoke" -Detalhe "todos"
        } else {
            Write-Host ""
            Write-Host "==== npm run smoke:$Qual ====" -ForegroundColor Cyan
            & npm run "smoke:$Qual"
            Write-Audit -AcaoNome "Smoke" -Detalhe "$Qual exit=$LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
}

# ======================== VERSAO / RELEASE ========================

function Invoke-ReleaseDry {
    Push-Location $AppRoot
    try { npm run release:dry } finally { Pop-Location }
}

function Invoke-Release {
    param([string]$Tipo)   # patch|minor|major
    Write-Host ""
    Write-Host "Isso bumpa a versao ($Tipo), atualiza o CHANGELOG e cria uma tag git." -ForegroundColor Yellow
    if (-not (Confirm-Typed -Palavra "RELEASE")) { Write-Host "Cancelado." -ForegroundColor Yellow; return }
    Push-Location $AppRoot
    try {
        switch ($Tipo) {
            "minor" { npm run release:minor }
            "major" { npm run release:major }
            default { npm run release }
        }
        Write-Host ""
        Write-Host "Lembre de enviar a tag: git push --follow-tags" -ForegroundColor Cyan
        Write-Audit -AcaoNome "Release" -Detalhe "$Tipo exit=$LASTEXITCODE"
    } finally {
        Pop-Location
    }
}

# ======================== DIAGNOSTICO ========================

function Invoke-Doctor {
    Write-Host ""
    Write-Host "==================== DOCTOR: AMBIENTE DEV ====================" -ForegroundColor Cyan
    Write-Host ""
    $problemas = @()

    try {
        $nodeV = (node -v).Trim()
        $maj = 0
        if ($nodeV -match "v(\d+)\.") { $maj = [int]$Matches[1] }
        if ($maj -ge 20) { Write-Host "  [OK]   Node $nodeV" -ForegroundColor Green }
        else { Write-Host "  [ATENCAO] Node $nodeV (recomendado 20+)" -ForegroundColor Yellow; $problemas += "Node < 20" }
    } catch { Write-Host "  [FALHA] Node nao encontrado no PATH" -ForegroundColor Red; $problemas += "Node ausente" }

    try { $npmV = (npm -v).Trim(); Write-Host "  [OK]   npm $npmV" -ForegroundColor Green }
    catch { Write-Host "  [FALHA] npm nao encontrado" -ForegroundColor Red; $problemas += "npm ausente" }

    $envPath = Join-Path $AppRoot ".env"
    if (-not (Test-Path $envPath)) {
        Write-Host "  [FALHA] .env nao existe" -ForegroundColor Red
        $problemas += ".env ausente"
    } else {
        Write-Host "  [OK]   .env encontrado" -ForegroundColor Green
        foreach ($k in @("DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "APP_URL", "STORAGE_BASE_PATH", "CHROME_PATH")) {
            $v = Get-EnvValue -Key $k
            if ($v) { Write-Host ("  [OK]   {0} definido" -f $k) -ForegroundColor Green }
            else { Write-Host ("  [FALHA] {0} ausente no .env" -f $k) -ForegroundColor Red; $problemas += "$k ausente" }
        }
        $storage = Get-EnvValue -Key "STORAGE_BASE_PATH"
        if ($storage) {
            if (Test-Path $storage) { Write-Host "  [OK]   STORAGE_BASE_PATH existe" -ForegroundColor Green }
            else { Write-Host "  [ATENCAO] STORAGE_BASE_PATH nao existe: $storage" -ForegroundColor Yellow; $problemas += "STORAGE_BASE_PATH inexistente" }
        }
        $chrome = Get-EnvValue -Key "CHROME_PATH"
        if ($chrome) {
            if (Test-Path $chrome) { Write-Host "  [OK]   CHROME_PATH existe" -ForegroundColor Green }
            else { Write-Host "  [ATENCAO] CHROME_PATH nao existe: $chrome" -ForegroundColor Yellow; $problemas += "CHROME_PATH inexistente" }
        }
    }

    $dbUrl = Get-EnvValue -Key "DATABASE_URL"
    if ($dbUrl -match "postgresql://([^:]+):([^@]+)@([^:/]+):(\d+)/([\w-]+)") {
        $h = $Matches[3]; $p = $Matches[4]
        if (Test-Porta -Alvo $h -Porta ([int]$p)) { Write-Host ("  [OK]   Banco alcancavel em {0}:{1}" -f $h, $p) -ForegroundColor Green }
        else { Write-Host ("  [FALHA] Banco nao responde em {0}:{1}" -f $h, $p) -ForegroundColor Red; $problemas += "DB inacessivel" }
        # dev deve usar :5433; :5432 e o Postgres Docker do sistema ANTIGO (CLAUDE.md: nao mexer).
        if ($p -ne "5433") { Write-Host ("  [ATENCAO] DATABASE_URL aponta para :{0} (dev esperado :5433)" -f $p) -ForegroundColor Yellow; $problemas += "porta do banco != 5433" }
        if (Test-Porta -Alvo "127.0.0.1" -Porta 5432 -TimeoutMs 500) { Write-Host "  [ATENCAO] Algo escuta na :5432 (Postgres do sistema ANTIGO) - nao rode migrate/seed contra ele." -ForegroundColor Yellow }
    }

    if (Test-DevServerRodando) { Write-Host "  [INFO] Porta 3000 em uso (dev server rodando)" -ForegroundColor Yellow }
    else { Write-Host "  [OK]   Porta 3000 livre" -ForegroundColor Green }

    if (Test-Path (Join-Path $AppRoot "node_modules")) { Write-Host "  [OK]   node_modules presente" -ForegroundColor Green }
    else { Write-Host "  [FALHA] node_modules ausente (rode npm install)" -ForegroundColor Red; $problemas += "node_modules ausente" }

    if (Test-Path (Join-Path $AppRoot "src\generated\prisma")) { Write-Host "  [OK]   Cliente Prisma gerado" -ForegroundColor Green }
    else { Write-Host "  [ATENCAO] Cliente Prisma nao gerado (rode 'Gerar cliente Prisma')" -ForegroundColor Yellow; $problemas += "Prisma client ausente" }

    if (Test-Path (Join-Path $AppRoot ".next")) { Write-Host "  [INFO] .next presente (build anterior)" -ForegroundColor DarkGray }
    else { Write-Host "  [INFO] .next ausente (sem build ainda)" -ForegroundColor DarkGray }

    try {
        $branch = (git rev-parse --abbrev-ref HEAD).Trim()
        $dirty = git status --porcelain
        if ($dirty) { Write-Host "  [INFO] Git: branch $branch (arvore SUJA)" -ForegroundColor Yellow }
        else { Write-Host "  [OK]   Git: branch $branch (arvore limpa)" -ForegroundColor Green }
        $ver = (Get-Content (Join-Path $AppRoot "package.json") -Raw | ConvertFrom-Json).version
        $tag = (git describe --tags --abbrev=0 2>$null | Select-Object -First 1)
        $tagTxt = if ($tag) { "ultima tag: $tag" } else { "sem tag ainda" }
        Write-Host ("  [INFO] Versao {0} ({1})" -f $ver, $tagTxt) -ForegroundColor DarkGray
    } catch {}

    Write-Host ""
    if ($problemas.Count -eq 0) {
        Write-Host "  RESULTADO: ambiente pronto para desenvolvimento" -ForegroundColor Green
    } else {
        Write-Host "  RESULTADO: pendencias encontradas:" -ForegroundColor Red
        foreach ($x in $problemas) { Write-Host "    - $x" -ForegroundColor Yellow }
    }
    Write-Host "=============================================================" -ForegroundColor Cyan
}

function Invoke-ProcessosPortas {
    Write-Host ""
    Write-Host "---- Processos node / esbuild / postgres ----" -ForegroundColor Cyan
    Get-Process -Name "node", "esbuild", "postgres" -ErrorAction SilentlyContinue |
        Select-Object Id, ProcessName, StartTime | Format-Table -AutoSize | Out-String | Write-Host

    Write-Host "---- Porta 3000 (dev) ----" -ForegroundColor Cyan
    Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
        Select-Object LocalAddress, LocalPort, State, OwningProcess | Format-Table -AutoSize | Out-String | Write-Host

    Write-Host "---- Porta 5433 (Postgres dev) ----" -ForegroundColor Cyan
    Get-NetTCPConnection -LocalPort 5433 -ErrorAction SilentlyContinue |
        Select-Object LocalAddress, LocalPort, State, OwningProcess | Format-Table -AutoSize | Out-String | Write-Host
}

function Invoke-LimparCaches {
    Write-Host ""
    Write-Host "Isso PARA o dev server e apaga .next + node_modules\.cache." -ForegroundColor Yellow
    if (-not (Confirm-SN "Continuar")) { Write-Host "Cancelado." -ForegroundColor Yellow; return }
    Push-Location $AppRoot
    try {
        Stop-DevServer
        $next = Join-Path $AppRoot ".next"
        if (Test-Path $next) { Remove-Item -Recurse -Force $next; Write-Host "[OK] .next apagado." -ForegroundColor Green }
        else { Write-Host "[OK] .next ja ausente." -ForegroundColor Green }
        $cache = Join-Path $AppRoot "node_modules\.cache"
        if (Test-Path $cache) { Remove-Item -Recurse -Force $cache; Write-Host "[OK] node_modules\.cache apagado." -ForegroundColor Green }
        Write-Audit -AcaoNome "LimparCaches" -Detalhe "OK"
    } finally {
        Pop-Location
    }
}

# ======================== DISPATCH ========================

switch ($Acao) {
    "Audit"            { Write-Audit -AcaoNome $Sub -Detalhe "via bat" }
    "DevNext"          { Invoke-DevNext }
    "DevServer"        { Invoke-DevServer }
    "PararDev"         { Invoke-PararDev }
    "Verificar"        { $null = Invoke-Verificar }
    "Testes"           { Invoke-Testes }
    "Lint"             { Invoke-Lint }
    "TestesArquivo"    { Invoke-TestesArquivo -Padrao $Sub }
    "CorrigirAmbiente" { Invoke-CorrigirAmbiente }
    "StatusRepo"       { Invoke-StatusRepo }
    "Commit"           { Invoke-Commit }
    "Push"             { Invoke-Push }
    "Promover"         { Invoke-Promover -Modo $Sub }
    "Sincronizar"      { Invoke-Sincronizar }
    "DbMigrate"        { Invoke-DbMigrate -Nome $Sub }
    "DbGenerate"       { Invoke-DbGenerate }
    "DbSeed"           { Invoke-DbSeed }
    "SeedDemo"         { Invoke-SeedDemo }
    "ResetSenha"       { Invoke-ResetSenha }
    "SeedsDev"         { Invoke-SeedsDev -Qual $Sub }
    "Studio"           { Invoke-Studio }
    "DbStatus"         { Invoke-DbStatus }
    "Smoke"            { Invoke-Smoke -Qual $Sub }
    "ReleaseDry"       { Invoke-ReleaseDry }
    "Release"          { Invoke-Release -Tipo $Sub }
    "Doctor"           { Invoke-Doctor }
    "ProcessosPortas"  { Invoke-ProcessosPortas }
    "LimparCaches"     { Invoke-LimparCaches }
    default {
        Write-Host "Acao desconhecida: $Acao" -ForegroundColor Red
    }
}
