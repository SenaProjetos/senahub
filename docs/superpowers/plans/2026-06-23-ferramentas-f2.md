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

## Sub-onda F2b — Viga E01: CISALHAMENTO + DXF (+ flecha pendente)  🟡  **Opus**
- [x] **Cisalhamento** (Modelo I, NBR 6118): `calc/concrete-beam-shear.ts` — VRd2 (biela), Vc, Vsw → Asw/s, Asw/s,mín,
      s,máx; 9 testes hand-check (VRd2≈399, Vc≈70,8, Asw/s≈5,40). Integrado ao E01 via `Vk` opcional (painel+memória+form).
- [x] **DXF de armadura**: `calc/bitolas.ts` (NBR 7480) + `dxf/beam-section.ts` (contorno/alma, estribo, barras tração/
      compressão, cotas, legenda) + `dxf/index.ts` (dispatcher); rota DXF generalizada; E01 exportaveis += dxf. 5 testes.
- [x] **Flecha (ELS)** — `calc/concrete-beam-deflection.ts`: Ecs, Mr, LN estádio II (bisseção, ret/T), I_II, Ieq Branson,
      flecha imediata (5/48·Ma·L²/EI, biapoiada+carga uniforme) + diferida (αf), verificação L/250. 10 testes hand-check
      (Ecs≈24150, x_II≈14,78, δ∞≈2,24). Integrado ao E01 via `vao`+`mServ` opcionais (As efetiva ø16). **E01 COMPLETA.**
- [ ] Ancoragem (lb, lb,nec, ganchos) → será o tool **E10** (F2c), reaproveitável pelo E01.

## Sub-onda F2c — Rápidas normativas  ✅  **Opus** (engines) / Sonnet (forms)
- [x] **E10** `calc/rebar-anchorage.ts` (NBR 6118 9.4/9.5): fbd (η1·η2·η3·fctd), lb, lb,nec, lb,mín, traspasse l0t/α0t;
      com/sem gancho; aderência boa/má. 9 testes hand-check (fbd≈2,886; lb≈60,3; gancho 42,2).
- [x] **E11** `calc/steel-summary.ts` (NBR 7480): agrupa lista de barras → peso por bitola + total + perda. 4 testes.
- [x] **E23** `calc/pile-spt.ts` (NBR 6122): **Aoki-Velloso** + **Décourt-Quaresma** (Rp/Rl/Radm) com tabelas de solo e
      fatores de estaca; 7 testes hand-check (Aoki Radm≈630, Décourt≈489). Simplificações documentadas + nota de conferência.
- [x] Fiação: registry (E10 Estrutural/Anchor, E11 Estrutural/Table2, E23 Fundações/Layers), savefile, service.calcular +
      montarMemoria, forms (anchorage/steel-summary/pile-spt c/ `Footer` reusável), ferramenta-view. 618 testes verdes.

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
