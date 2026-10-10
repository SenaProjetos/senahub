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
npm run smoke:status-documento     # status documental automático (só FORA do ciclo documental): Enviado/Aprovado/Correção pela chave, revisão vigente, evento automático
npm run smoke:ciclo-documental     # ciclo ISO 19650: I1–I8, publicar arquiva a anterior e revoga a obra (A1), liberação automática (A2), apontamentos (A3), integridade corrige I5 (A7)
npm run smoke:pastas-cliente       # pastas Compartilhado/Liberado para obra: revisão marcada na lista/árvore, contagem, validação desfeita
npm run smoke:recursos-eap    # EAP: herança, horas no motor, cards, carga/sobrecarga, custo previsto, Valor Agregado
npm run smoke:impacto-ausencia  # aviso de férias/abono × alocação (só leitura): janela de hoje em diante, digitada × cronograma (D17)
npm run smoke:ciclo-rh       # listas de entrada/saída: prazo pela âncora, um aberto por tipo (índice parcial), quem marca o quê, lembrete 1×/dia, recontratação
npm run smoke:pedido-dados   # "Atualize seus dados" + reconfirmação anual: faixa, um aberto por pessoa, CPF/RG ao RH, fechamento (restaura a pessoa)
npm run smoke:desenvolvimento  # liderança única ativa, 1:1 compartilhado × privado (o privado não sai do servidor), lembrete sem conteúdo
npm run smoke:documentos-validade  # documento com validade: aviso 60/30/7/vencido uma vez por faixa, renovar rearma
npm run smoke:ponto-tarefa    # ponto com tarefa: lista curta (atrasada não some), sugestão da atividade de hoje, validação, edição do dia, apontado × previsto
npm run ensaio:eap [-- --refazer]  # (só banco de dev) projeto de ensaio estilo Arapiraca: etapas, EAP com gente, cronograma aprovado, cards e 1 usuário por perfil (senha Demo@2026); `ensaio:conferir` lê o que cada perfil enxerga
npm run smoke:eap-integracao  # ponta a ponta: etapas padrão → modelo de EAP → aprovar → ponto sugere → bater → concluir card → verde/aviso → validar → enviar etapa (multifamiliar e unifamiliar)
npm run smoke:conclusao-eap  # aviso ao gestor quando alguém conclui o card de uma atividade da EAP: coordenação (ou gestores), sem o autor, nunca card manual nem linha em 100%
npm run smoke:etapas-card     # etapas padrão por tipo (EP/BS/EX, sem EP no unifamiliar, a 0%), "enviei para análise" só do responsável, desfazer até aprovar
npm run smoke:etapa-proxima   # aviso da etapa que vem: só aprovado, 2 dias úteis antes, atividade + coordenação, uma vez por etapa e data, data nova rearma
npm run smoke:pagamento-fase  # pagamento por fase: pool congelado, write-back por diferença, SLA, marco → aprovar fase
npm run smoke:previsao-recebimento  # contrato por entrega: previsão no caixa, marco anda, faturar, fora do aging
npm run smoke:duplicar-projeto      # duplicar projeto com EAP: estrutura, IDs novos, cronograma em rascunho, o que NÃO copia
npm run smoke:modelo-disciplina     # modelos de EAP por disciplina: criar do modelo de projeto, "Gerar EAP das disciplinas", fases encadeadas
npm run smoke:apagar-eap            # apagar a EAP inteira (rascunho): o que impede, o que vai junto, o que fica
npm run smoke:financeiro-core       # núcleo do financeiro: N0 (parcelas do projeto, projetista pago no Financeiro, recebido pelo pago) e N1 (estorno, reabrir, caminhos impossíveis, desfazer importação)
npm run smoke:planejador            # planejador de caixa: S0 = caixa da Visão geral, só pendente vira evento, transferência, parcial, leitura não grava; aplicar cenário tudo-ou-nada (obsoleto, regra no 3º, corrida); caixinhas, distribuição, recorrência, fora do resultado, lucros de sócio e folha quitando o previsto
npm run smoke:catalogo-nomenclatura # catálogo da versão: sigla que muda de dono (sinônimo/oficial), sair sem mexer em sigla, voltar escolhendo
npm run verify:motor-cronograma     # motor do cronograma contra os projetos reais do banco
npm run smoke:ifc-federado         # IFC federado: child de verdade, R00/R01/R02 nunca repetida, trava de geração viva, arquivo sumido, unidade recusada, geração travada liberada, regra de leitura
npm run verify:ifc-federado -- <projetoId>   # junta os IFCs vigentes de um projeto real (sem gravar) e confere IfcProduct do federado = soma dos modelos
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
                         #   aprovacao.ts: devePassarPorAprovacao(tipo, valor, limite) — juridico contract limit only;
                         #     the Financeiro's expense alçada is modules/financeiro/aprovacao/niveis.ts (faixas)
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
                         #   campos/: catalog of formatted fields (mask, normalization, validation, message),
                         #     pure, one file per type + zod.ts (campo.<tipo>()) + exigir.ts — see ADR-0010
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

