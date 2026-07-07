# Central do Desenvolvedor (`dev/`)

Menu do dia a dia do **lado DEV** do SenaHub. Complementa o `deploy/gerenciar-servidor.*`
(que é do lado **servidor/produção**). Tudo em pt-BR, sem acentos de propósito (encoding
do PowerShell 5.1 / console do Windows).

## Como abrir

- **Clique duplo** em `dev.bat` na raiz do projeto, ou
- No terminal, a partir da raiz: `dev` (ou `dev\gerenciar-dev.bat`).

Não precisa de permissão de administrador. O par de arquivos:

| Arquivo | Papel |
|---|---|
| `dev.bat` (raiz) | Atalho de 1 linha. |
| `dev/gerenciar-dev.bat` | Menu interativo (front-end). |
| `dev/gerenciar-dev.ps1` | Engine (lógica, chamada com `-Acao <nome>`). |

O cabeçalho do menu mostra a branch atual, quantos commits está à frente/atrás de `origin`
e se a árvore está limpa ou suja.

## O que tem

**Desenvolvimento**
- Iniciar dev (Next só — UI) / dev completo (chat + jobs + realtime, `dev:server`) — cada um
  abre em janela nova.
- Parar dev server (libera a porta 3000 e mata o `esbuild.exe`, que trava `node_modules`).
- Abrir `localhost:3000` no navegador.

**Qualidade**
- **Verificar tudo**: `lint` → `testes` → `build`, para no primeiro que falhar e diz em qual.
  Antes de buildar, detecta se o dev server está na `:3000` e oferece pará-lo (senão o `.next`
  em uso corrompe). Log em `logs/dev-verificacao.log`.
- Só testes / só lint / testar um arquivo ou nome específico.
- Corrigir build/deps corrompidos (para o dev server, apaga `.next`, opcionalmente `node_modules`,
  e roda `npm install`).
- Smokes e2e (onda1..5, ou todos) contra o banco de dev.

**Git e publicação**
- Status do repositório (ahead/behind descritivo).
- Commit rápido no padrão Conventional Commit pt-BR (`feat(escopo): descrição`).
- Push da branch atual (cria upstream se faltar).
- **Promover dev → produção**: verifica, leva a `dev` para `master` e publica.
  - *Direto*: `merge` em master + `push origin master` (dispara o deploy) + sincroniza de volta.
  - *Via Pull Request*: `push` da dev + abre o PR (`gh` se instalado, senão navegador).
  - Cada modo tem variante **SIMULAR (dry-run)** que imprime os passos sem alterar nada.
- Sincronizar `dev` com `master`.

**Banco (dev, porta 5433)**
- Migrar, gerar cliente Prisma, reaplicar seed, seed demo (destrutivo), resetar senha do admin,
  seeds de dev, Prisma Studio, status do banco.

**Versão / release** — prévia (dry-run), release patch/minor/major (`commit-and-tag-version`).

**Diagnóstico** — Doctor (checklist do ambiente: Node, `.env`, banco, portas, `node_modules`,
cliente Prisma, git), processos/portas, limpar caches.

## Notas

- Produção puxa `origin/master`; `dev` é a branch de desenvolvimento.
- Ações destrutivas pedem confirmação por palavra digitada (ex.: `SUBIR`, `APAGAR`, `RELEASE`).
- Auditoria do menu: `logs/dev-audit.log`.
- Referência do lado servidor: [`docs/DEPLOY.md`](../docs/DEPLOY.md).
