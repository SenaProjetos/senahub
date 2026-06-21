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

## Gotchas

- **Prisma 7:** client is generated to `src/generated/prisma` — import `{ PrismaClient }` from `@/generated/prisma/client`,
  never from `@prisma/client`. The `DATABASE_URL` lives in `prisma.config.ts`, not in `schema.prisma`.
- **shadcn on base-ui, not Radix:** triggers use `render={<Comp />}`, **not** `asChild`. `components.json`
  style is `base-nova`. Don't reach for Radix patterns.
- REST routes under `src/app/api/` exist only for multipart uploads, public-token endpoints, streaming, and
  health. Everything else is a Server Action — don't add CRUD REST endpoints.
- Convention: code/identifiers in English, all user-facing strings in Portuguese, commits semantic + pt-BR.
- **`Select` `onValueChange`** returns `string | null`, not `string` (base-ui diverges from Radix here).
- **Required env vars beyond DATABASE_URL:** `STORAGE_BASE_PATH` (Windows path for file uploads — must exist, anti-traversal enforced), `CHROME_PATH` (Chrome exe for PDF rendering via puppeteer-core). Optional: `ENABLE_BACKUP=1`, `BACKUP_PATH`, `PG_DUMP_PATH`, VAPID keys, SMTP vars.
