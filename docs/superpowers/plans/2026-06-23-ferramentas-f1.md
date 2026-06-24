# Ferramentas de Engenharia — Onda F1 (Memória + Exportação) — Implementation Plan

> **For agentic workers:** Implemente passo a passo, na ordem. Marque `- [x]` ao concluir e atualize o
> **Status** no topo. Spec de origem: [docs/superpowers/specs/2026-06-23-ferramentas-engenharia-design.md]
> (§5.3 pipeline de export, §7 onda F1). Onda anterior: [docs/superpowers/plans/2026-06-23-ferramentas-f0.md].

**Goal:** Construir o pipeline genérico de **memória de cálculo + exportação** (PDF, Word, Excel, DXF) operando
sobre um **cálculo salvo** (`CalculoFerramenta`), e provar end-to-end na ferramenta **U02 — Propriedades
geométricas de seção**. O modelo `MemoriaDoc` (puro) é a peça central; renderers partem dele.

**Architecture:** `memoria/` define `MemoriaDoc` (modelo puro normalizado) + renderers (HTML p/ PDF, docx, xlsx).
`calc/section-properties.ts` = engine puro U02. `dxf/` = builders de desenho por ferramenta (sobre `lib/dxf`).
Rotas REST `src/app/api/ferramentas/calculos/[id]/{pdf,docx,xlsx,dxf}` resolvem o cálculo (escopo via `queries`),
montam `MemoriaDoc` (re-rodando o engine a partir de `entradasJson`) e fazem stream do arquivo.

**Tech Stack:** Next 15 · React 19 · TS · Prisma 7 · puppeteer-core (`CHROME_PATH`, `page.setContent`) ·
`exceljs` (CommonJS via `createRequire`) · **`docx`** (dep nova) · `lib/dxf` (F0).

**Status:** ✅ concluída (2026-06-23) — tsc/lint/test limpos (556 testes); falta verificação manual dos 4 downloads.

**Modelo por passo (Sonnet × Opus):** F1.1 `MemoriaDoc` + F1.2 engine U02 + F1.7 DXF builder = **Opus**
(modelo/geometria/normativa). F1.3–F1.6 renderers/rotas + F1.8 UI = **Sonnet** (padrão do repo). Estamos em Opus.

## Global Constraints (herdadas)
- REST só p/ download/streaming (export) — OK aqui. Leituras via `queries.ts`/Server Components.
- Código em inglês; UI em pt-BR; commits semânticos pt-BR. Testes só p/ lógica pura (engine, MemoriaDoc, DXF).
- Disclaimer ART/RRT no rodapé de toda memória (decisão #4 do design).

---

## Passos

### F1.0 — Dependência `docx`  ✅
- [x] `npm install docx` → `docx ^9.7.1` no `package.json`.

### F1.1 — Modelo MemoriaDoc (puro)  ✅  **Opus**
- [x] `memoria/types.ts` (MemoriaValor/Tabela/Secao/Doc) + `memoria/index.ts` (`DISCLAIMER_PADRAO`, `montarMemoriaBase`, `fmtNum`).

### F1.2 — Engine U02 (Propriedades de seção)  ✅  🧪  **Opus**
- [x] `calc/section-properties.ts`: retangular/circular/T/poligonal; shoelace + momentos + Steiner; círculo fechado.
      Retorna A, centroide, Ix, Iy, Ixy, Wx_sup/inf, ix, iy, fibras, geometria (p/ DXF).
- [x] `section-properties.test.ts`: **19 testes** (retângulo, círculo, T vs. Steiner manual=207500 cm⁴, polígono horário).

### F1.3 — Renderer HTML da memória  ✅
- [x] `memoria/render-html.ts`: HTML A4 autocontido (cabeçalho, seções, valores com fórmula/substituição, tabelas, rodapé+disclaimer).

### F1.4 — Rota PDF  ✅
- [x] `api/ferramentas/calculos/[id]/pdf/route.ts`: `memoriaDoCalculo` → HTML → puppeteer `setContent` (`waitUntil:"load"`) → A4. 401/404/503.

### F1.5 — Rota Word (.docx)  ✅
- [x] `memoria/render-docx.ts` (Document/Table/Paragraph) + rota `Packer.toBuffer`.

### F1.6 — Rota Excel (.xlsx)  ✅
- [x] `memoria/render-xlsx.ts` (`preencherWorkbookMemoria`, `import type`) + rota via `createRequire("exceljs")`.

### F1.7 — DXF da seção (U02)  ✅  🧪  **Opus**
- [x] `dxf/section.ts`: contorno (polilinha/círculo) + eixos centroidais + marca do CG + 3 cotas; escala cm→mm.
- [x] rota `application/dxf`; `section.test.ts` (**3 testes**: retângulo/círculo/T).

### F1.8 — U02 no registry + form + botões de export  ✅
- [x] `registry.ts`: `U02` (ícone `Shapes`, exportaveis pdf/docx/xlsx/dxf); `U01` → `["pdf"]`. Schema U02 no `savefile.ts`.
- [x] `service.ts`: `montarMemoria` (U01 simples, U02 completa) + `calcular` U02 → painel.
- [x] `section-properties-form.tsx` (tipo + dimensões + painel de props); `queries.memoriaDoCalculo` (escopo + memória).
- [x] Export nos itens de **recentes** (`recentes-list.tsx`): links `GET` por formato conforme `exportaveis`.

### F1.9 — Verificação final  ✅ (parcial)
- [x] `npx tsc --noEmit` limpo · lint dos novos limpo · `npm test` **556 testes (63 arquivos)**.
- [ ] ⚠️ Verificação manual dos 4 downloads (PDF/Word/Excel/DXF) no navegador (depende de `CHROME_PATH` p/ o PDF).
- [ ] Commit semântico.

## Definition of Done (F1)
`MemoriaDoc` puro + 4 renderers; rotas de export por cálculo salvo (escopo/auth); U02 calcula e exporta os 4 formatos
com disclaimer ART/RRT; tsc/lint/test limpos. **Fora do escopo F1:** associação a projeto + auto-store pacotes A/B (F2);
ferramentas 🔧 completas (Viga E01, F2).