**Formatted fields and forms** ([ADR-0010](docs/adr/0010-campos-com-formato.md), spec
`docs/superpowers/specs/2026-10-04-campos-formatados-design.md`): CPF, CNPJ, CPF/CNPJ, phone, CEP, e-mail, RG, agência,
conta, PIX key and NF-e key use `InputFormatado tipo="…"` (`components/ui/input-formatado.tsx`) on screen and
`campo.<tipo>()` (`lib/campos/zod.ts`) in the schema — never a raw `<Input>` or a bare `z.string()`. The catalog
(`lib/campos/`) is the single source of mask, normalization, validation and message, so the screen never accepts what
the action refuses. The DB stores the **standard format** (`000.000.000-00`, `(00) 00000-0000`); exceptions: PIX (BACEN
format, validated in the handler via `campoPix` in `normalizarConta` because it depends on `pixTipo`), the NF-e key (44 digits) and
`Cliente.documento` (digits only — CRM ADR-03 uniqueness; the screen masks it). Duplicate lookups match
`variantesDoValor` while legacy rows remain; importers and producers pass a valid value through
`CAMPOS.<tipo>.normalizar` (an invalid one is a preview warning, saved as it came). Create schemas are strict; **every
update path** uses `{ legado: true }` + `exigirCamposValidos(input, antes, mapa)` in the handler: an invalid value already
stored passes, a new invalid one is refused on the field (`ActionError(msg, campos)` → `fieldErrors`; with
`useFieldErrors` pass `id` + `erro={fe.erros.x}` and drop the parent's `FieldError`). Valid = `limpo && rule`: a legacy value
with anything beyond the number ("3333-4444 ramal 12", "1.234.567 SSP/PE") is "invalid untouched" — shown raw, saved
as is, never normalized.
That includes the collaborator's bank-account proposal of type "editar" and the client briefing (an invalid cadastro
value is not pre-filled; autosave keeps saving the rest and names the field). The company PIX (`configuracoes/empresa`,
no type field) is free text, accepted if valid for any PIX type, refused only when invalid AND changed. Login e-mail
(better-auth) is out; its fields carry `campo-ok`. A new type (PIS, CNH, boleto…) is born in the catalog with its first field, with a test.
`lib/campos/guarda-campos.test.ts` fails on a raw field; the only escape is `campo-ok: <reason>` on the line or in a
comment-only line above. Limits: it misses keys inside a one-line `z.object({ … })` and inputs bound only by `id=` — a
net, not a proof. Forms that only collect and save use `FormData`; forms where a field reacts to another use state; an
existing form switches mode only when the screen is already being changed for another reason.

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
- **Closing the CLT payroll DEFINES the value; paying is another step** (`rh/folha/fechamento-service.ts` +
  pure `quitacao.ts`, N0 of `feat/financeiro-nucleo`, owner decision 2026-10-02). The folha of month M is
  competência M and is paid in M+1 by the 5th working day: `CompromissoRecorrente` has `regraVencimento`
  (`dia_fixo | dia_util`, N-th working day via `lib/calendario-trabalho.ts` + RH holidays; for SALARY — category
  `despesa_folha_clt`, `Vencimento.salario`, and the folha closing default — Saturday counts as a working day, CLT art.
  459 §1º, via `calendarioDeSalario`; owner decision 2026-10-03) and
  `mesesAteVencimento` (0/1/2), so `recorrenciaCompetencia` is the competência, NOT the due month
  (`competenciaDoVencimento` inverts it). `fecharFolha` writes the real net value into the competência's
  bill and leaves it `previsto` (baixa/conciliação pays it): the recurrence-linked one wins, a lone unlinked
  one is taken, two unlinked → none (it creates its own, linked to the recurrence so the job never generates
  the month again, and the `aviso` names what stayed open); `aguardando_aprovacao` is never touched; a bill
  of a compromisso flagged `adiantamento` (salary advance, same competência) is NEVER used; a linked bill
  already `confirmado` → `ja_paga`, nothing new is created. Only the `mensal` folha uses the competência's
  bill — the 13º has its own folha in the same month. Reopening never deletes nor reverts the bill, and is
  refused once it is paid (estorno first). `RetiradaSocio` is frozen as history — it never became a
  `Lancamento`, so `criarRetiradaSocio` refuses and points to the recurrence (pró-labore) or to
  Distribuir/Adiantar lucros.
- **One state machine for every `Lancamento`** (N1, `financeiro/lancamentos/transicoes.ts`, pure): every
  action that changes a lançamento's situation asks `motivoParaNao(op, estado)` before writing, reading the
  state with `exigirOperacao()` (`situacao-service.ts`, uses `findUnique` so an excluded row comes back and
  is refused — A12). The same sentence is the server's `ActionError` and the menu's disabled reason.
  Paid never cancels (estorno first), conciliado never estornos/cancels/excludes, cancelado never pays,
  `aguardando_aprovacao` never pays nor conciliates. Writes are `updateMany` conditioned on the status read
  (count ≠ 1 → `MOTIVO_MUDOU`) plus a `LancamentoStatusHistorico` row. Estorno (`estornarNoBanco`) takes
  the open partial remainder with it (`Lancamento.restanteDeId`, set by every path that creates a
  remainder) and undoes the caixinha distribution; reabrir sends a rejected expense back to approval. A new
  status-changing path must go through this — never a bare `lancamento.update({ status })`. Undoing an
  import is a soft delete refused once any row was conciliated, distributed or edited; dedup
  (`hashesExistentes`) sees rows excluded by hand but not rows of an undone lote.
