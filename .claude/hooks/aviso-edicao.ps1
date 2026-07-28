# aviso-edicao.ps1 - PostToolUse: injeta lembretes apos editar arquivos-chave.
#
# Cobre tres pontos onde a omissao falha EM SILENCIO (sem erro, sem teste vermelho):
#   1. permissions-catalog / nav-config / seed -> sem `db:seed` o recurso nao existe
#   2. docs/manual/**.md                       -> search-index.json nao tem gerador
#   3. prisma/schema.prisma                    -> client desatualizado + seed defasado
#
# Silencio + exit 0 quando o arquivo nao e nenhum desses.
#
# NOTA: os textos usam here-string LITERAL (@'...'@) porque o conteudo tem crases;
# em here-string interpolada (@"..."@) a crase e escape do PowerShell e corrompe o texto.
# Manter tudo em ASCII: a saida do hook nao passa por UTF-8 confiavel no Windows.

$ErrorActionPreference = 'SilentlyContinue'

try {
    $payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
} catch {
    exit 0
}

$arquivo = $payload.tool_input.file_path
if ([string]::IsNullOrWhiteSpace($arquivo)) { exit 0 }

$avisos = New-Object System.Collections.Generic.List[string]

# --- 1. Catalogo de permissoes / navegacao / seed ------------------------
if ($arquivo -imatch 'permissions-catalog\.ts|nav-config\.ts|prisma[\\/]seed\.ts') {
    $avisos.Add(@'
[permissoes/navegacao] Voce alterou o catalogo de permissoes, a navegacao ou o seed.
- Rode `npm run db:seed` no dev (e idempotente) para materializar os registros de Permissao.
- O DEPLOY tambem exige `db:seed`: sem isso o recurso simplesmente nao aparece em producao.
- Se editou permissoes de um papel ja existente, chame `invalidatePermissions(role)`;
  a matriz fica em cache LRU por 10 minutos.
- Item novo em NAV_GROUPS precisa de `roles[]` correto e da flag de mobile.
'@)
}

# --- 2. Manual do usuario ------------------------------------------------
if ($arquivo -imatch 'docs[\\/]manual[\\/].*\.md$') {
    $avisos.Add(@'
[manual] Pagina do manual alterada.
`docs/manual/search-index.json` NAO tem gerador automatico: ele e lido por
`src/lib/manual.ts` mas nada o escreve. Atualize a entrada correspondente
(path, titulo, resumo) ou a pagina fica invisivel na busca do /ajuda.
Lembre que /ajuda e visivel para TODOS os papeis, cliente incluido.
'@)
}

# --- 3. Schema Prisma ----------------------------------------------------
if ($arquivo -imatch 'prisma[\\/]schema\.prisma$') {
    $avisos.Add(@'
[prisma] schema.prisma alterado.
- `npm run db:generate` para regerar o client em src/generated/prisma.
- Migration: se `prisma migrate dev` pedir reset, NAO aceite; use a skill /nova-migracao.
- Campo obrigatorio novo: atualize `prisma/seed.ts` mantendo a idempotencia.
- Relacao nova: o Prisma nao cria indice sozinho no lado da FK, adicione `@@index`.
'@)
}

if ($avisos.Count -eq 0) { exit 0 }

@{
    hookSpecificOutput = @{
        hookEventName     = 'PostToolUse'
        additionalContext = ($avisos -join "`n`n")
    }
} | ConvertTo-Json -Depth 5 -Compress
exit 0
