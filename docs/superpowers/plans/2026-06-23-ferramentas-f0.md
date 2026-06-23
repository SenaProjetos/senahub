# Ferramentas de Engenharia — Onda F0 (Fundação) — Implementation Plan

> **For agentic workers:** Implemente passo a passo, na ordem. Marque `- [x]` ao concluir e atualize o
> **Status** no topo. Não pular auditoria (`defineAction`) nem trocar a stack. Spec de origem:
> [docs/superpowers/specs/2026-06-23-ferramentas-engenharia-design.md] (§5 arquitetura, §5.4 persistência).

**Goal:** Erguer a fundação do módulo `ferramentas` — esqueleto, persistência de cálculos (salvar com nome,
recentes, arquivo de salvamento recarregável), permissões, navegação e **1 calculadora de prova**
(⚡ Conversor de unidades, `U01`) end-to-end **sem** export ainda — além das primitivas `lib/dxf.ts` para a F1.

**Architecture:** Módulo novo `src/modules/ferramentas` no padrão do projeto: engines **puros e testáveis**
em `calc/` (sem `server-only`/Prisma), `service.ts` orquestra, `actions.ts` (`defineAction`, audita),
`queries.ts` (leituras com escopo). Catálogo de ferramentas = código (`registry.ts`, client-safe).
Persistência = `CalculoFerramenta`. UI em `src/app/(dashboard)/ferramentas` + `src/components/ferramentas`.

**Tech Stack:** Next 15 (App Router) · React 19 · TS · Prisma 7 (`@/generated/prisma/client`) · Zod · vitest ·
shadcn-on-base-ui · sonner.

**Status:** ⬜ não iniciada

## Global Constraints (herdadas)

- Server Actions + Zod no `defineAction`; leituras via Server Components/`queries.ts`. REST só p/ download/streaming.
- Código em inglês; **toda** UI em pt-BR; commits semânticos pt-BR. Auditoria obrigatória em mutações.
- Prisma de `@/generated/prisma/client`. shadcn base-ui (`render={<Comp/>}`, não `asChild`; `Select onValueChange` → `string|null`).
- Migração: `npm run db:migrate` (nome semântico) + `npm run db:generate`. Testes só p/ lógica pura.

**Legendas — Status:** ⬜ pendente · 🟡 em andamento · ✅ concluído · ⛔ descartado

---

## Pré-requisitos
- [ ] Branch `feat/ferramentas-engenharia` ativa (✓ já criada).
- [ ] `.env` com `DATABASE_URL` (5433) e `STORAGE_BASE_PATH` válido (para F2; F0 não grava em disco).

## Passos

### F0.1 — Schema Prisma  ⬜  ◼ migração
- [ ] Adicionar `model CalculoFerramenta` (campos da spec §5.1: `ferramenta, titulo, norma?, versaoCalc,
      entradasJson, resultadoJson, autorId, projetoId?, disciplinaId?, createdAt, updatedAt`; índice
      `@@index([autorId, ferramenta, createdAt])`; `@@map("calculo_ferramenta")`).
