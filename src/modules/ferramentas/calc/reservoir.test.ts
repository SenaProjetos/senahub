import { describe, it, expect } from "vitest";
import { calcular, entradaSchema } from "./reservoir";

describe("H01 — Reservatórios (NBR 5626)", () => {
  describe("residência média, 20 pessoas, 2 dias, inferior + superior", () => {
    // CD = 20 × 150 = 3000 L ; reserva = 6000 L ; inferior 60 % = 3600 ; superior = 2400
    const r = calcular({ unidades: 20 });
    it("consumo diário = 3000 L", () => expect(r.consumoDiarioL).toBe(3000));
    it("volume de reserva = 6000 L", () => expect(r.volumeReservaL).toBe(6000));
    it("inferior = 3600 L", () => expect(r.inferior?.totalL).toBeCloseTo(3600, 6));
    it("superior = 2400 L", () => expect(r.superior?.totalL).toBeCloseTo(2400, 6));
    it("total = 6000 L (sem RTI)", () => expect(r.totalL).toBe(6000));
    it("avisa que não há RTI", () => expect(r.alertas.some((a) => a.includes("incêndio"))).toBe(true));
  });

  describe("reserva técnica de incêndio", () => {
    it("calculada: 2 hidrantes × 125 L/min × 60 min = 15 000 L, no superior", () => {
      const r = calcular({
        unidades: 20,
        rtiModo: "calculada",
        rtiHidrantes: 2,
        rtiVazaoLMin: 125,
        rtiMinutos: 60,
      });
      expect(r.rtiL).toBe(15000);
      expect(r.superior?.rtiL).toBe(15000);
      expect(r.superior?.totalL).toBeCloseTo(2400 + 15000, 6);
      expect(r.inferior?.rtiL).toBe(0);
      expect(r.totalL).toBeCloseTo(6000 + 15000, 6);
      expect(r.alertas.some((a) => a.includes("incêndio"))).toBe(false);
    });

    it("informada em m³, alocada no inferior", () => {
      const r = calcular({ unidades: 20, rtiModo: "informada", rtiVolumeM3: 12, rtiEm: "inferior" });
      expect(r.rtiL).toBe(12000);
      expect(r.inferior?.totalL).toBeCloseTo(3600 + 12000, 6);
      expect(r.superior?.totalL).toBeCloseTo(2400, 6);
    });

    it("recusa RTI informada sem volume", () => {
      expect(() => calcular({ unidades: 20, rtiModo: "informada" })).toThrow();
    });

    it("recusa RTI calculada incompleta", () => {
      expect(() => calcular({ unidades: 20, rtiModo: "calculada", rtiHidrantes: 2 })).toThrow();
    });
  });

  describe("sistema com um só reservatório", () => {
    it("somente superior recebe todo o consumo e a RTI", () => {
      const r = calcular({ unidades: 10, sistema: "somente_superior", rtiModo: "informada", rtiVolumeM3: 5 });
      expect(r.inferior).toBeNull();
      expect(r.superior?.consumoL).toBeCloseTo(3000, 6);
      expect(r.superior?.totalL).toBeCloseTo(8000, 6);
    });

    it("somente inferior recebe todo o consumo e a RTI, mesmo com rtiEm = superior", () => {
      const r = calcular({ unidades: 10, sistema: "somente_inferior", rtiModo: "informada", rtiVolumeM3: 5 });
      expect(r.superior).toBeNull();
      expect(r.inferior?.rtiL).toBe(5000);
      expect(r.inferior?.totalL).toBeCloseTo(8000, 6);
    });
  });

  describe("consumo próprio e área em planta", () => {
    it("personalizado usa o consumo informado", () => {
      const r = calcular({ ocupacao: "personalizado", consumoLitrosDia: 80, unidades: 50, diasReserva: 1 });
      expect(r.consumoDiarioL).toBe(4000);
      expect(r.volumeReservaL).toBe(4000);
    });

    it("consumo informado substitui o valor da tabela", () => {
      const r = calcular({ ocupacao: "escritorio", consumoLitrosDia: 70, unidades: 10 });
      expect(r.consumoPorUnidade).toBe(70);
    });

    it("personalizado sem consumo é recusado", () => {
      expect(entradaSchema.safeParse({ ocupacao: "personalizado", unidades: 10 }).success).toBe(false);
    });

    it("área = volume (m³) / altura útil; lado quadrado = √área", () => {
      const r = calcular({ unidades: 20, alturaUtilInferiorM: 1.5, alturaUtilSuperiorM: 1.2 });
      // inferior 3,6 m³ / 1,5 = 2,4 m² ; superior 2,4 m³ / 1,2 = 2,0 m²
      expect(r.inferior?.areaM2).toBeCloseTo(2.4, 6);
      expect(r.inferior?.ladoQuadradoM).toBeCloseTo(Math.sqrt(2.4), 6);
      expect(r.superior?.areaM2).toBeCloseTo(2.0, 6);
    });

    it("sem altura útil, não há área", () => {
      expect(calcular({ unidades: 20 }).inferior?.areaM2).toBeNull();
    });
  });

  it("alerta quando a reserva é menor que 1 dia", () => {
    const r = calcular({ unidades: 20, diasReserva: 0.5 });
    expect(r.alertas.some((a) => a.includes("1 dia"))).toBe(true);
  });
});
