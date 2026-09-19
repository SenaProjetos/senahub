# guard-bash.ps1 — PreToolUse guard para comandos de shell no SenaHub.
#
# Consolida tres guardas num unico processo (spawn de powershell custa ~300ms;
# tres hooks separados no mesmo matcher pagariam isso tres vezes por comando):
#   1. `next build` com `next dev` vivo NESTA pasta -> deny (corrompe .next)
#   2. `git commit`/`git push` estando em master  -> ask  (master e estavel/deploy)
#   3. comando destrutivo no banco de dev         -> ask  (apaga dados de trabalho)
#
# Contrato: le o payload do hook em stdin (JSON), escreve decisao em stdout (JSON).
# Silencio + exit 0 = comando liberado. Qualquer falha interna libera o comando:
# um hook quebrado nunca pode travar o trabalho.

$ErrorActionPreference = 'SilentlyContinue'

function Write-Decision {
    param([string]$Decision, [string]$Reason)
    @{
        hookSpecificOutput = @{
            hookEventName            = 'PreToolUse'
            permissionDecision       = $Decision
            permissionDecisionReason = $Reason
        }
    } | ConvertTo-Json -Depth 5 -Compress
    exit 0
}

try {
    $payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
} catch {
    exit 0
}

$cmd = $payload.tool_input.command
if ([string]::IsNullOrWhiteSpace($cmd)) { exit 0 }

# --- 1. Comando destrutivo no banco de dev -------------------------------
# senahub_remake:5433 guarda dados de trabalho. O fluxo de drift do Prisma
# SUGERE reset justamente quando doi mais; por isso a guarda.
$destrutivo = @(
    'migrate\s+reset'
    '--force-reset'
    '--accept-data-loss'
    'DROP\s+DATABASE'
    'DROP\s+SCHEMA'
    'seed:demo'          # o script limpa dados de negocio antes de recriar
)
foreach ($p in $destrutivo) {
    if ($cmd -imatch $p) {
        Write-Decision 'ask' @"
Comando destrutivo no banco de dev (senahub_remake:5433): padrao '$p'.
Isso apaga dados de trabalho. Se o objetivo e so criar uma migration com drift,
use a skill /nova-migracao (db push + migration a mao + migrate resolve), sem reset.
Confirmar explicitamente para prosseguir.
"@
    }
}

# --- 2. next build com next dev ativo NESTA pasta ------------------------
# CLAUDE.md: nunca rodar `next build` com `next dev` no mesmo .next (corrompe).
#
# O .next e da PASTA: cada worktree tem o seu, entao so importa o servidor de dev
# desta pasta. O outro worktree (porta 3000, outra pasta) nao entra na conta -
# antes a guarda olhava so a :3000 e barrava por engano o build daqui, enquanto
# NAO barrava um `next dev` real na :3001 (o unico que corromperia o .next daqui).
#
# Dois sinais, ambos presos a esta pasta:
#   a) processo node cuja linha de comando cita a raiz deste worktree e roda
#      `next dev`/`next build`/`server.ts` - vale para qualquer porta;
#   b) a porta deste worktree, lida do PORT do .env da pasta (so se existir):
#      pega o dev iniciado por caminho relativo, que nao cita a raiz.
# Limite conhecido: um `next build` iniciado por caminho relativo (o scripts/build.mjs
# faz isso) nao cita a raiz e nao e visto pelo sinal (a); e raro e nao tem porta.
if ($cmd -imatch 'next\s+build' -or $cmd -imatch 'npm\s+run\s+build') {
    $cwd = $payload.cwd
    if ([string]::IsNullOrWhiteSpace($cwd)) { $cwd = (Get-Location).Path }
    $raiz = $null
    try { $raiz = (& git -C $cwd rev-parse --show-toplevel 2>$null) } catch { }
    if ($raiz) { $raiz = $raiz.Trim() -replace '/', '\' } else { $raiz = $cwd -replace '/', '\' }

    # a) servidor de dev desta pasta, por linha de comando. O lookahead exige que a raiz acabe ali
    #    (barra, aspas, espaco ou fim): "SENAHub-remake" e prefixo de "SENAHub-remake-vscode", o
    #    worktree irmao, e sem isso um dev de la seria confundido com um daqui.
    $devAqui = $null
    $raizRegex = [regex]::Escape($raiz.TrimEnd('\')) + '(?=\\|"|\s|$)'
    try {
        $devAqui = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
            Where-Object {
                $linha = $_.CommandLine -replace '/', '\'
                $linha -and
                $linha -imatch $raizRegex -and
                ($linha -imatch 'next\\dist\\bin\\next"?\s+(dev|build)\b' -or $linha -imatch '\bserver\.ts\b')
            } | Select-Object -First 1
    } catch { }
    if ($devAqui) {
        Write-Decision 'deny' @"
Ha um next dev/build ou dev:server rodando NESTA pasta (pid $($devAqui.ProcessId)).
Ele usa o mesmo .next do build: rodar os dois juntos corrompe a pasta, e o conserto
e apagar o .next inteiro. Pare o servidor de dev daqui primeiro, depois rode o build.
(O dev do outro worktree nao conta - cada pasta tem o seu .next.)
"@
    }

    # b) porta deste worktree, pelo PORT do .env da pasta.
    $porta = $null
    try {
        $env_ = Join-Path $raiz '.env'
        if (Test-Path -LiteralPath $env_) {
            $m = Select-String -LiteralPath $env_ -Pattern '^\s*PORT\s*=\s*"?(\d+)"?\s*$' | Select-Object -First 1
            if ($m) { $porta = [int]$m.Matches[0].Groups[1].Value }
        }
    } catch { }
    if ($porta) {
        $ocupada = $null
        try { $ocupada = Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue } catch { }
        if ($ocupada) {
            Write-Decision 'deny' @"
Ha processo escutando na :$porta, a porta deste worktree (PORT do .env desta pasta).
Provavelmente e o next dev/dev:server daqui, que usa o mesmo .next do build: rodar os
dois juntos corrompe a pasta, e o conserto e apagar o .next inteiro.
Pare o servidor de dev primeiro, depois rode o build.
"@
        }
    }
}

# --- 3. commit/push a partir de master -----------------------------------
# Convencao do projeto: trabalho novo vai em `dev`; `master` e estavel/deploy.
if ($cmd -imatch '\bgit\b' -and $cmd -imatch '\b(commit|push)\b') {
    $branch = $null
    try { $branch = (& git rev-parse --abbrev-ref HEAD 2>$null) } catch { }
    if ($branch) { $branch = $branch.Trim() }
    if ($branch -eq 'master' -or $branch -eq 'main') {
        Write-Decision 'ask' @"
Voce esta na branch '$branch', que e a estavel/de deploy.
Implementacao e ajuste vao na branch 'dev' e sobem para master via promocao
(dev.bat > Promover dev -> producao). Confirmar se o commit direto e intencional.
"@
    }
}

exit 0