- [ ] Adicionar relação inversa `calculosFerramenta CalculoFerramenta[]` em `User` (e opcional em `Projeto`/`Disciplina`).
- [ ] Adicionar enum `OrigemUpload { manual ferramenta }` e campo `origem OrigemUpload @default(manual)` em `model Upload`
      (decisão #3 — usado só na F2, mas a coluna entra agora p/ evitar 2ª migração).
- [ ] `npm run db:migrate -- --name ferramentas_calculo` + `npm run db:generate`.
- **Aceite:** `npx tsc --noEmit` limpo; Prisma Studio mostra a tabela.

### F0.2 — Permissões  ⬜
- [ ] Em `src/lib/permissions-catalog.ts`, recurso `ferramentas` (label "Ferramentas") com ações
      `usar` ("Usar ferramentas e salvar cálculos") e `gerir` ("Ver cálculos de todos / administrar").
- [ ] No seed (`prisma/seed.ts`, bloco de permissões base): conceder `ferramentas:usar` aos perfis internos
      (`supervisor, administrativo, clt, estagiario, projetista_pj, freelancer`) e `ferramentas:gerir` a
      `supervisor`/`administrativo` (admin faz bypass). `cliente` fica de fora.
- **Aceite:** matriz em Configurações → Permissões lista o recurso; seed idempotente roda sem erro.

### F0.3 — Registry + tipos base  ⬜
- [ ] `src/modules/ferramentas/registry.ts` (client-safe): `type FerramentaMeta { key, nome, descricao,
      disciplina, tipo: "rapida"|"completa", norma?, exportaveis: ("pdf"|"docx"|"xlsx"|"dxf")[], icon }` +
      `FERRAMENTAS: FerramentaMeta[]` (no F0, só `U01`) + helpers `getFerramenta(key)`, `porDisciplina()`.
- [ ] `src/modules/ferramentas/types.ts`: tipos compartilhados (resultado base, `MemoriaDoc` virá na F1).
- **Aceite:** importável em client component sem puxar `server-only`.

### F0.4 — Engine U01 (Conversor de unidades)  ⬜  🧪 puro+testes
- [ ] `src/modules/ferramentas/calc/unit-convert.ts`: dimensões (comprimento, área, volume, massa, força,
      tensão/pressão, momento, vazão, ângulo) com fatores p/ unidade-base SI; `entradaSchema` (Zod:
      dimensao, valor, de, para) + `converter(input): { valor, de, para, fator }` (puro).
- [ ] `unit-convert.test.ts`: casos por dimensão (ex.: 1 tf = 9.80665 kN; 1 MPa = 10.1972 kgf/cm²; round-trip).
- **Aceite:** `npx vitest run src/modules/ferramentas/calc/unit-convert.test.ts` verde.

### F0.5 — Arquivo de salvamento (.shcalc) — serialização pura  ⬜  🧪
- [ ] `src/modules/ferramentas/savefile.ts` (puro): `serializar(calc) → {app:"senahub", kind:"shcalc",
      ferramenta, versaoCalc, titulo, entradas, norma?, geradoEm}` e `parse(json)` validando `app/kind/ferramenta`
      + Zod das entradas da ferramenta-alvo (erro amigável se incompatível). Extensão sugerida `.shcalc.json`.
- [ ] `savefile.test.ts`: round-trip serializar→parse; rejeita arquivo de outra ferramenta/sem header.
- **Aceite:** testes verdes. (Export/import roda **client-side** na F0; auto-store em pacotes é F2.)

### F0.6 — service.ts  ⬜
- [ ] `montarResultado(ferramenta, entradas)` — chama o engine certo (no F0, `unit-convert`) e devolve o snapshot.
- [ ] `snapshotParaSalvar(...)` — monta `{ ferramenta, titulo, norma, versaoCalc, entradasJson, resultadoJson }`.
- [ ] Sem dependência de Next/HTTP (reutilizável por actions e, futuramente, jobs/rotas de export).

### F0.7 — actions.ts (`defineAction`, audita)  ⬜
- [ ] `salvarCalculo` (`{ recurso:"ferramentas", permissao:"usar", schema }`) — valida entradas pela ferramenta,
      recalcula no servidor (não confia no resultado do cliente), persiste com `autorId = ctx.user.id`.
- [ ] `renomearCalculo` / `excluirCalculo` — escopo: autor (ou `ferramentas:gerir`). `capturarAntes` na exclusão/edição.
- **Aceite:** `AuditLog` registra cada mutação; usuário sem `usar` recebe negação.

### F0.8 — queries.ts  ⬜
- [ ] `recentesDoUsuario(ferramenta, userId)` → últimos **10** (`orderBy createdAt desc take 10`).
- [ ] `abrirCalculo(id)` (escopo: autor ou `gerir`), `listarCalculos(params)` com `parseListParams`.
- **Aceite:** server-only; respeita escopo (autor vs. global).

### F0.9 — Navegação  ⬜
- [ ] `src/lib/nav-config.ts`: item **"Ferramentas"** (ícone `Calculator`), grupo "Gestão" (ou novo "Engenharia"),
      `roles` = internos (sem `cliente`), `mobile: true`.
- **Aceite:** item aparece p/ perfil interno e some p/ `cliente`.

### F0.10 — Páginas + componentes  ⬜
- [ ] `src/app/(dashboard)/ferramentas/page.tsx` — galeria por disciplina (cards do `registry`), com guarda `requirePermission("ferramentas","usar")`.
- [ ] `src/app/(dashboard)/ferramentas/[key]/page.tsx` — resolve `registry`, renderiza a ferramenta.
- [ ] `src/components/ferramentas/`: `galeria-view.tsx`, `ferramenta-view.tsx` (layout form+resultado+recentes),
      `unit-convert-form.tsx`, `salvar-dialog.tsx` (nome), `recentes-list.tsx`, `savefile-buttons.tsx`
      (exportar/importar `.shcalc` client-side: download via Blob, import via `<input type=file>` → `parse` → repovoa).
- **Aceite:** fluxo manual: converter → salvar com nome → ver em recentes → reabrir (repovoa) → exportar `.shcalc` →
      importar em aba nova (repovoa). Toasts via sonner.

### F0.11 — Primitivas DXF (base p/ F1)  ⬜  🧪
- [ ] `src/lib/dxf.ts` (puro, sem `server-only`): writer R12 ASCII com `text, line, circle, arc, polyline(LWPOLYLINE),
      layer`, montagem de documento (SECTION/ENTITIES/EOF) e helper de cota linear simples. Unidades em mm.
- [ ] `src/lib/dxf.test.ts`: gera entidades esperadas; círculo/arco/polyline com grupos corretos.
- **Aceite:** testes verdes. (Sem UI; consumido na F1.) *Não* refatorar `modules/documentos/dxf.ts` agora.

### F0.12 — Verificação final  ⬜
- [ ] `npx tsc --noEmit` · `npm run lint` · `npm test` (novos testes verdes) · verificação manual (F0.10).
- [ ] Commit semântico: `feat(ferramentas): fundação do módulo + conversor de unidades (F0)`.

## Definition of Done (F0)
Módulo navegável; Conversor de unidades calcula, salva com nome, lista os 10 recentes, reabre e
exporta/importa `.shcalc`; permissões e auditoria ativas; `lib/dxf.ts` pronto e testado; build/tsc/lint/test limpos.
**Fora do escopo F0:** export PDF/Word/Excel/DXF (F1) e associação a projeto + auto-store nos pacotes A/B (F2).
