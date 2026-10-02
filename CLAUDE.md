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
npm run build        # scripts/build.mjs → next build --turbopack (com NODE_OPTIONS de heap)
npm start            # prod: tsx server.ts
npm run lint         # eslint
npm test             # vitest run (all *.test.ts under src/)
npx vitest run src/lib/ofx.test.ts        # single test file
npx vitest run -t "nome do teste"          # single test by name

npm run db:migrate            # prisma migrate dev
npm run db:generate           # prisma generate (also runs on postinstall)
npm run db:seed               # admin + permissions + catalogs (idempotent)
npm run seed:demo             # demo dataset (wipes business data, recreates; demo users senha Demo@2026)
npm run seed:documentos       # documentos na aba Arquivos, pela rota real de upload (exige dev server no ar)
npm run admin:reset-senha     # reset admin senha → SenaHub@2026 + force change
npm run smoke:onda1|onda2|onda3|onda3efg|onda4|onda5   # e2e smokes against the dev DB
npm run smoke:inputs-link     # link público de inputs: janela da notificação, revogação, expiração
npm run smoke:aviso-agendado  # aviso agendado: disparo do tick, claim anti-duplicata, cancelamento
npm run smoke:sync-pagamento  # pagamento de projetista: sync de valor/responsáveis, cancelamento, total do lote
npm run smoke:historico-documento  # histórico por documento: agrupamento atômico de acessos, corte de visibilidade, merge
npm run smoke:status-documento     # status documental automático: Enviado/Aprovado/Correção pela chave, revisão vigente, evento automático
npm run smoke:pastas-cliente       # pastas Compartilhado/Liberado para obra: revisão marcada na lista/árvore, contagem, validação desfeita
npm run smoke:recursos-eap    # EAP: herança, horas no motor, cards, carga/sobrecarga, custo previsto, Valor Agregado
npm run smoke:ponto-tarefa    # ponto com tarefa: lista curta, validação, edição do dia, apontado × previsto
npm run smoke:pagamento-fase  # pagamento por fase: pool congelado, write-back por diferença, SLA, marco → aprovar fase
npm run smoke:previsao-recebimento  # contrato por entrega: previsão no caixa, marco anda, faturar, fora do aging
npm run smoke:duplicar-projeto      # duplicar projeto com EAP: estrutura, IDs novos, cronograma em rascunho, o que NÃO copia
npm run smoke:modelo-disciplina     # modelos de EAP por disciplina: criar do modelo de projeto, "Gerar EAP das disciplinas", fases encadeadas
npm run smoke:apagar-eap            # apagar a EAP inteira (rascunho): o que impede, o que vai junto, o que fica
npm run smoke:planejador            # planejador de caixa: S0 = caixa da Visão geral, só pendente vira evento, transferência, parcial, leitura não grava; aplicar cenário tudo-ou-nada (obsoleto, regra no 3º, corrida); caixinhas, distribuição, recorrência, fora do resultado, lucros de sócio e folha quitando o previsto
npm run smoke:catalogo-nomenclatura # catálogo da versão: sigla que muda de dono (sinônimo/oficial), sair sem mexer em sigla, voltar escolhendo
npm run verify:motor-cronograma     # motor do cronograma contra os projetos reais do banco
```

- **Dev helper (Windows):** `dev.bat` (raiz) → *Central do Desenvolvedor* (`dev/gerenciar-dev.bat` + `.ps1`),
  menu pt-BR que envolve os scripts acima: **Verificar tudo** (lint+test+build com exit code real e guarda
  anti-`next dev` **desta pasta**), **Promover dev → produção** (merge direto ou via PR, com dry-run), status git
  (ahead/behind), commit Conventional, **Doctor** (checklist de ambiente), banco de dev, smokes e release.
  Espelha o `deploy/gerenciar-servidor.*` (que é do lado servidor). Auditoria em `logs/dev-audit.log`.
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
                         #   link-publico.ts: linkVigente({ativo, expiraEm}) — single rule for every
                         #     token link (arquivos + inputs); revoke = ativo:false, expiry = expiraEm
                         #   backup.ts (pg_dump -Fc) + backup-storage.ts (additive robocopy mirror of
                         #     STORAGE_BASE_PATH — the DB dump holds NO files); restore is the destructive
                         #     scripts/restaurar-backup.ts (menus call it), see docs/DEPLOY.md §8
                         #   aging.ts: receivables/payables aging buckets (a_vencer…d120_mais, pure/tested)
                         #   aquisitivo.ts: CLT vacation accrual/concessive-window status (pure, tested)
                         #   ponto-offline.ts: localStorage queue for batidas made while online drops (client)
                         #   dxf.ts: pure R12 (AC1009) DXF writer — mm units, Y-up CAD axes; base for ferramentas drawings (tested)
                         #   frase-do-dia.ts: deterministic daily quote (day-of-year → public/frases.json)
                         #   manual.ts: reads docs/manual/** (lerManifesto/listarSecoes/pathParaSlug) → in-app Ajuda
                         #   encryption.ts: AES-256-GCM reversible encryption for the Acessos credential
                         #     vault (pure, tested). Key from ACESSOS_ENCRYPTION_KEY, server-side only,
                         #     fails closed. Payload carries `keyVersion` so rotation stays possible.
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

To capture before/after diffs in the audit log, add `capturarAntes` **to the config object** (not as a
third argument) — it returns the pre-mutation entity:

```ts
export const minhaAcao = defineAction(
  {
    modulo: "licitacoes", recurso: "licitacoes", permissao: "gerir", schema: meuSchema,
    capturarAntes: async (input) => prisma.licitacao.findUnique({ where: { id: input.id } }),
  },
  async (input, ctx) => { /* ... */ },
);
```

**Component naming convention:** `*-view.tsx` = full page component (owns filters/title/actions), `*-dialog.tsx` = modal form, `*-form.tsx` = reusable form, `*-button.tsx` = contextual action button. `components/ui/` has all shadcn primitives; don't re-add anything already there (confirm-dialog, empty-state, sortable-head, status-badge, etc.).
`DialogContent` caps itself at `calc(100svh-2rem)` and scrolls; for a long form wrap the fields in `DialogBody` so the header, the close X and `DialogFooter` stay pinned while only the fields scroll — and break optional groups into `CollapsibleSection` (`components/ui/collapsible.tsx`), passing `resumo` whenever a collapsed section can hide a non-default state.

**Page header and screen layout** (plan `docs/superpowers/plans/2026-09-25-area-util-celular.md`): every dashboard page opens
with `CabecalhoPagina` (`components/shell/cabecalho-pagina.tsx`) — title, ONE short description sentence and at most two
compact actions (the rest in a `BotaoAcoes` ⋯) — never the old `<h2 className="text-2xl font-extrabold">` title block. From
`xl` it fuses into the top bar, so it must be the **first element of the page**: a hint, sub-tabs or a layout-level bar
before it gets overlapped (render them after it, e.g. via a `subnav` prop). If title + actions don't fit (menu open, many
actions), `AjusteCabecalho` drops it to its own line. The description is truncated in the bar: never put links, buttons or
alerts in it — render those on a line right after the header. Rows of buttons/filters need `flex-wrap`; grid tracks that
hold tables use `minmax(0,1fr)`; list/board/viewer screens fill the viewport height and scroll inside. Touch sizing is
automatic (`pointer-coarse:` in Button/Input/Select, 16 px fields on touch in `globals.css`) — don't override it. A screen
is done only when, at 390×844, `document.documentElement.scrollWidth` is 390 and, at 1366×768 with the menu **open**, the
header doesn't overlap the top bar. Some files still use the old title (grep `text-2xl font-extrabold tracking-tight`): migrate them when you touch
them. Comercial pages render `NavComercial` right AFTER their header (the layout no longer draws it).

**Modules (34 total):** agenda, arquivos, auditoria, auth, busca, chat, clientes, comercial, configuracoes, coordenacao, dashboard, documentos, documentos-cliente, dwg, engenharia, ferramentas, financeiro, inputs, juridico, legal, licitacoes, notificacoes, patrimonio, permissoes, planejamento, ponto, portal, projetos, qualidade, rh, suporte, tarefas, uploads, usuarios. `coordenacao` = BIM/compatibilização (see below). The `portal` module is the read-only external client view scoped to `User.clienteId`; `inputs` handles public client intake forms (token-gated). `patrimonio` covers both Patrimônio (assets, `/patrimonio`) and the TI submodule (machines, `/patrimonio/ti`, gated `patrimonio:ti`). `legal` (Termos de Uso, see below) is a separate concern from `juridico` — don't confuse them. Note: the `juridico` *module folder* is `actions.ts`-only, but the `/juridico` **route is a full feature** (DocumentoJuridico + versões/aceites, Certidao, ModeloContrato) whose reads live inline in `page.tsx` + `components/juridico/`, not in a `modules/juridico/queries.ts`. The 5 modules beyond the original 29: `arquivos` (file-access/scoping helpers, re-exports `escopoProjeto`; backs the `/arquivos` diretório + aprovações), `dwg` (DWG→DXF pipeline mirroring coordenação's IFC one — own `ConversaoDesenho` model + web viewer, triggered from the same `/api/uploads` route), `documentos-cliente` (client-facing document repository — distinct from the `documentos` Estúdio), `engenharia` (Padrões & Normas técnicas, gated `biblioteca_tecnica`; distinct from `ferramentas`), `configuracoes` (thin — email-template config under `emails/`).

**List views:** Use `parseListParams(searchParams)` (`lib/list-params.ts`) to get `{page, skip, take, sort, dir, q}` ready for Prisma `skip/take/orderBy`. On the client, `useSetParams` updates URL search params and automatically resets `page` when any other filter changes.

**Context menu, `...` and bulk actions** ([ADR-0002](docs/adr/0002-menu-de-contexto.md)): every list/card that gets a
right-click (long-press on touch) menu follows one pattern. A **pure descriptor** `itensDe<Entidade>()` in the module
(`modules/<dominio>/acoes*.ts`, unit-tested, no React) returns `AcaoItem[]` (`ui/acoes.ts`: data with an `id`, no callbacks);
a thin screen shell maps each `id` to the existing Server Action. The **same array** feeds `LinhaComMenu` (context menu),
`BotaoAcoes` (the `...`, keyboard-reachable — every menu action MUST also be in it) and `BarraSelecao` (bulk bar).
Profile-forbidden items are *omitted*; state-forbidden items are *disabled with the reason text* (same sentence as the server's
`ActionError`); a row with a single action gets no menu. Destructive items need a confirm — always `await confirm()` **before**
`startTransition`. Bulk = `useSelecao` (selection crosses filters/pages, cleared on reload) + `useLote` (repeats the per-item action
client-side, cap 100, count in the confirm, partial-failure report). **Never hand-write a `contextmenu` handler** — only
`ui/context-menu.tsx` may (a guard test scans `src/`, comments included). Row components must not be defined *inside* the parent
(they remount every render and close the open menu): use render functions/top-level components with a `key`.

**Auth & access control:**
- `better-auth` for sessions. `middleware.ts` does an *optimistic cookie check* only; real enforcement is in
  Server Components / actions via `requireUser` / `requireRole` / `requirePermission` (`lib/session.ts`).
- 9 roles (`admin, supervisor, administrativo, clt, estagiario, projetista_pj, freelancer, cliente, ti`).
  `ti` is the IT role gated to `patrimonio:ti` (machines). `admin` bypasses all permission checks. Fine-grained matrix is data (`Permissao` table), cached per-role
  in an LRU for 10 min — call `invalidatePermissions(role)` after editing permissions. Catalog seed in
  `lib/permissions-catalog.ts`.
- Data scope: global roles (`admin`, `supervisor`) see everything; others are filtered (e.g. `escopoProjeto`
  in `modules/projetos/queries.ts`). RH actions gate on `HR_ADMIN_ROLES` (admin + supervisor + administrativo).
  `podeVerTudo(u)` (`roles.ts`) also lets a **sócio** (`User.ehSocio`) read like a supervisor — read-only floor,
  never use it for write/destructive gates.
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

**`Lancamento.status = previsao`** (F7.2) is a receivable FORECAST from the cronograma (client contract
billed per delivery, `ContratoParcelaEntrega`), not a receivable. Readers that filter `previsto` ignore it by
design; only the planner engine (`baseDoPlanejador` → `projetar`) reads it, as an Estimada event outside the
Provável line. A new receivable reader WITHOUT a status filter must exclude it
(`status: { not: "previsao" }`). "Faturar" converts the same row to `previsto`; the sync
(`juridico/contrato/previsao-service.ts`) only ever touches `previsao` rows.

**Cash planner / liquidity engine** (`modules/financeiro/liquidez/`, in progress on `feat/planejador-financeiro`).
Contract: `docs/superpowers/specs/2026-09-30-planejador-financeiro.md` (wins over the phase plan); vocabulary in
`CONTEXT.md` → Financeiro; ADRs 0007–0009. Invariants that every phase keeps:
- **Status ≠ confidence** (ADR-0007): `Lancamento.status = confirmado` means *realized* (cash/DRE);
  `Lancamento.confianca` (`confirmada_cliente | provavel | estimada | incerta`) is a belief about a *pending*
  receivable, read only by the engine. Never map one onto the other; UI says "Pago"/"Recebido" for realized and
  "Confirmada pelo cliente" for the confidence level.
- **The engine only receives pending events** (`previsto`, `aguardando_aprovacao`, `previsao`; later scheduled
  recurrences and simulated items) and starts from S0 = `saldoBase()` — the same function `fluxoCaixa()` uses, so
  the planner and the Visão geral never show two different balances. A realized row never becomes an event.
- **Category nature** (`CategoriaFinanceira.natureza`: `resultado | fora_do_resultado | transferencia`, ADR-0008,
  `modules/financeiro/natureza.ts`): `foraDoResultado` = not in the DRE but still cash; transfer legs (paired by
  `Lancamento.transferenciaId`) move each day's balance but never enter totals; the Meu Dinheiro importer sets both
  (`naturezaPeloNome`, `transferenciaIdDoHash`). Code finds system categories by `CategoriaFinanceira.chave`
  (stable), never by the editable `codigo`.
- **Caixinha math** (`caixinhas.ts`): a payment covered by a caixinha lowers reserved and cash together, so free
  cash never drops twice; free cash is never negative — the shortfall is `descoberto`.
- The pure files (everything but `queries.ts`) must not import Prisma/server-only/Next — a guard test scans them,
  because the engine also runs in the browser for instant simulation. Money in integer cents, dates as
  `YYYY-MM-DD` strings. The partial-payment remainder copies the planner fields via `camposDoPlanejador()`
  (`lancamentos/parcial.ts`) — any new code path that splits or clones a `Lancamento` must do the same.
- **Caixinha = calculated, never stored** (`financeiro/caixinhas/`, F4): reserved = `max(0, alocado − usado)`, where
  alocado is the SUM of signed `MovimentoCaixinha.valor` (transfer = two legs, sum zero) and usado is the realized
  despesas with `Lancamento.caixinhaId` since the caixinha's creation day and up to today (`calculo.ts`, pure). No hook
  in the payment paths: paying a linked bill just lowers cash and reserved together. A caixinha only changes on an
  OPEN despesa (`definirCaixinhaLancamento` / `ALTERAR_CAIXINHA`); a paid one is fixed with an `ajuste` movement.
  Archive only with reserved zero and no open linked bill. Initial 9 caixinhas come from the migration by `chave`.
- **Partner withdrawals** (`financeiro/socios/`, F6B): "Distribuir lucros" splits a total by each active
  partner's `Socio.percentual` (basis points, leftover cent on the last) and creates ONE previsto
  `Lancamento` per partner with `socioId`, in category `distribuicao_lucros` / `adiantamento_lucros`
  (created by migration, found by `chave`, `fora_do_resultado` + DFC `financiamento`). It refuses when the
  active partners' percentages do not add to 100% — normalizing silently would hide a cadastro mistake.
  Pró-labore is NOT this: it is a `resultado` expense (2.08) and lives in Compromissos recorrentes.
- **One filter for nature, in every money query** (F6C, spec §8): `SO_RESULTADO` and `SEM_TRANSFERENCIA`
  (`modules/financeiro/natureza.ts`, plain objects — the file stays pure) are the only way to apply it.
  DRE/KPIs/margin/profitability/budget/closing use `SO_RESULTADO`; DFC, aging and the gerencial balance use
  `SEM_TRANSFERENCIA`. A new `prisma.lancamento.findMany|aggregate|groupBy` in those files without one of
  them (or a `natureza-ok:` comment with the reason) fails `relatorios/natureza-nas-consultas.test.ts`.
  The livro caixa tells a transfer by `categoria.natureza`, never by the category NAME.
- **Recurring commitments are a REGISTRY, not bills** (`financeiro/recorrencia/`, F6A, ADR-0009): a
  `CompromissoRecorrente` makes the planner project each month with no linked `Lancamento` as a `programado`
  event (id `prog:<id>:<YYYY-MM>`, never adjustable — it is not a lançamento yet); the daily job (and the
  "Gerar agora" button) creates the real `Lancamento` once the due date is within `antecedenciaDias`.
  Idempotency is the DB's: `@@unique([recorrenciaOrigemId, recorrenciaCompetencia])` — a month with a linked
  lançamento (even cancelled) is never projected nor generated again, and P2002 is the expected outcome of a
  race, not an error. A linked lançamento's VALUE wins; the difference becomes a warning, never a correction.
  Without a link both count on purpose (safe side) and the planner warns "possível … em dobro". The partial
  remainder inherits sócio but NOT the link (`camposDoPlanejador`), or the unique key would break.
- **Distribution only reserves** (`financeiro/distribuicao/`, F5): a `RegraDistribuicao` SUGGESTS a split in basis points
  (must close exactly 10000; `null` caixinha = "Operacional (livre)", which moves nothing). Confirming a realized receita
  in "Recebimentos a distribuir" writes ONE `DistribuicaoRecebimento` (unique per lançamento — that row is what takes it
  out of the queue and makes two simultaneous confirmations safe) plus one `alocacao` movement per caixinha, pro-rata
  with the leftover cent on the last item (`calculo.ts`, pure). It never creates or edits a `Lancamento`. Eligibility is
  one pure function (`elegivelParaDistribuir`): realized, nature `resultado`, no `reembolso-art` tag, received since
  `financeiro.liquidez.distribuirDesde` (null = nothing offered). `ALOCAR` in the planner only simulates (motor
  `alocacoesSimuladas`) and is never applied.
- **Simulation never writes; "Aplicar ao financeiro" is all-or-nothing** (spec §7). One ajuste format for the
  screen, the browser draft and the saved scenario (`liquidez/ajustes.ts`, Zod). Each ajuste on a lançamento
  carries the `antes` snapshot of the observed fields (`Observado`, raw values — not the effective ones); the
  pure `validarAplicacao` (`liquidez/aplicacao.ts`) lists EVERY divergent ajuste and the service
  (`planejador/cenarios/service.ts`) writes inside one transaction with `updateMany` conditioned on `antes`
  (`count ≠ 1` rolls back). Several ajustes on one lançamento become ONE write. Creating goes through
  `criarLancamentoNoTx` (`lancamentos/service.ts`, same rules as `criarLancamento`) — never a bare
  `lancamento.create`. MVP applies only date, priority, confidence and new movements with a category.
- **ONE projection in the system** (F7): the Visão geral (`liquidez/torre.ts` + `torreDeControle()`) and the
  daily cash flow (`caixa/diario.ts` + `fluxoDiario()`) both run `projetar()` — the weekly `projecaoCaixa`
  and `FluxoProjecaoChart` were DELETED, so no screen can show a second cash number. The Visão geral runs the
  engine twice (Provável = `provaveis`, Conservador = `confirmadas`) and the cronograma forecast
  (`status: "previsao"`, Estimada) is deliberately OUT of both lines: it shows up as its own alert with
  "Incluir na simulação" (I2). In the daily flow, before today is realized (by `dataConfirmacao`) and from
  today on is the chosen scenario; the past accumulated balance is rebuilt BACKWARD from today's cash
  (`caixaAtual − what was realized after that day`), so both halves meet exactly at `saldoBase()`.
- **Closing the CLT payroll SETTLES the month's forecast** (`rh/folha/fechamento-service.ts` + pure
  `quitacao.ts`, F6D): `fecharFolha` reuses the competência's `previsto` folha bill (the one the recurrence
  generated, or a manual one) with the real net value instead of creating a second expense — otherwise the
  month carried both and the projection lost the payroll twice. Which one is a pure decision: only `previsto`
  is eligible (settling an `aguardando_aprovacao` would pay around the approval), the recurrence link wins,
  a lone candidate is taken, and two unlinked candidates settle NOTHING (the closing creates its own and the
  result's `aviso` names what stayed open). Only the `mensal` folha settles — the 13º has its own folha in the
  same month. Reopening undoes it by `lancamentoReaproveitado`: a bill that already existed goes back to
  `previsto` with `lancamentoValorPrevisto`; only a bill the closing created is deleted. `RetiradaSocio` is
  frozen as history — it never became a `Lancamento`, so `criarRetiradaSocio` refuses and points to the
  recurrence (pró-labore) or to Distribuir/Adiantar lucros.

**Projetista paid per phase** (F7.4, `PagamentoProjetista.etapaId`): "already paid" means
`situacaoPagamento().jaLiberouTudo` (every phase released) — never "has any payment" (`_count.pagamentos > 0`),
which is true after the first phase and hides the rest. Pure rules in `uploads/pagamento-fase.ts`.

**Estúdio (documentos) token system** (`modules/documentos/tokens.ts`) — pure engine, no I/O, tested heavily:
- Syntax: `[Campo]`, `[Fonte.Campo]`, `[Sum/Avg/Count/Min/Max(X)]`, `[= expr]`, `[Pagina]`, `[Grupo]`
- Format suffixes: `:c2` (currency), `:d` (date), `:p1` (percent), `:n0` (integer)
- `ContextoDados` shape: `{ escalar, linhas, linha, grupo, pagina }` — line-repeating sections use `linhas`
- Data source metadata lives in `modules/documentos/fontes-meta.ts` (pure, client-safe); server resolution in `fontes.ts`

**Planejamento (motor de cronograma, MS Project)** (`modules/planejamento/`) — replaced the old `caminho-critico.ts`.
Spec + 42 decisions: `docs/superpowers/specs/2026-09-23-planejamento-motor-cronograma.md`. Layered like ferramentas:
- `motor.ts` — pure `agendar()`: forward/backward pass on the working-day calendar (`lib/calendario-trabalho.ts`,
  holidays), FS/SS/FF/SF + lag, the 6 restrictions, float/critical path, rollup (% weighted by hours). `agenda.ts`
  is the I/O: `planoDoProjeto` (read, never writes) / `reagendarProjeto` (writes). Since L1 the motor READS real dates
  (D6: done = real dates, started = real start, links no longer bind them) and, given the project's Data de Status,
  reschedules unfinished work to the next working day after it (MS Project's "reschedule uncompleted work"); % without
  real dates follows Project (>0 = started at the computed start, 100 = done). The baseline never moves, so "atrasada"
  (`qualidade.ts`) is measured against the baseline finish (`fimReferencia`), not the rolled forecast. Anyone
  re-running `agendar` on `plano.entrada` must pass `plano.dataStatus` too (see `sugestoes-recursos.ts`).
- `service.ts` — approval freezes `BL-00` (baseline versions, never overwritten), replan, quality verifier
  (`qualidade.ts`), health (`saude.ts`). `EapAtribuicao` = person or perfil with hours (`recursos.ts`, pure).
- Every EAP mutation calls `aposMudarEap` (card sync D24/D32 + receivable forecasts). `custo.ts`: hours ×
  `Recurso.custoHora`, unknown never becomes zero, only for `podeVerFinanceiro`, frozen in the baseline (VP of F8).
- WBS codes and desvio/baseline exported to Excel via `GET /api/planejamento/[id]/eap-export`.
- **Every EAP mutation reschedules** (`aposMudarEap` in `planejamento/actions.ts` → `reagendarProjeto`, then card
  and receivable sync): durations are WORKING days typed in the editor (`edicao-linha.ts` rules), dates are the motor's
  and the DTO shows the motor's. `scripts/converter-duracao-eap.ts --gravar` must run once on deploy (F0 stored
  calendar-day durations).
- **Every new EAP row needs its permanent `idCorporativo`** (`id-corporativo.ts` → `reservarIdsParaLinhas`, atomic
  counter `EapSequencia`, one prefix per `tipoEap`): `criarEapTarefa`, `gerarEapDasDisciplinas` and
  `duplicarProjetoNoBanco` do it; a bare `prisma.eapTarefa.create` leaves the identity null and
  `verify:motor-cronograma` flags it. Duplicating a project copies the EAP *structure* only (`projetos/duplicar-eap.ts`,
  pure): not progress, real dates, restrictions (absolute dates), bloqueio, hours or people; the new schedule is a draft.

**Project health** (`modules/projetos/health.ts`) — pure `saudeProjeto(disciplinas, prazoFinal)` → `ok | atencao | critico` (returns `null` for non-`em_andamento`). Feeds the "Saúde" column in the projects list and the admin dashboard `CarteiraDashboard`. Same pattern as CPM/tokens: no I/O, unit-tested.

**Ferramentas (engenharia)** (`modules/ferramentas/`) — calculators + drawing/memory generators following NBR norms. Layered, mostly pure:
- `registry.ts` — client-safe catalog (`FerramentaMeta[]`). **Keys are stable — never rename a published key** (breaks historic saves; `entradasJson.ferramenta` references it). `types.ts` holds shared `Disciplina`/`TipoFerramenta`/`FormatoExport`/`ResultadoBase`.
- `calc/` — one pure engine per tool (beam flexure/shear/deflection, column, footing, pile-SPT, punching, rebar-anchorage, wind-force, unit-convert, …), each `*.test.ts`-covered. No I/O.
- `dxf/` — per-tool drawing builders on top of `lib/dxf.ts`. `memoria/` — calc-memory renderers (`render-docx|html|xlsx`).
- `service.ts` (shared logic), `savefile.ts`/`auto-store.ts` (persisting snapshots), `export-util.ts`, `guia-meta.ts` (illustrated guide). Design/rollout specs under `docs/superpowers/` (`ferramentas-f0/f1/f2`).

**Coordenação BIM (`modules/coordenacao/`)** — federated IFC viewer + 3D coordination issues + BCF export, on the **Coordenação** tab of a project (`/projetos/[id]/coordenacao`, gated `coordenacao:ver`/`gerir`). Layered like ferramentas:
- **Conversion pipeline:** each uploaded `.ifc` (hook in `/api/uploads/route.ts`) enqueues a pg-boss job (`converter-ifc`, the system's FIRST on-demand `boss.send()`) → `scripts/converter-ifc.ts` runs headless in a **child process** (`@thatopen/fragments` IfcImporter, web-ifc WASM) writing a `.frag` next to the upload (`{disc}/COORDENACAO/{uploadId}.frag`). State machine is pure+tested (`conversao-estado.ts`); orchestrator `conversao.ts` (injectable spawn). `ConversaoModelo` (1:1 Upload) holds status/path. **Jobs only run under `dev:server`/prod** — in `npm run dev` conversions sit in `fila` with no worker. NOTE: `boss` lives on `globalThis.__senahubBoss` (same tsx↔webpack split as `lib/socket.ts`) — read via `getBoss()`/the globalThis accessor, never a module-level var.
- **Viewer (`viewer/engine.ts`)** — CLIENT-ONLY adapter confining ALL three.js/`@thatopen/fragments` API (churn containment); React talks only to it. Behind `next/dynamic({ssr:false})` (`viewer-3d.tsx`) so the 3D stack stays out of the initial bundle. Worker at `public/fragments-worker.mjs` is a **copy** of the lib's worker — recopy on package upgrade (like pdf.worker). `.frag` served by streaming route `/api/coordenacao/frag/[uploadId]` (ETag per conversion).
- **Apontamentos (3D issues)** — mirror `Pendencia`: `ApontamentoCoordenacao` (denormalized, no FK) anchored to IfcGuids + camera (persisted in **IFC space**, Z-up), numbered per-project, workflow aberta|resolvida|fechada|descartada, spawn one Tarefa with a TarefaItem each (`enviarApontamentosCoordenacao`). Snapshot PNG via multipart route (`/api/coordenacao/snapshot`). Deep-link `?apontamento=N` restores camera+selection. Notifications use categoria `coordenacao`.
- **BCF 2.1 export (`bcf/writer.ts`)** — pure, tested XML writer (like `lib/dxf.ts`): `bcf.version` + `{TopicGuid}/markup.bcf` + `viewpoint.bcfv` (+ `snapshot.png`), zipped via `archiver` in `bcf/exportar.ts`, served by `/api/coordenacao/bcf`. Camera vectors (direction/up) derived in the writer from position+target (viewer never rolls). `viewer/coords.ts` = pure three↔IFC axis conversion (Y-up↔Z-up), tested. Export-only in v1 (`bcfGuid` stored on each apontamento for future round-trip import).

**Comercial / CRM (`modules/comercial/`)** — reforma F0-F7 **concluída** em 2026-09-02 (ver
`docs/crm/06-progresso.md`, entrada mais recente). `docs/crm/` é o registro histórico da decisão:
`00-auditoria.md` (o que existia antes) → `01-decisoes.md` (22+ ADRs) → `02-schema.md` (schema
alvo) → `03-migracao.md` (migração) → `04-plano-fases.md` (backlog fechado), `99-playbook.md` (regras
por tarefa), `08-aceite-e2e.md` (os 20 critérios de aceite, cobertos por `smoke:crm-e2e`). Supersede
`docs/concluidos/specs/2026-07-24-crm-comercial-roadmap.md`. Estado atual: `Lead` (prospecção) e
`Negociacao` (negociação) são entidades separadas de propósito, com `service.ts` central, cobertura
de testes ampla no módulo, e `Oportunidade` (o model órfão antigo) já removido. A UI atual (branch
`feat/funil-comercial`, 2026-09-18/19) é um **funil único** em `/comercial/funil` — as rotas
`/prospeccao` e `/negociacoes` só redirecionam —, com ficha do card em modal (`?card=TIPO:id`),
toolbar fixa (`comercial/layout.tsx`), follow-ups em calendário e **proposta externa** (PDF por
versão, sem link público, `Proposta.externa`). Decisões: `docs/adr/0004-funil-comercial-unico.md`
e `docs/adr/0005-proposta-externa.md`; plano e desvios em
`docs/superpowers/specs/2026-09-16-comercial-funil-unico.md`.

**Proposta composta** (`modules/comercial/proposta-composta/`, ADR-0006, plano em
`docs/superpowers/specs/2026-09-19-proposta-composta.md`) — a proposta montada NO sistema: modelo +
biblioteca de cláusulas (`ClausulaProposta`, variante por UF/disciplina, mantida só por
`comercial:modelos`) + plano de pagamento em **percentual** (`PropostaParcela`; valor e extenso são
calculados, nunca gravados). `Proposta.formato` (`legado | externa | composta`) substituiu o
booleano `externa`, que ainda existe com escrita dupla até a migração de contração (o `DROP COLUMN`
sai num deploy posterior). Camadas: regras puras testadas (`lib/extenso.ts`, `parcelas.ts`,
`clausulas.ts`, `campos.ts`, `modelos.ts`, `documento.ts`), `service.ts`/`actions.ts` com I/O, e o
documento renderizado pelo Estúdio em **faixas em fluxo** (`Banda.fluxo`, `modelo-documento.ts`) — a
rota pública `/a/proposta/[token]` tem um ramo próprio por `formato`, e documento com impedimento
(plano ≠ 100%, empresa não configurada, campo em branco citado) **não é publicado**. Gotchas: a
semente é create-only por slug (corrigir cláusula publicada = slug `-v2`, nunca editar o texto da
semente); o `doc-render` suporta UMA banda de detalhe por modelo; token em caixa errada passa no
bloqueio de contratos mas resolve vazio (a composta fecha esse buraco, contratos não). Verificações:
`npm run smoke:proposta-composta`, `npm run verify:documento-proposta` (renderiza no Chrome).
"Nova proposta" abre a composta em todos os pontos de entrada; o editor antigo virou "Proposta
simples".

**Termos de uso (legal)** (`modules/legal/termos.ts`) — single source of truth for the on-screen acceptance text, by `TipoTermo` (`colaborador | cliente`). Pure (no `server-only`): RSC reads it, passes text to a client form; the server hashes (SHA-256) the accepted text as proof in `actions.ts`. Bump `versao` to force everyone to re-accept. `docs/legal/*.md` is the rich/print version for legal review — keep both in sync. (Spec: `docs/concluidos/plans/2026-06-23-termo-aceite.md`.)

**Histórico de versões (`/versoes`):** changelog versão a versão, lido em runtime do
`CHANGELOG.md` da raiz por `lib/changelog.ts` (`parseChangelog` puro + testado). O arquivo é
regerado pelo `commit-and-tag-version` no `npm run release` — a página se atualiza sozinha a
cada publicação, sem passo de build. Rota gated em `INTERNAL_ROLES` (é linguagem de commit);
o rótulo de versão no rodapé do sidebar linka pra ela quando `nav.tipo === "interno"`. A
versão em linguagem de usuário continua em `docs/manual/novidades.md` → `/ajuda/novidades`.

**Ajuda / Manual (in-app):** the `/ajuda` route (+ `[...slug]` catch-all) renders the user manual straight from `docs/manual/**` markdown via `lib/manual.ts` (`lerManifesto`/`listarSecoes`/`pathParaSlug`) + `react-markdown`. No DB — edit the markdown to change the docs. Visible to **all** roles (no `roles[]` on the nav item, cliente included). Keep `docs/manual/` current when features change.

**Cross-module pages (not their own module folder):** `/recursos` = resource-allocation matrix built from `modules/planejamento/queries.ts` (`matrizRecursos`, `cargaSemanalPorRecurso`) + `modules/rh/habilidades/queries.ts`, gated `recursos:ver`/`recursos:gerir`.

**Notificação categories:** `lib/notificar.ts` `notificar()`/`notificarMuitos()` accept an optional `categoria` param. Users may opt out per category; `filtrarPorCategoria()` in `modules/usuarios/preferencias/queries.ts` filters recipients before fan-out. Categories include `prazo_disciplina`, `inadimplencia`, `certidao`, `licitacao`, `digest_semanal`, `risco_projeto`, `lembrete_ponto`, `coordenacao`, `aprovacao_arquivo`, `aprovacao_disciplina`, `input_cliente`.

## Gotchas

- **Prisma 7:** client is generated to `src/generated/prisma` — import `{ PrismaClient }` from `@/generated/prisma/client`,
  never from `@prisma/client`. The `DATABASE_URL` lives in `prisma.config.ts`, not in `schema.prisma`.
- **No `Promise.all` on a transaction client:** a `$transaction` has ONE connection; `Promise.all([tx.a…, tx.b…])`
  fires concurrent queries on it (deprecated in `pg`, breaks in pg@9). Await them one by one. A guard test
  (`lib/promise-all-em-transacao.test.ts`) scans `src/`.
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
- **Fullscreen API hides portals:** dialogs/menus/selects/popovers/tooltips portal to `body` and open *invisible*
  behind an element in fullscreen. Wrap the fullscreen subtree in `PortalContainerProvider container={el}`
  (`components/ui/portal-container.tsx`, read by all six primitives) while it is fullscreen — as `pdf-viewer.tsx` does.
  `useConfirm()` renders at the app root and still hides there: use a local `Dialog` inside the subtree.
- **Env vars:**
  - Required: `DATABASE_URL`, `BETTER_AUTH_SECRET` (32+ bytes), `BETTER_AUTH_URL` (origin for CSRF), `APP_URL` (base URL for links in notifications/emails), `STORAGE_BASE_PATH` (Windows upload path, must exist), `CHROME_PATH` (Chrome exe for puppeteer-core PDF), `ACESSOS_ENCRYPTION_KEY` (**exactly** 32 bytes base64 — AES-256-GCM key for the Acessos credential vault; `lib/encryption.ts` throws at first use if absent or wrong length, and never falls back to plaintext. Losing it makes every stored credential unrecoverable — the DB dump alone does not restore them)
  - Optional: `ODA_CONVERTER_PATH` (**ODAFileConverter.exe** — external app, not an npm package; without it every DWG→DXF conversion fails, see `docs/DEPLOY.md` §4.1), `ENABLE_BACKUP=1` + `BACKUP_PATH` + `PG_DUMP_PATH` (pg_dump.exe path) + `STORAGE_BACKUP_PATH` (storage mirror target, defaults to `BACKUP_PATH\storage`) + `PG_BIN_PATH` (Postgres bin dir, used by the restore script to find `pg_restore.exe`), `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (web push), `SMTP_HOST` + `SMTP_PORT` + `SMTP_USER` + `SMTP_PASS` + `SMTP_FROM` (email), `AUTH_COOKIE_PREFIX` (dev only — session-cookie name per worktree, letters/digits/`-`/`_`; unset = better-auth default, so production is unchanged; changing it invalidates that server's open sessions; `src/lib/auth-cookie.ts`)

## Agent skills

### Issue tracker

Issues live as GitHub issues on `SenaProjetos/senahub`, driven by the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, each label string equal to its name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root — both exist since 2026-09-09. See `docs/agents/domain.md`. Note the two ADR series: `docs/adr/000N-slug.md` is the current convention; `docs/manual/decisions/ADR-00N-*.md` is the legacy one and still valid.

## Parallel worktrees (one per IDE)

Two agents work this repo at the same time, like two separate developers. Identify yours by the
**folder you are in** — never by the environment: the Claude Code extension in Antigravity reports
itself as "VSCode".

| IDE | Folder | Branch | Port | Dev DB (5433) |
|---|---|---|---|---|
| Antigravity | `SENAHub-remake` (main) | `dev-antigravity` | 3000 | `senahub_remake` |
| VS Code | `SENAHub-remake-vscode` (worktree) | `dev-vscode` | 3001 | `senahub_remake_vscode` |

- Work only in your own folder, branch and database; never touch the other agent's.
- `.env` is untracked and differs per worktree (`DATABASE_URL`, `PORT`, `APP_URL`, `BETTER_AUTH_URL`,
  `STORAGE_BASE_PATH`) — never copy one over the other. Wrong `BETTER_AUTH_URL` breaks login (CSRF). Give each a distinct
  `AUTH_COOKIE_PREFIX` (e.g. `senahub-vscode`): `localhost` cookies ignore the port, so without it the two
  dev servers overwrite each other's session cookie (logging in on one logs the other out).
- Plain `npm run dev` ignores `PORT` from `.env`: in the VS Code worktree use `npm run dev -- -p 3001`
  (`dev:server` reads it).
- Each worktree has its own real `node_modules` and `src/generated` — never replace them with a
  junction to the main folder (Turbopack refuses the symlink, and removal can wipe the target).
- Stage specific files (never `git add -A`/`.`) and check `git show --stat` after committing.
- First push: `git push -u origin dev-<ide>`. Both branches merge into `dev`; `master` is deploy only.
- A new migration runs `db:migrate` against your own DB; the other worktree applies it with
  `npx prisma migrate deploy` after the merge.
- `git log dev` is ambiguous (there is a `dev/` folder) — use `refs/heads/dev`.
