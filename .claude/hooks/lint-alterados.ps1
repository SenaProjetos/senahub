# lint-alterados.ps1 — Stop hook: roda eslint nos .ts/.tsx alterados no fim do turno.
#
# O projeto nao usa prettier; o eslint e a unica rede automatica. Rodar so nos
# arquivos do diff mantem o custo baixo (o eslint do Next demora ~5-10s so pra subir).
#
# Protecoes contra loop e contra lentidao:
#   - `stop_hook_active` = true significa que ESTE hook ja provocou a continuacao.
#     Sair na hora, senao vira loop infinito de "lint falhou -> corrige -> lint".
#   - Mais de 25 arquivos no diff: pula (provavel merge/rebase, nao edicao pontual).

$ErrorActionPreference = 'SilentlyContinue'

try {
    $payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
} catch {
    exit 0
}

if ($payload.stop_hook_active -eq $true) { exit 0 }

$alterados = @()
try {
    $alterados += (& git diff --name-only --diff-filter=ACMR HEAD -- '*.ts' '*.tsx' 2>$null)
    $alterados += (& git ls-files --others --exclude-standard -- '*.ts' '*.tsx' 2>$null)
} catch {
    exit 0
}

$alterados = $alterados |
    Where-Object { $_ -and (Test-Path $_) } |
    Where-Object { $_ -notmatch '^src/generated/' } |
    Select-Object -Unique

if ($alterados.Count -eq 0 -or $alterados.Count -gt 25) { exit 0 }

# Sem `--format compact`: o formatter saiu do core no ESLint 9.
# Sem `2>&1`: no PowerShell 5.1 redirecionar stderr de executavel nativo empacota
# cada linha em ErrorRecord e, com ErrorActionPreference silencioso, some com o texto.
$saida = & npx eslint @alterados
$codigo = $LASTEXITCODE

# 0 = limpo. 1 = erros de lint (bloquear). 2 = falha da propria ferramenta
# (config quebrada, formatter ausente): problema de tooling, nao do codigo.
# Nunca travar o turno por linter quebrado.
if ($codigo -ne 1) { exit 0 }

$texto = ($saida | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($texto)) { exit 0 }
if ($texto.Length -gt 4000) { $texto = $texto.Substring(0, 4000) + "`n... (truncado)" }

@{
    decision = 'block'
    reason   = @"
O eslint falhou nos arquivos alterados. Corrija antes de encerrar o turno:

$texto
"@
} | ConvertTo-Json -Depth 5 -Compress
exit 0
