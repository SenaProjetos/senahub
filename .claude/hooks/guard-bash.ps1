# guard-bash.ps1 — PreToolUse guard para comandos de shell no SenaHub.
#
# Consolida tres guardas num unico processo (spawn de powershell custa ~300ms;
# tres hooks separados no mesmo matcher pagariam isso tres vezes por comando):
#   1. `next build` com `next dev` vivo na :3000  -> deny (corrompe .next)
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

# --- 2. next build com next dev ativo ------------------------------------
# CLAUDE.md: nunca rodar `next build` com `next dev` no mesmo .next (corrompe).
if ($cmd -imatch 'next\s+build' -or $cmd -imatch 'npm\s+run\s+build') {
    $ocupada = $null
    try {
        $ocupada = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
    } catch { }
    if ($ocupada) {
        Write-Decision 'deny' @"
Ha processo escutando na :3000 (next dev ou dev:server ativo).
Rodar build agora corrompe o .next, e o conserto e apagar a pasta inteira.
Pare o servidor de dev primeiro, depois rode o build.
"@
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
