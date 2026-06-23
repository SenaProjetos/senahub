# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SenaHub is a custom ERP for a BIM engineering office — a from-scratch rebuild of an older
system (`..\SENAHub`). Modular monolith on Next.js 15 + React 19, deployed **natively on Windows**
(no Docker/WSL2/Redis/Nginx). Code is in English; **UI and commits are in Portuguese (pt-BR)**.
Project state and decision log live in [docs/HANDOFF.md](docs/HANDOFF.md) — read it before non-trivial
work for what each "Onda" (wave) delivered. It's a point-in-time snapshot (through Onda 5 + Estúdio v1);
newer per-feature work is tracked in dated specs/plans under [docs/superpowers/](docs/superpowers/).

## Commands

```bash
npm run dev          # Next only (Turbopack). NO Socket.io / NO pg-boss → chat & jobs do NOT work here
npm run dev:server   # full server.ts (Next + Socket.io + pg-boss) — use this for chat/realtime/jobs
npm run build        # next build --turbopack
npm start            # prod: tsx server.ts
npm run lint         # eslint
npm test             # vitest run (all *.test.ts under src/)
npx vitest run src/lib/ofx.test.ts        # single test file
npx vitest run -t "nome do teste"          # single test by name

npm run db:migrate            # prisma migrate dev
npm run db:generate           # prisma generate (also runs on postinstall)
npm run db:seed               # admin + permissions + catalogs (idempotent)
npm run seed:demo             # demo dataset (wipes business data, recreates; demo users senha Demo@2026)
npm run admin:reset-senha     # reset admin senha → SenaHub@2026 + force change
npm run smoke:onda1|onda2|onda3|onda3efg|onda4|onda5   # e2e smokes against the dev DB
```

- **Dev DB:** native PostgreSQL 17 on Windows, port **5433**, db `senahub_remake` (set `DATABASE_URL` in `.env`).
  Port 5432 is the OLD system's Docker — do not touch.
- **Never** run `next build` while `next dev` is active on the same `.next` (corrupts it; if it happens, delete `.next`).
- Server code (`server.ts`, seeds, scripts, smokes) runs via `tsx` with `tsconfig.server.json`, which
  shims `server-only` so it can run outside the Next bundler.
- **Tests** (`vitest.config.ts`) run in the **node** env (no jsdom) over `src/**/*.test.ts`, with `server-only`
  aliased to a stub (`src/test/server-only-stub.ts`) — so `queries.ts`/`service.ts` import fine under test.

## Architecture

```
src/
  app/                  # (auth)/login, (dashboard)/<módulo>/, api/ (only multipart / public-token / streaming)
  modules/<dominio>/    # queries.ts (server-only reads) · actions.ts ("use server") · service.ts · schemas.ts · *.test.ts
                        #   service.ts = pure business logic, shared by actions AND jobs-handlers (no Next/HTTP deps)
                        #   larger modules nest sub-feature folders (e.g. licitacoes/contrato, financeiro/folha)
  components/<dominio>/  # client components per module
  components/ui/         # shadcn — but on base-ui, NOT Radix (see gotcha below)
  lib/                   # cross-cutting: auth, session, permissions, with-action, audit, storage,
                         #   notificar/push, mail, jobs(+jobs-handlers), socket, cache, cep, ofx
                         #   utils.ts: cn() (Tailwind merge), brl/brlInteiro/formatarData/formatarDataHora
                         #   roles.ts: GLOBAL_ROLES, HR_ADMIN_ROLES, INTERNAL_ROLES, PROJETO_MEMBRO_ROLES, etc.
                         #   import/: csv.ts, planilha.ts (ExcelJS), mapeamento.ts, valores.ts — bulk import engine
                         #   storage.ts: resolverCaminho() anti-traversal (Windows STORAGE_BASE_PATH guard)
                         #   nav-config.ts: NAV_GROUPS with per-item roles[] + mobile flags
                         #   encargos.ts: INSS/IRRF progressive payroll calculator (pure, tested)
                         #   ofx.ts: OFX bank statement parser with dedup+auto-match (tested)
                         #   aprovacao.ts: devePassarPorAprovacao(tipo, valor, limite) for finance workflows
                         #   aging.ts: receivables/payables aging buckets (a_vencer…d120_mais, pure/tested)
                         #   aquisitivo.ts: CLT vacation accrual/concessive-window status (pure, tested)
                         #   ponto-offline.ts: localStorage queue for batidas made while online drops (client)
  generated/prisma/      # Prisma client output (import from here, NOT @prisma/client)
server.ts                # Next + Socket.io + pg-boss in ONE process
prisma/schema.prisma     # + prisma.config.ts (Prisma 7: datasource URL lives in the config, not the schema)
```