- **One alçada for expenses** (N3, `financeiro/aprovacao/niveis.ts`, pure): the faixas from Configurações
  (`ate` inclusive) are the only rule — the old single "limite" was migrated into faixas and removed. It
  judges the TOTAL of the installments (`valorDaAlcada` on create, `valorParaAlcada` = sum of the
  `recorrenciaGrupo` when approving or editing). Only `criarLancamentoNoTx` (manual + planner) and
  `editarLancamento` (value changed on an open expense → `situacaoAposMudarValor`, already-approved goes back)
  go through it; producers (folha, projetista, ART, serviço, recorrência, documento, lucros) are exempt by
  origin and write directly. `motivoParaNaoAprovar`: admin decides anything, nobody else approves their own
  expense; the same sentence is the action's error and the Aprovações menu's disabled reason (`bloqueio`).
- **Bank reconciliation** (N4, `financeiro/conciliacao/casamento.ts` pure + `service.ts`): OFX import is ONE
  transaction (`importarOfxNoBanco`); auto-match only with exactly one `previsto` candidate, same value in
  cents, same account (or none — it takes the statement's), within 5 calendar days, never a transfer leg,
  never a tie. Every link goes through `exigirOperacao(…, "conciliar")` and stores `TransacaoBancaria.
  estadoAnterior` (photo of the lançamento before); `desconciliarNoBanco` restores it via `planoDesconciliar`
  (paid by the reconciliation → back to open, created from the transaction → excluded, already paid → stays;
  no photo / changed since / distributed → only unlinks). `parseSaldoOfx` (LEDGERBAL) is compared with
  `saldoDoSistema`. OFX dates are UTC midnight.
- **A closed month is frozen** (N5, `financeiro/fechamento/trava.ts` pure + `trava-service.ts`): every write
  path calls `exigirPeriodoAberto(db, datas)` — create (all occurrences), edit of locked fields
  (`edicaoMexeNoFechado`: value, category, dates, account, centro, projeto; description/vencimento/contact/
  planner stay free), cancel, reopen, exclude (competência + payment date via `datasDoLancamento`), baixa/lote/
  lote de pagamentos and conciliation (only the NEW payment date — an overdue bill from a closed month is paid
  in an open month), estorno (the payment date that leaves), import and undo-import (row dates), and the CLT
  folha closing (competência). OFX still imports a closed month's transactions but never auto-matches them.
  `fecharMes` re-consolidates at the moment of closing and freezes `FechamentoMensal.saldosContas` (each
  active account's balance on the last day); reopening needs `financeiro:fechar` and clears it.
- **System categories by `chave`, never by `codigo`** (N6, `financeiro/categorias-sistema.ts`): producers pass
  the code they always used and `acharCategoriaDoSistema(db, codigo)` maps it to the stable `chave` (code is the
  fallback) — folha, projetista, ART, serviço, parcelas, faturamento, medição and contract receivables all use it.
  Plano de contas rules (`categorias-regras.ts`, pure): a lançamento only takes a category of its own tipo
  (DRE groups by the category's tipo, DFC by the lançamento's), the tipo of a category in use or of a system
  one never changes, and a parent can't be itself, a descendant, or of another tipo. Receivables created by
  faturamento por entrega / medição de licitação carry the project's `clienteId`. Money readers outside the
  module (jobs, margem, EVM, qualidade) use `SO_RESULTADO`/`SEM_TRANSFERENCIA` and are covered by the
  `natureza-nas-consultas` guard. Changing the delete password needs the current one; `seed:demo` refuses a
  database whose name doesn't end in `_remake|_dev|_test|_vscode`; the OFX/import/DRE/rentabilidade routes use
  the same gate as their screens (`conciliar`, `resultados`).
- **Financeiro navigation** (M0, `financeiro/nav.ts`, mock approved 2026-10-02): 3 direct links (Visão geral,
  Lançamentos, Contas) + 4 menus (Movimentações, Planejamento, Resultados, Mais), each item gated by the SAME
  permission as its page and covered by a test that every href has a `page.tsx` — a screen's link enters the menu
  only when the page exists. "Contas" has two tabs by `?situacao=pagas`; the Orçamento tab of the Resultados strip
  comes from Planejamento. **Extrato por conta** (`financeiro/extrato/`, pure `calculo.ts`): one account's realized
  lançamentos by payment date, in cents, saldo inicial + entradas − saídas = saldo final; transfer legs count,
  lançamento WITHOUT conta belongs to no account (the livro caixa has its own "Sem conta" checkbox — it used to
  enter every account selection). `ExtratoBancario.saldoBanco/saldoBancoEm` (OFX `LEDGERBAL`) feed the bank-balance check.
- **Fill-in rules** (M2, `financeiro/regras/`, mock "Regras" approved 2026-10-02): a `RegraCategorizacao` is WHEN all
  `condicoes` (JSON: descrição contém/igual/começa, tipo, valor, conta) match → THEN fill categoria, centro, forma,
  projeto, contato and tags. Pure `motor.ts` decides: the FIRST active rule by `ordem` that matches wins (later ones
  never complete what is left), it NEVER overwrites a field the person already chose (tags only add), contact is one
  only (despesa → fornecedor, receita → cliente). `service.ts` loads the list/preview (`casamentosDoHistorico`, last
  12 months, read-only) and `registrarUso`; every place that applies rules goes through `sugerirParaEntrada` or
  `carregarRegrasAtivas` + `sugerirPreenchimento`: OFX conciliation (`transacoesPendentes` suggests the category;
  `criarDaTransacaoNoBanco` fills the rest), spreadsheet import (`commit-core.ts`: only empty fields, transfer rows
  excluded, the spreadsheet's category is never replaced) and the manual form (on blur of the description). A new rule
  only counts from now on — nothing retroactive. `termo` stays on the row for compatibility; the migration turned old
  term→category rules into one `descricao contém` condition each. Menu item "Criar regra a partir deste lançamento"
  is `itemCriarRegra` (livro caixa, Contas, Pagas).
- **Credit cards** (M3, `financeiro/cartoes/`, spec `docs/superpowers/specs/2026-10-02-financeiro-cartoes.md`):
  a purchase is an expense ON THE PURCHASE DAY and cash only leaves when the invoice is paid — paying creates
  NO lançamento, it just realizes that cycle's purchases (a second lançamento would count the expense twice).
  A `CartaoCredito` has `diaFechamento`/`diaVencimento` (1–28, so they exist in February) and `tipo`
  `empresa | pessoal`; a personal card belongs to a `Socio` and its invoice IS the reimbursement the company
  owes him (owner decision 2026-10-02). `FaturaCartao` stores **no status at all**: aberta/fechada/paga are
  read from its purchases against today (`ciclo.ts` pure `situacaoDaFatura`, paga = none open), so estornar a
  purchase reopens the invoice by itself and no baixa path needs a hook. A purchase is a plain `Lancamento`
  (`cartaoId` + `faturaId`, `data` = `dataCompetencia` = purchase day, `vencimento` = the invoice's, no
  `contaId` until paid), exempt from the alçada by origin like the other producers; an instalment buy is one
  lançamento per cycle (`parcelasDaCompra`, leftover cent on the last). In the planner, purchases of the same
  invoice are merged into ONE `fatura:<id>` event at the due date (`cartoes/eventos.ts`, pure) — the projected
  total is unchanged, and that event's date is not adjustable (it belongs to the card). Cards are NOT bank
  accounts: they never appear in Cadastros → Contas, in `saldoBase` or in the Extrato por conta.
- **Transfers between own accounts** (M8, `financeiro/transferencias/`): a transfer is TWO `Lancamento` legs sharing a
  `transferenciaId` — a despesa on the origin account and a receita on the destination — in the categories whose
  `natureza = transferencia` (`categoriaDeTransferencia` finds them, creating "Transferência" if the plan has none), so it
  moves both balances and never enters DRE/DFC/margin. Create/edit/baixar/estornar/excluir ALWAYS touch both legs in one
  transaction (`service.ts`, rules in pure `calculo.ts`: legs must agree on status, none conciliated for edit/excluir/estornar).
  The state machine knows it: a leg whose partner exists has `origem = "transferencia"` and every per-leg operation except
  `conciliar` answers `MOTIVO_TRANSFERENCIA` — never write a bare `lancamento.update` on one leg. Menus show
  `itensDaTransferencia` (ids prefixed `transferencia-`) for any leg with a `transferenciaId`.
- **Date of the opening balance** (M8, `ContaBancaria.saldoInicialEm`): the saldo inicial is the balance at the START of that
  day, so only the realized from that day on counts in the account (`entraNoSaldoDaConta` in `saldo-base.ts`); null = every
  realized row counts, as it always did. Every balance reader honours it: `saldoBase` (Visão geral + planner),
  `saldoDoSistema` (conciliation check + closing's frozen `saldosContas`), the Extrato por conta and the livro caixa's
  account panel / running balance (client, `noSaldo` in `lancamentos-view.tsx`, fixed in the 2026-10-03 review) — a new
  reader of an account balance must too, or the account double-counts what the opening balance already holds.
- **Correcting a paid lançamento** (M8, `lancamentos/corrigir-pagamento.ts`, operation `corrigir_pagamento`): account, forma
  and payment date change WITHOUT estornar. A conciliated one only takes a new forma (account and date are the bank's); a
  closed month freezes account and date (not forma); a future date is refused; production payments correct on the Produção
  screen and transfer legs through the transfer.
- **Financeiro notices** (M9, `financeiro/avisos/`): customer collection e-mails (before / on the day / D+1) and the "contas a
  pagar vencendo" bell (D-3 and D-1, one notification per person per day, to whoever launched the bill — or to
  `financeiro:gerir` when the author can't see the financeiro). Switched in Configurações → Avisos de vencimento
  (`ConfigSistema` `financeiro.avisos`): before/on-the-day e-mails ship OFF because they go OUTSIDE the company; D+1 is
  on (it always was). **Once only**: the key `AvisoFinanceiroEnviado(lancamentoId, tipo, destino, vencimento)` is RESERVED
  before sending (`reservarAviso`; P2002 = another run already has it, not an error) and released when the send fails —
  the mailer returns `false` instead of throwing, so check the boolean. The due date is in the key: moving the vencimento
  re-arms the notice. Card purchases collapse to one bill per `faturaId`; transfer legs, `previsao` and
  `aguardando_aprovacao` never notify. **Licitação is not collected** (owner decision 2026-10-03): a receivable of a
  `Projeto.tipo = licitacao` or in the `receita_licitacoes` category (or a child) is skipped in all three moments unless
  `financeiro.avisos.cobrarLicitacao` is on (`ehRecebivelDeLicitacao`, counted as `licitacao` in the job log). Pure rules in `regras.ts`; `service.ts` takes the sender/notifier as parameters so the
  smoke runs the same code without SMTP. New notification category `conta_a_pagar` (opt-out in Preferências).
- **Investments** (M4, `financeiro/investimentos/`, spec `docs/superpowers/specs/2026-10-02-financeiro-investimentos.md`):
  each `Investimento` OWNS one `ContaBancaria` (tipo `investimento`, `Investimento.contaId` unique) whose balance IS the
  current value. Aporte/resgate are M8 transfers between it and a checking account (`criarTransferenciaNoTx`); yield is a
  realized receita (chave `receita_rendimento_aplicacao`) and IR/IOF a realized despesa (chave `despesa_ir_aplicacao`) IN
  that account — so they hit the DRE but never cash. Movements have NO table: `calculo.ts` reads them from the account's
  lançamentos (transfer leg in = aporte, out = resgate, plain receita = rendimento, plain despesa = imposto). **An account
  linked to an Investimento is NOT cash**: `saldoBase(…, contasFora)` skips it entirely (not even "sem conta"), and
  `fluxoCaixa`, `baseDoPlanejador`, the realized side of `fluxoDiario` and `opcoesLancamento` exclude it via
  `idsContasDeInvestimento()` — a new cash reader must too. The rule is the LINK, not the account tipo (old tipo-investimento
  accounts without an ativo keep their behavior). Balanço gets an "Investimentos" line (`totalDaCarteira`); an ativo with
  liquidez "vencimento" inside the horizon becomes a planner event `inv:<id>` (origem `investimento`, date not adjustable).
  Registrar rendimento takes the BANK's gross value; IR suggestion = regressive rate (from first aporte) on all yield minus
  IR already booked. Resgate total: the amount received wins, the difference becomes rendimento or imposto, the ativo zeroes
  and is archived.
- **Full baixa** (M7, `lancamentos/baixa.ts` pure + `baixa-service.ts`): a baixa takes `principal` (≤ the title; less =
  partial, remainder via `restanteDeId`), `juros`, `multa` and `desconto` SEPARATELY — `valorEfetivo` no longer means
  interest (the action maps a legacy `valorEfetivo > valor` to juros). Each extra becomes its OWN realized lançamento in the
  same account/date with `acessorioDeId` = the principal, in a system category by chave (`despesa_juros_multas_pagos`,
  `receita_descontos_obtidos`, `receita_juros_multas_recebidos`, `despesa_descontos_concedidos`), so cash = principal ±
  extras and every report reads it with no change. Discount only when settling the whole title. The state machine gives
  an accessory `origem = "acessorio"` (every op refused with `MOTIVO_ACESSORIO`); estornar/excluir the principal soft-deletes
  them (`excluirAcessoriosNoTx`) and corrigir pagamento moves them. `acessorioDeId` has NO Prisma relation on purpose: a
  second self-relation on `Lancamento` cost ~0.7 GB of `tsc` heap (`tsc -p tsconfig.server.json` is already above 4 GB —
  run it with `NODE_OPTIONS=--max-old-space-size=8192`). `Lancamento.numeroDocumento` / `chaveNfe` (44 digits, mod-11 DV
  in `chaveNfeValida`). Retentions on the NF (ISS, IRRF, INSS…) wait for the accountant (owner decision 5).
- **DRE base, Indicadores and relatório por dimensão** (M6 + review 2026-10-03, `financeiro/relatorios/`): `whereDRE(de, ate,
  base)` is the ONE rule for what enters a DRE period — DRE comparativo, `relatorioDRE` (Excel export, takes `base`) and
  Indicadores. **Caixa** = realized by `dataConfirmacao`; **Competência = pago E em aberto** (`confirmado|previsto|
  aguardando_aprovacao`) by `dataCompetencia ?? data`, open rows by title value (owner decision 4, 2026-10-02 — it sat
  unimplemented until this review). Indicadores (mock "Indicadores") has the Caixa|Competência switch and the period
  switch (mês anterior · mês atual · Trimestre · 12 meses, `?periodo=&base=`); cards and the 6-month evolution table use
  the SAME base, so a month never shows two numbers; the previous period is the same number of CALENDAR months before.
  KPIs (`indicadores-gerenciais.ts`, pure): inadimplência = vencido >30 dias ÷ FATURADO (receitas issued in 12 months,
  `confirmado|previsto`, by `data`, title value — not only what was received); prazo médio counts only rows that had a
  `vencimento` (a bill paid on creation would add 0 days); ponto de equilíbrio and receita por projeto are PER MONTH
  (period ÷ months). Ponto de equilíbrio = contribution margin (owner decision 2026-10-03): fixed ÷ (1 − variable ÷
  revenue), `null` when variable ≥ revenue; each despesa category is `CategoriaFinanceira.tipoCusto` (`fixo | variavel`,
  null = inherits from the parent, nothing in the chain = fixo — `tipoCustoEfetivo`), edited inline in Cadastros → Plano
  de contas; the migration marks the system categories by `chave` (root "despesa" fixo; projetistas, freelancers,
  fornecedores, ART, impostos, descontos concedidos variável). Each evolution row's menu:
  Ver DRE do mês, Ver lançamentos do mês (`/financeiro/lancamentos?mes=AAAA-MM`), Comparar, Exportar — links carry `base`.
  `relatorioPorDimensao` groups confirmed lançamentos by `categoria | centro | contato | projeto | tag` (tag can land in
  several rows; centro/projeto honour the rateio). Deep links into the livro caixa (`itensDaLinhaDeDimensao`) exist only
  for `centro`/`projeto` — the livro caixa's category filter matches a top-level CODE and there is no contato filter, so
  the other items are disabled with `MOTIVO_SEM_FILTRO_NO_LIVRO_CAIXA`. `orcamentoPorCentro` is READ-ONLY (previsto ×
  realizado; `OrcamentoItem` has no `centroId`).
- **Rateio e comprovante na baixa** (M10 + review, `financeiro/lancamentos/rateio.ts` + `rateio-service.ts`, `comprovante-service.ts`):
  `RateioLancamento` (basis points, sum exactly 10000, ≥2 rows, each with centro OR projeto) is read ONLY by
  `relatorioPorDimensao` centro/projeto — `Lancamento.centroId/projetoId` stays the principal everywhere else. A rateado row
  is split in cents by `ratearValor` (leftover on the last); `qtd` counts PARTS. `salvarRateioNoBanco` replaces everything in
  one transaction, empty list removes, and it follows the same locks as editing centro/projeto: closed month (N5), transfer
  leg, accessory, cancelled and `previsao` are refused. **Clones carry it:** the partial remainder (`gravarRestante`, the lote
  de pagamentos remainder) and the juros/multa/desconto accessories copy the rateio (`copiarRateioNoTx` / nested create) — a
  new path that clones a Lancamento must too. `exigirComprovanteSeObrigatorio(db, ids)` runs in `baixarNoTx`, `baixarEmLote`
  and `executarPlano` (lines with value > 0); producers and OFX reconciliation are exempt by origin. The confirm dialog
  uploads the comprovante BEFORE calling the baixa (otherwise the gate refuses its own attachment). Config:
  `ConfigFinanceiro.comprovanteObrigatorioNaBaixa` (sibling of `obrigatorios`: it applies at baixa, not at creation).
  "Duplicar lançamento" is only a `LancamentoForm` prefill (`duplicarDe`) on top of `criarLancamento`.
- **Dates in the Financeiro are São Paulo calendar days** (N2, `lib/data.ts`): "today" to WRITE into a date column
  is `hojeParaBanco()` (UTC midnight of the SP day) and to compare is `diaDeSaoPaulo()` — a bare `new Date()` is
  tomorrow after 21h BRT. Period limits on date columns (`@db.Date`: `data`, `dataConfirmacao`, `dataCompetencia`)
  are `utcInicioDoDia`/`utcFimDoDia` — `new Date(ano, mes, 1)` is 03:00Z and dropped the 1st of the month; read a
  DB date's month with `getUTCMonth()`. Add months to a date with `somarMesesUtc` (date-fns `addMonths` is local
  time: 31/01 + 1 month became 01/03). Aging gets `hojeParaBanco()`. A `confirmado` lançamento with recurrence
  confirms ONLY the first month. Report accumulators use `somarReais`/`valorPagoReais` (cents, no float drift).
- **Paid value, never nominal** (`modules/financeiro/valor-pago.ts`): any sum of REALIZED rows uses
  `somaPaga()` (row by row, `valorEfetivo ?? valor`, cents) — `_sum.valor` counts what was expected, and
  `_sum.valorEfetivo ?? _sum.valor` drops every row without `valorEfetivo` as soon as one has it.
- **Producers never rewrite a paid expense** (N0): the serviço terceirizado sync (`planoDaDespesaServico`)
  and the projetista sync refuse once the `Lancamento` is `confirmado`; any baixa in the Financeiro of a
  projetista expense marks the `PagamentoProjetista` paid via `pagamentoPagoNoFinanceiro()` (livro caixa,
  lote, conciliação, OFX, lote de pagamentos — a new confirm path must do the same); approving a discipline
  is a conditional `updateMany(status ≠ aprovado)` so two simultaneous approvals release payment once.
  "Gerar parcelas" of a project (`projetos/receita/parcelas-service.ts`) only replaces GENERATED open
  parcels (`ehParcelaGerada`: tag `contrato` without `entrega:`), soft-deletes them and splits what is still
  owed (total − received).

**Document lifecycle (ISO 19650)** (`modules/uploads/ciclo/`, spec `docs/superpowers/specs/2026-10-08-ciclo-documental-iso19650.md`):
each `DocumentoRevisao` has ONE `estado` (`em_andamento → compartilhado → publicado → arquivado`; the screen calls
`compartilhado` "Em análise"), `ControleRevisao` rows coexist with it (`liberado_obra`, `enviado_cliente`, `bloqueio`,
`restricao` — removal fills `removidoEm`, never deletes) and every change is a `DocumentoEvento` with `revisaoId` written
INSIDE the transaction (`gravarEventoNoTx`). Only `ciclo/service.ts` changes state or controls (`updateMany` conditioned
on the state read; pure table in `transicoes.ts`); the partial index `documento_revisao_um_publicado` enforces one
publicada per document. Scope = pacote A without `.ifc` (`participaDoCiclo`); outside it the old flow and the
`DocumentoStatus` catalog still apply, inside it the catalog is no longer written. A VERSION is an internal re-send
while the revision is `em_andamento` (`ultimaVersao`, `Upload.versaoNaRevisao`); a replaced file gets
`substituidoPorId` and is hidden from top-level `upload` reads by the `versaoAtual` Prisma extension (escape:
`substituidoPorId: { not: undefined }`) — nested reads and raw SQL need `substituidoPorId: null` explicitly.
`DocumentoDisciplina.revisaoCompartilhadaId/revisaoLiberadaObraId` are now a MIRROR of the active
`enviado_cliente`/`liberado_obra` control, written only by the service (the public link reads them). Daily job
`ciclo-documental-integridade` (A7). Deploy runs `scripts/migrar-ciclo-documental.ts` (read-only, then `--gravar`).

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

**Etapas no card, ponto e avisos da EAP** (reunião de 08/10/2026, levantamento e decisões em
`docs/superpowers/specs/2026-10-08-reuniao-eap-levantamento.md`):
- **O card da disciplina NÃO é ligado à EAP** (decisão do dono, 2026-10-10): `DisciplinaEtapa.inicio/prazo` são preenchidos
  à mão pela coordenação. Toda disciplina de projeto `particular`/`licitacao` nasce com EP/BS/EX a 0% (`semearEtapasPadrao`,
  `etapas-padrao.ts` puro; `TipoEmpreendimento.semEstudoPreliminar` = só BS/EX) — em TODO caminho que cria disciplina. O
  pagamento por fase espera a soma dos % fechar 100%. Disciplinas anteriores à mudança não ganham etapa. Aplicar um modelo de EAP
  PREENCHE esses % com os do modelo (`modelos/preencher-percentuais.ts`) só se a disciplina inteira está a 0%, sem fase liberada,
  e o modelo traz % de TODA etapa dela somando 100% (unifamiliar: o modelo precisa ser só BS/EX); senão segue a 0%.
- **"Enviei os documentos"** (`projetos/envio-etapa*.ts`): só responsável da disciplina; etapa → `entregue`; desfaz até
  aprovar; avisa coordenação + responsáveis (`aprovacao_disciplina`). Escrita é `updateMany` condicionada ao status lido.
- **Ponto** (`ponto/tarefa-ponto.ts`, puro): janela ±7 dias, atrasada ABERTA nunca some (topo), "outras da etapa" recolhidas
  (`listaDoPonto`), e parado ele abre na atividade de hoje (`sugestaoDoPonto` → `sugestaoParaPonto`, no resumo do header e em
  `/ponto`). `projetosDoUsuario` inclui projeto onde a pessoa só tem card aberto. "Meu trabalho" lista a mesma regra.
- **Sinais da linha** (`planejamento/sinais-linha.ts`): verde = card concluído pelo responsável e linha < 100% (sugere 100%,
  nunca grava o %); vermelho = término ATUAL do motor passou e < 100% (o filtro Atrasadas e a Saúde seguem pela linha de base).
- **Avisos**: `etapa-proxima*` (job `aviso-etapa-proxima` 07:00, 2 dias úteis antes do início, uma vez por etapa+data via
  `AvisoEtapaEnviado`; lê a EAP, não o card) e `conclusao-aviso*` (card da EAP concluído → coordenação, ou admin/supervisor sem
  coordenador, sem o autor; só linha < 100%). `/recursos` mostra a carga de cronograma em RASCUNHO à parte (`rascunho`), sem somar.
- Verificação de ponta a ponta: `npm run smoke:eap-integracao`; ensaio em tela: `npm run ensaio:eap` (usuários com perfil de
  acesso + termo aceito, senão o login cai em /sem-permissao ou /termo).

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
- **IFC federado** (`coordenacao/federado/`): junção no texto STEP em child process (`scripts/federar-ifc.ts`, job `gerar-ifc-federado`), vira `Documento` origem `modelo_federado` na pasta Modelo federado do Desenvolvimento; filtros por origem só via `documentos-cliente/origens.ts`. A revisão é 1 + gerações concluídas do projeto (nunca reaproveitada, mesmo excluindo versões); leitura = `coordenacao:ver` + enxergar o projeto, escrita só pelas ações do próprio federado.

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

**Entrada e saída de pessoas** (`modules/rh/ciclo/`, Gestão de Pessoas F4, spec §9.2 of
`docs/superpowers/plans/2026-08-26-rh-gestao-pessoas-recursos.md`): `OnboardingProcesso` is a CYCLE (`tipo` entrada|saida,
`status`), several per person (rehire keeps history) but at most ONE `em_andamento` per type — enforced by the partial
unique index `onboarding_processo_um_aberto` (not in schema.prisma). Items copy `responsavel` and resolve `prazoEm` =
anchor + `prazoDias` when the cycle opens (anchor: vínculo start / last day); editing a model never touches open
cycles. Pure rules in `regras.ts` (who marks what: RH any, `patrimonio:ti` the TI ones, the person their own; líder and
coordenador fall to RH until F3). Nothing opens by itself: the ficha offers the exit list after `desligarColaborador`.
Daily reminder `lembrete.ts` (inside `rotinasRhDiarias`) claims each overdue item with `updateMany` on `lembradoEm`
(once a day), one notification per recipient, categoria `lifecycle_rh`. Models are seeded create-only by name.

**"Atualize seus dados"** (`modules/rh/cadastro/preencher.ts` pure + `pedido-service.ts` + `pedido-actions.ts`, spec
`docs/superpowers/specs/2026-10-08-pedido-atualizacao-dados.md`): RH opens a `PedidoDadosCadastro` (one `aberto` per person,
partial unique index `pedido_dados_um_aberto`); while it is open and something depends on the person, the dashboard layout
renders `FaixaPedidoDados` above the top bar (`Shell` prop `faixa`) — never blocks. "What is missing" is ALWAYS
`camposFaltantes` (completude.ts) filtered by `CAMPOS_PREENCHIVEIS`; the request stores no field list. The person only FILLS
empty fields: plain ones apply at once, CPF/RG go to `cadastroPendente.preenchimentos` (applied on approval only if still
empty); changing an existing value stays in the Fase 4 flow. A later `proporAlteracaoCadastro` must keep `preenchimentos`.
The request closes (`fecharSeAtendido`) on fill and in `rotinasRhDiarias`.

**Gestão de Pessoas F2/F3/F5/F6** (spec `docs/superpowers/plans/2026-08-26-rh-gestao-pessoas-recursos.md` §9.3):
- F2 `rh/habilidades/` — `UserHabilidade.nivel` 1–5 (null = never apt), the person declares (changing clears the
  validation), RH/`recursos:gerir` validate (never their own); `Habilidade.publicada` (proposed by `recursos:gerir`,
  published by RH); `NecessidadeHabilidade` per project, covered in /recursos via `candidatosParaNecessidade` + `folgaNaJanela`.
- F3 `rh/desenvolvimento/` — `LiderancaPessoa` (one active per person, partial index `lideranca_uma_ativa`), objectives,
  `EncontroUmAUm` with per-record `visibilidade`; `papelSobre` decides rh|lider|self and the QUERY already filters
  (private 1:1 never reaches the person). /rh/minha-equipe is gated by the active leadership, not by role.
- F5 `rh/documentos/` — `FuncionarioDocumento.validadeEm/avisoFaixa/conferidoEm/enviadoPelaPessoa`; self upload is
  `/api/rh/meus-documentos` (stores file AND record server-side); the HR action only accepts `CAMINHO_DOC_RH` paths not
  already linked. Daily notice 60/30/7/0 claimed by `updateMany` on `avisoFaixa`.
- Annual reconfirmation: `PedidoDadosCadastro.tipo = reconfirmar`, `User.dadosConfirmadosEm`; the job only reopens for
  people who confirmed 12+ months ago (never-confirmed = RH batch only).
- F6 `rh/gestao/` — `/rh/gestao` composes existing reads; pure signals in `sinais.ts`; climate hidden below 3 answers.

**Cross-module pages (not their own module folder):** `/recursos` = resource-allocation matrix built from `modules/planejamento/queries.ts` (`matrizRecursos`, `cargaSemanalPorRecurso`) + `modules/rh/habilidades/queries.ts`, gated `recursos:ver`/`recursos:gerir`.

**Notificação categories:** `lib/notificar.ts` `notificar()`/`notificarMuitos()` accept an optional `categoria` param. Users may opt out per category; `filtrarPorCategoria()` in `modules/usuarios/preferencias/queries.ts` filters recipients before fan-out. Categories include `prazo_disciplina`, `inadimplencia`, `certidao`, `licitacao`, `digest_semanal`, `risco_projeto`, `lembrete_ponto`, `coordenacao`, `aprovacao_arquivo`, `aprovacao_disciplina`, `input_cliente`, `conta_a_pagar`, `impacto_ausencia`, `lifecycle_rh`, `desenvolvimento`, `documento_validade`, `ciclo_documental`, `etapa_proxima`, `atividade_concluida`.

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
