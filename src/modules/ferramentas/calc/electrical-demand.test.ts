import { describe, it, expect } from "vitest";
import { calcular, entradaSchema, fatorAgrupamento, FCT_TABELA } from "./electrical-demand";

const chuveiro = { descricao: "Chuveiro", potenciaW: 5500, tensaoV: 220 };

describe("E01 — Corrente e demanda (NBR 5410)", () => {
  describe("corrente de projeto", () => {
    it("chuveiro 5500 W / 220 V monofásico, fp 1 → 25 A", () => {
      const r = calcular({ cargas: [chuveiro] });
      expect(r.linhas[0].ib).toBeCloseTo(25, 6);
      expect(r.linhas[0].ibCorrigida).toBeCloseTo(25, 6); // 30 °C e 1 circuito: fatores 1
    });

    it("motor trifásico 7,5 kW, η 0,88, fp 0,85, 380 V → 15,23 A", () => {
      const r = calcular({
        cargas: [{ descricao: "Bomba", potenciaW: 7500, rendimento: 0.88, fp: 0.85, tensaoV: 380, ligacao: "tri" }],
      });
      // P_abs = 7500/0,88 = 8522,7 W ; I = 8522,7 / (√3 · 380 · 0,85)
      expect(r.linhas[0].pInstalada).toBeCloseTo(8522.727, 2);
      expect(r.linhas[0].ib).toBeCloseTo(15.234, 2);
    });

    it("quantidade multiplica a potência do circuito", () => {
      const r = calcular({ cargas: [{ descricao: "Luminárias", quantidade: 10, potenciaW: 100, tensaoV: 127 }] });
      expect(r.linhas[0].pInstalada).toBeCloseTo(1000, 6);
      expect(r.linhas[0].ib).toBeCloseTo(1000 / 127, 6);
    });
  });

  describe("corrente corrigida (FCT × FCA)", () => {
    it("40 °C em PVC (0,87) e 3 circuitos agrupados (0,70)", () => {
      const r = calcular({ cargas: [chuveiro], temperaturaC: 40, circuitosAgrupados: 3 });
      expect(r.fct).toBe(0.87);
      expect(r.fca).toBe(0.7);
      expect(r.linhas[0].ibCorrigida).toBeCloseTo(25 / (0.87 * 0.7), 6);
    });

    it("EPR usa a própria linha da Tabela 40", () => {
      const r = calcular({ cargas: [chuveiro], isolacao: "EPR", temperaturaC: 40 });
      expect(r.fct).toBe(0.91);
    });

    it("FCT e FCA manuais substituem a tabela", () => {
      const r = calcular({ cargas: [chuveiro], fctManual: 0.9, fcaManual: 0.5, circuitosAgrupados: 9, temperaturaC: 33 });
      expect(r.fct).toBe(0.9);
      expect(r.fca).toBe(0.5);
      expect(r.linhas[0].ibCorrigida).toBeCloseTo(25 / 0.45, 6);
    });

    it("temperatura fora da tabela é recusada, a menos que o FCT seja informado", () => {
      expect(entradaSchema.safeParse({ cargas: [chuveiro], temperaturaC: 33 }).success).toBe(false);
      expect(entradaSchema.safeParse({ cargas: [chuveiro], temperaturaC: 33, fctManual: 0.97 }).success).toBe(true);
    });

    it("PVC não tem 70 °C na tabela, EPR tem", () => {
      expect(70 in FCT_TABELA.PVC).toBe(false);
      expect(entradaSchema.safeParse({ cargas: [chuveiro], temperaturaC: 70 }).success).toBe(false);
      expect(entradaSchema.safeParse({ cargas: [chuveiro], temperaturaC: 70, isolacao: "EPR" }).success).toBe(true);
    });

    it("fatores combinados abaixo de 0,5 geram alerta", () => {
      const r = calcular({ cargas: [chuveiro], temperaturaC: 50, circuitosAgrupados: 6 });
      expect(r.alertas.length).toBe(1);
    });
  });

  describe("fator de agrupamento (Tabela 42)", () => {
    it.each([
      [1, 1.0], [2, 0.8], [3, 0.7], [4, 0.65], [5, 0.6], [6, 0.57], [7, 0.54], [8, 0.52],
      [9, 0.5], [11, 0.5], [12, 0.45], [15, 0.45], [16, 0.41], [19, 0.41], [20, 0.38], [40, 0.38],
    ])("%i circuitos → %f", (n, esperado) => {
      expect(fatorAgrupamento(n)).toBe(esperado);
    });
  });

  describe("carga demandada", () => {
    const cargas = [
      { descricao: "Iluminação", potenciaW: 2000, tensaoV: 127, fp: 0.92, fd: 0.8 },
      { descricao: "Tomadas", potenciaW: 3000, tensaoV: 127, fp: 0.8, fd: 0.5 },
      { descricao: "Chuveiro", potenciaW: 5500, tensaoV: 220, fd: 1 },
    ];
    const r = calcular({ cargas, alimentacaoTensaoV: 220, alimentacaoLigacao: "tri" });

    it("potência instalada = soma", () => expect(r.pInstaladaW).toBeCloseTo(10500, 6));
    it("demanda = Σ P × fd = 1600 + 1500 + 5500", () => expect(r.pDemandadaW).toBeCloseTo(8600, 6));
    it("kVA = Σ (P_dem / fp)", () => {
      expect(r.sDemandadaVA).toBeCloseTo(1600 / 0.92 + 1500 / 0.8 + 5500, 6);
    });
    it("fator de potência médio = kW / kVA", () => expect(r.fpMedio).toBeCloseTo(r.pDemandadaW / r.sDemandadaVA, 9));
    it("fator de demanda global = demanda / instalada", () => {
      expect(r.fatorDemandaGlobal).toBeCloseTo(8600 / 10500, 9);
    });
    it("corrente total trifásica = kVA / (√3 · V)", () => {
      expect(r.correnteTotalA).toBeCloseTo(r.sDemandadaVA / (Math.sqrt(3) * 220), 6);
    });
    it("alimentação monofásica não usa √3", () => {
      const m = calcular({ cargas, alimentacaoTensaoV: 220, alimentacaoLigacao: "mono" });
      expect(m.correnteTotalA).toBeCloseTo(m.sDemandadaVA / 220, 6);
    });
  });

  describe("validação de entrada", () => {
    it("exige ao menos uma carga", () => {
      expect(entradaSchema.safeParse({ cargas: [] }).success).toBe(false);
    });
    it("recusa fator de demanda acima de 1", () => {
      expect(entradaSchema.safeParse({ cargas: [{ ...chuveiro, fd: 1.2 }] }).success).toBe(false);
    });
    it("recusa fator de potência zero", () => {
      expect(entradaSchema.safeParse({ cargas: [{ ...chuveiro, fp: 0 }] }).success).toBe(false);
    });
  });
});
