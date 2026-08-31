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

**Status:** ✅ concluída (2026-06-23) — tsc/lint/test limpos (529 testes); falta verificação manual no navegador.

## Global Constraints (herdadas)

- Server Actions + Zod no `defineAction`; leituras via Server Components/`queries.ts`. REST só p/ download/streaming.
- Código em inglês; **toda** UI em pt-BR; commits semânticos pt-BR. Auditoria obrigatória em mutações.
- Prisma de `@/generated/prisma/client`. shadcn base-ui (`render={<Comp/>}`, não `asChild`; `Select onValueChange` → `string|null`).
- Migração: `npm run db:migrate` (nome semântico) + `npm run db:generate`. Testes só p/ lógica pura.

**Legendas — Status:** ⬜ pendente · 🟡 em andamento · ✅ concluído · ⛔ descartado

**Modelo por passo (Sonnet × Opus)** — critério em [design §"Modelo de IA recomendado"]:
F0.1–F0.3 **Sonnet** · F0.4 **Sonnet** (conferir os fatores em **Opus**) · F0.5–F0.10 **Sonnet** ·
**F0.11 Opus** (primitivas DXF: geometria/formato, base reusada na F1) · F0.12 **Sonnet** (**Opus** se precisar depurar).
Resumo: F0 é quase todo scaffolding no padrão do repo → Sonnet; o único ponto de lógica nova sensível é o DXF → Opus.

---

## Pré-requisitos
- [ ] Branch `feat/ferramentas-engenharia` ativa (✓ já criada).
- [ ] `.env` com `DATABASE_URL` (5433) e `STORAGE_BASE_PATH` válido (para F2; F0 não grava em disco).

## Passos

### F0.1 — Schema Prisma  ✅  ◼ migração
- [x] `model CalculoFerramenta` adicionado (campos da spec §5.1; índices `@@index([autorId, ferramenta, createdAt])`
      e `@@index([projetoId])`; `@@map("calculo_ferramenta")`).
- [x] Relação inversa `calculosFerramenta CalculoFerramenta[]` em `User`, `Projeto` e `Disciplina`.
- [x] Enum `OrigemUpload { manual ferramenta }` + campo `origem OrigemUpload @default(manual)` em `model Upload`.
- [x] Migration `20260623114345_ferramentas_calculo` aplicada + `db:generate`. (Exigiu `migrate reset` por drift do dev DB.)
- **Aceite:** `npx tsc --noEmit` limpo. ✅

### F0.2 — Permissões  ✅
- [x] Recurso `ferramentas` (label "Ferramentas de Engenharia") com ações `usar` e `gerir` em `permissions-catalog.ts`.
- [x] Seed concede `ferramentas:usar` aos internos e `ferramentas:gerir` a supervisor/administrativo. `cliente` fora.
- **Aceite:** seed idempotente rodou (60 permissões base). ✅

### F0.3 — Registry + tipos base  ✅
- [x] `registry.ts` (client-safe): `FerramentaMeta` + `FERRAMENTAS` (só `U01`) + `getFerramenta`/`porDisciplina`.
- [x] `types.ts`: `Disciplina`, `TipoFerramenta`, `FormatoExport`, `ResultadoBase`, `SnapshotCalculo`, `RecenteCalculo`.
- **Aceite:** importado pela galeria/forms (client) sem puxar `server-only`. ✅

### F0.4 — Engine U01 (Conversor de unidades)  ✅  🧪 puro+testes
- [x] `calc/unit-convert.ts`: 9 dimensões com fatores SI; `entradaSchema` (Zod) + `converter()` puro.
- [x] `unit-convert.test.ts`: **32 casos** (tf=9.80665 kN, MPa↔kgf/cm², round-trips, erros). Fatores conferidos.
- **Aceite:** vitest verde. ✅

### F0.5 — Arquivo de salvamento (.shcalc)  ✅  🧪
- [x] `savefile.ts`: `serializar()` + `parse()` (valida header app/kind/ferramenta + Zod das entradas-alvo).
- [x] `savefile.test.ts`: **8 casos** (round-trip, rejeita outra ferramenta/sem header/entradas incompatíveis).
- **Aceite:** testes verdes. ✅

### F0.6 — service.ts  ✅
- [x] `calcular(ferramenta, entradas)` (dispatch p/ engine) + `snapshotParaSalvar(...)`. Sem Next/HTTP.

### F0.7 — actions.ts (`defineAction`, audita)  ✅
- [x] `salvarCalculo` (recalcula no servidor, `autorId=ctx.user.id`), `renomearCalculo`, `excluirCalculo`
      (escopo autor ou `ferramentas:gerir`, `capturarAntes`). Extra: `buscarCalculo` (leitura p/ reabrir, `audit:false`).
- **Aceite:** auditoria via `defineAction`; sem `usar` → negação. ✅

### F0.8 — queries.ts  ✅
- [x] `recentesDoUsuario` (top 10), `abrirCalculo` (escopo), `listarCalculos` (`parseListParams` + escopo gerir/autor).

### F0.9 — Navegação  ✅
- [x] Item **"Ferramentas"** (ícone `Calculator`) em grupo novo **"Engenharia"**, internos, `mobile:true`.

### F0.10 — Páginas + componentes  ✅
- [x] `ferramentas/page.tsx` (galeria, guarda `requirePermission`) + `ferramentas/[key]/page.tsx`.
- [x] Componentes: `galeria-view`, `ferramenta-view`, `unit-convert-form`, `salvar-dialog`, `recentes-list`, `savefile-buttons`.
      (Reabrir usa Server Action `buscarCalculo`, não REST.)
- **Aceite:** ⚠️ **falta verificação manual no navegador** (fluxo converter→salvar→recentes→reabrir→exportar/importar).

### F0.11 — Primitivas DXF (base p/ F1)  ✅  🧪
- [x] `lib/dxf.ts` (puro): `entidadeTexto/Linha/Circulo/Arco/Polilinha`, `geometriaCotaLinear`, builder `DxfDocumento`
      (HEADER+TABLES LTYPE/LAYER+ENTITIES+EOF). **Decisão:** polilinha = `POLYLINE/VERTEX/SEQEND` (R12), não LWPOLYLINE
      (R14+); cota linear desenhada por primitivas, não entidade DIMENSION.
- [x] `lib/dxf.test.ts`: **26 casos** (entidades, grupos, tabela de camadas, cota, formatação).
- **Aceite:** testes verdes. Não refatorou `modules/documentos/dxf.ts`. ✅

### F0.12 — Verificação final  ✅ (parcial)
- [x] `npx tsc --noEmit` limpo · `npm test` **529 testes verdes** (60 arquivos) · lint dos arquivos novos limpo.
- [x] `next build`: **compila com sucesso** (RSC/boundary OK); o gate de lint do build falha apenas nos **4 erros
      pré-existentes** (`projetos/plano-real-card.tsx`, `uploads/aceite-publico-form.tsx`) — fora do escopo F0.
- [ ] ⚠️ Verificação manual no navegador (F0.10).
- [ ] Commit semântico.

## Definition of Done (F0)
Módulo navegável; Conversor de unidades calcula, salva com nome, lista os 10 recentes, reabre e
exporta/importa `.shcalc`; permissões e auditoria ativas; `lib/dxf.ts` pronto e testado; build/tsc/lint/test limpos.
**Fora do escopo F0:** export PDF/Word/Excel/DXF (F1) e associação a projeto + auto-store nos pacotes A/B (F2).