**`defineAction` (`lib/with-action.ts`) is the central pillar.** Every Server Action goes through this
chain: session → role gate → fine permission (`recurso:ação`) → Zod validation → execution → **automatic
audit** (`AuditLog`). Throw `new ActionError("msg")` for business errors whose message is safe to show the
user; any other throw becomes a generic message. Pattern:

```ts
export const minhaAcao = defineAction(
  { modulo: "licitacoes", recurso: "licitacoes", permissao: "gerir", schema: meuSchema },
  async (input, ctx) => { /* ... */ },
);
```

To capture before/after diffs in the audit log, pass `capturarAntes` returning the pre-mutation entity:

```ts
async (input, ctx) => { /* ... */ },
{ capturarAntes: async (input) => prisma.licitacao.findUnique({ where: { id: input.id } }) }
```

**Component naming convention:** `*-view.tsx` = full page component (owns filters/title/actions), `*-dialog.tsx` = modal form, `*-form.tsx` = reusable form, `*-button.tsx` = contextual action button. `components/ui/` has all shadcn primitives; don't re-add anything already there (confirm-dialog, empty-state, sortable-head, status-badge, etc.).

**Modules (25 total):** agenda, auditoria, auth, busca, chat, clientes, comercial, dashboard, documentos, financeiro, inputs, juridico, licitacoes, notificacoes, permissoes, planejamento, ponto, portal, projetos, qualidade, rh, suporte, tarefas, uploads, usuarios. The `portal` module is the read-only external client view scoped to `User.clienteId`; `inputs` handles public client intake forms (token-gated).

**List views:** Use `parseListParams(searchParams)` (`lib/list-params.ts`) to get `{page, skip, take, sort, dir, q}` ready for Prisma `skip/take/orderBy`. On the client, `useSetParams` updates URL search params and automatically resets `page` when any other filter changes.

**Auth & access control:**
- `better-auth` for sessions. `middleware.ts` does an *optimistic cookie check* only; real enforcement is in
  Server Components / actions via `requireUser` / `requireRole` / `requirePermission` (`lib/session.ts`).
- 8 roles (`admin, supervisor, administrativo, clt, estagiario, projetista_pj, freelancer, cliente`).
  `admin` bypasses all permission checks. Fine-grained matrix is data (`Permissao` table), cached per-role
  in an LRU for 10 min — call `invalidatePermissions(role)` after editing permissions. Catalog seed in
  `lib/permissions-catalog.ts`.
- Data scope: global roles (`admin`, `supervisor`) see everything; others are filtered (e.g. `escopoProjeto`
  in `modules/projetos/queries.ts`). RH actions gate on `HR_ADMIN_ROLES` (admin + supervisor + administrativo).
- **Auditing is mandatory on every mutation** — it's free via `defineAction`; don't bypass it.

**Realtime & jobs (only under `dev:server` / prod):**
- Socket.io shares the HTTP server and authenticates each connection with the same better-auth cookie
  (`lib/socket.ts`). Presence is in-memory (single-instance assumption).
- **`io`/presence live on `globalThis`, by necessity:** `server.ts` (tsx) and Next-bundled code (Server
  Actions/routes, webpack) load `lib/socket.ts` as *separate module instances*. Plain module-level vars
  would make `emitParaCanal` a silent no-op and `usuarioOnline` always-false from Server Actions. Always
  go through the existing accessors — don't reintroduce module-scoped `io`/`presenca`.
- `pg-boss` (queues + cron over the same PostgreSQL — replaces Redis/Task Scheduler) runs scheduled jobs
  defined in `lib/jobs.ts`, handlers in `lib/jobs-handlers.ts` (alerts, snapshots, weekly digest, backup).
