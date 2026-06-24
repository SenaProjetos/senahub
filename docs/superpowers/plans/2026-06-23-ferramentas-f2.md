# Ferramentas de Engenharia — Onda F2 (Lote 1 Estrutural/Fundações) — Implementation Plan

> **For agentic workers:** Implemente por sub-onda, na ordem. Engines normativos: **conferir contra exemplo
> de bibliografia/norma** com teste antes de fiar UI. Spec: [.../2026-06-23-ferramentas-engenharia-design.md]
> (§2 escopo da Viga, §6.2 E01/E10/E11/E23, §5.4 auto-store). Onda anterior: [.../2026-06-23-ferramentas-f1.md].

**Goal:** Lote 1 (Estrutural/Fundações): a ferramenta 🔧 completa **Viga de concreto E01 (NBR 6118:2023)**,
as rápidas **E10 (ancoragem)**, **E11 (resumo de aço)**, **E23 (estaca por SPT)**, e a **associação a
projeto/disciplina com auto-store** nos pacotes A/B (§5.4).

**Tech:** engines puros em `calc/` (NBR 6118/6122), memória via F1 (`MemoriaDoc`), DXF via `lib/dxf` + `dxf/`.
**Normas:** edição vigente (NBR 6118:**2023**, NBR 6122, NBR 7480). Disclaimer ART/RRT já no rodapé da memória.

**Status:** 🟡 em andamento — **F2a (flexão) concluída e commitada**; falta DXF de armadura (F2b), E10/E11/E23 (F2c), auto-store (F2d).

**Modelo:** todos os engines normativos e detalhamento DXF = **Opus**. UI/forms/wiring de uploads = Sonnet.

---

## Sub-onda F2a — Viga E01: FLEXÃO (núcleo)  ✅  **Opus**
- [x] `calc/concrete-beam-flexure.ts`: ret/T, λ/αc por faixa fck, εcu, limite x/d (0,45/0,35), dupla armadura,
      ρmin (tabela 17.3, piso 0,15%), As,máx 4%, domínios 2/3/4, situação + alertas. `calcular` parseia internamente (defaults).
- [x] `concrete-beam-flexure.test.ts`: **18 testes** — retangular simples (As≈7,99), dupla (As≈13,44/As'≈1,88),
      T na alma (As≈19,6), T na mesa, parâmetros, ρmin, alerta As,mín. Vetores conferidos à mão.
- [x] Fiação usável: registry E01 (🔧 Estrutural, NBR 6118:2023, export pdf/docx/xlsx), `service.calcular`+`montarMemoria`,
      `concrete-beam-form.tsx`, savefile. **DXF de armadura deferido p/ F2b.**
- [x] Commit. tsc/lint limpos; 574 testes verdes.

## Sub-onda F2b — Viga E01: CISALHAMENTO + FLECHA + ANCORAGEM  ⬜  **Opus**
- [ ] Cisalhamento (Modelo I, NBR 6118): VRd2 (biela), Vc, Vsw → área de estribos Asw/s, s,máx.
- [ ] Flecha (ELS): inércia de Branson (estádio II), flecha imediata + diferida (αf); verificação vs. L/250.
- [ ] Ancoragem (lb, lb,nec, ganchos) — reusa E10.
- [ ] Memória completa (PDF/Word) + Excel (resumo de aço) + **DXF: seção cotada + corte com armadura longitudinal/estribos**.
- [ ] `registry` E01 (🔧 completa, exportaveis pdf/docx/xlsx/dxf) + form + integração F1.

## Sub-onda F2c — Rápidas normativas  ⬜  **Opus** (engines) / Sonnet (forms)
- [ ] **E10** Ancoragem e traspasse (NBR 6118): lb, lb,nec, lb,min, traspasse l0t; com/sem gancho; zonas boa/má aderência.
- [ ] **E11** Resumo/quantitativo de aço (corte e dobra, NBR 7480): tabela de barras → peso por bitola + total (Excel).
- [ ] **E23** Estaca por SPT: **Aoki-Velloso** e **Décourt-Quaresma** (carga admissível por atrito+ponta).
- [ ] engines + testes + forms + registry + export (PDF/XLS conforme catálogo).

## Sub-onda F2d — Associação a projeto/disciplina + AUTO-STORE  ⬜  Sonnet
- [ ] `salvarCalculo` aceita `projetoId`/`disciplinaId` (já no schema) — UI no salvar-dialog (selects de projeto+disciplina).
- [ ] Auto-store via `uploads` (§5.4): arquivo `.shcalc` → **Pacote B**; memória (PDF/Word/Excel)+DXF → **Pacote A**;
      marcar `Upload.origem = "ferramenta"` (não conta em `validarEntrega`). Reusar `lib/storage.salvarArquivo`.
- [ ] Escopo/permite só a quem tem acesso ao projeto; auditoria.

## Verificação (cada sub-onda)
- [ ] `npx tsc --noEmit` · lint dos novos · `npm test` · commit semântico pt-BR por sub-onda.

## Definition of Done (F2)
Viga E01 dimensiona flexão+cisalhamento+flecha+ancoragem (ret/T) com memória PDF/Word + Excel + DXF detalhado;
E10/E11/E23 operacionais; associação a projeto/disciplina + auto-store nos pacotes A/B com `origem=ferramenta`.