- **Chat** is the live area on this branch (`modules/chat/`: `roles.ts`, `mencoes.ts`, `busca.ts`,
  `service.ts` shared by actions + socket). It needs `dev:server`; the auditoria/evolution plan is in
  `docs/superpowers/plans/2026-06-21-chat-auditoria.md`.

**Soft delete:** `Lancamento` reads are auto-filtered to `excluidoEm: null` via a Prisma client extension
in `lib/prisma.ts`. To see deleted rows, pass `excluidoEm` explicitly in the `where`.

**Estúdio (documentos) token system** (`modules/documentos/tokens.ts`) — pure engine, no I/O, tested heavily:
- Syntax: `[Campo]`, `[Fonte.Campo]`, `[Sum/Avg/Count/Min/Max(X)]`, `[= expr]`, `[Pagina]`, `[Grupo]`
- Format suffixes: `:c2` (currency), `:d` (date), `:p1` (percent), `:n0` (integer)
- `ContextoDados` shape: `{ escalar, linhas, linha, grupo, pagina }` — line-repeating sections use `linhas`
- Data source metadata lives in `modules/documentos/fontes-meta.ts` (pure, client-safe); server resolution in `fontes.ts`

**Planejamento CPM** (`modules/planejamento/caminho-critico.ts`) — pure forward/backward-pass critical-path algorithm on tarefas graph (predecessoras + datas). No Prisma dependency; WBS codes (1.2.3 format) and desvio/baseline exported to Excel via `GET /api/planejamento/[id]/eap-export`.

**Project health** (`modules/projetos/health.ts`) — pure `saudeProjeto(disciplinas, prazoFinal)` → `ok | atencao | critico` (returns `null` for non-`em_andamento`). Feeds the "Saúde" column in the projects list and the admin dashboard `CarteiraDashboard`. Same pattern as CPM/tokens: no I/O, unit-tested.

**Notificação categories:** `lib/notificar.ts` `notificar()`/`notificarMuitos()` accept an optional `categoria` param. Users may opt out per category; `filtrarPorCategoria()` in `modules/usuarios/preferencias/queries.ts` filters recipients before fan-out. Categories include `prazo_disciplina`, `inadimplencia`, `certidao`, `licitacao`, `digest_semanal`, `risco_projeto`, `lembrete_ponto`.

## Gotchas

- **Prisma 7:** client is generated to `src/generated/prisma` — import `{ PrismaClient }` from `@/generated/prisma/client`,
  never from `@prisma/client`. The `DATABASE_URL` lives in `prisma.config.ts`, not in `schema.prisma`.
- **shadcn on base-ui, not Radix:** triggers use `render={<Comp />}`, **not** `asChild`. `components.json`
  style is `base-nova`. Don't reach for Radix patterns.
- REST routes under `src/app/api/` exist only for multipart uploads, public-token endpoints, streaming, and
  health. Everything else is a Server Action — don't add CRUD REST endpoints.
- **PWA service worker (`public/sw.js`):** HTML/navigations are network-first (never serve stale pages);
  `/_next/static` is cache-first but **only stores responses with `Cache-Control: immutable`** — in `dev:server`
  (webpack) the same chunk URL changes content per rebuild and is *not* immutable, so caching it would serve a
  stale chunk and break hydration (`Cannot read properties of undefined (reading 'call')`). Bump `CACHE` to force
  a reset.
- Convention: code/identifiers in English, all user-facing strings in Portuguese, commits semantic + pt-BR.
- **`Select` `onValueChange`** returns `string | null`, not `string` (base-ui diverges from Radix here).
- **Env vars:**
  - Required: `DATABASE_URL`, `BETTER_AUTH_SECRET` (32+ bytes), `BETTER_AUTH_URL` (origin for CSRF), `APP_URL` (base URL for links in notifications/emails), `STORAGE_BASE_PATH` (Windows upload path, must exist), `CHROME_PATH` (Chrome exe for puppeteer-core PDF)
  - Optional: `ENABLE_BACKUP=1` + `BACKUP_PATH` + `PG_DUMP_PATH` (pg_dump.exe path), `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (web push), `SMTP_HOST` + `SMTP_PORT` + `SMTP_USER` + `SMTP_PASS` + `SMTP_FROM` (email)
