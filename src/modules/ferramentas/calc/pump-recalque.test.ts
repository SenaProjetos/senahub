import { describe, it, expect } from "vitest";
import { calcular, entradaSchema } from "./pump-recalque";

// Valores conferidos à mão (script independente, mesma fórmula):
// CD = 30 000 L/dia, 6 h → Q = 5 m³/h = 1,3889 L/s ; Forchheimer = 34,26 mm → recalque DN40 (35,2 mm), sucção DN50 (44 mm)
// DN40: J = 0,070632 m/m, L+Leq = 25+15 = 40 m → hf = 2,8253 mca ; DN50: J = 0,023826, 3+5 = 8 m → hf = 0,1906 mca
// Hg = 2 + 18 = 20 m → Hm = 23,0159 mca ; P = 0,7106 cv ; × 1,5 = 1,066 cv → motor 1,5 cv
const base = {
  origem: "consumo_diario",
  consumoDiarioL: 30000,
  alturaSuccaoM: 2,
  alturaRecalqueM: 18,
  comprimentoSuccaoM: 3,
  comprimentoRecalqueM: 25,
  leqSuccaoM: 5,
  leqRecalqueM: 15,
} as const;

describe("H02 — Bomba de recalque (NBR 5626)", () => {
  const r = calcular(base);

  it("vazão = CD / horas", () => {
    expect(r.vazaoM3h).toBeCloseTo(5, 9);
    expect(r.vazaoLs).toBeCloseTo(1.38889, 4);
  });
  it("Forchheimer 34,26 mm → recalque DN40, sucção DN50", () => {
    expect(r.forchheimerMm).toBeCloseTo(34.258, 2);
    expect(r.recalque.dn).toBe(40);
    expect(r.succao.dn).toBe(50);
    expect(r.recalqueAutomatico).toBe(true);
    expect(r.succaoAutomatico).toBe(true);
  });
  it("perda do recalque = 2,8253 mca e da sucção = 0,1906 mca", () => {
    expect(r.recalque.perdaMca).toBeCloseTo(2.8253, 3);
    expect(r.succao.perdaMca).toBeCloseTo(0.1906, 3);
    expect(r.recalque.velocidadeMs).toBeCloseTo(1.4272, 3);
  });
  it("altura geométrica 20 m e manométrica 23,016 mca", () => {
    expect(r.alturaGeometricaM).toBe(20);
    expect(r.alturaManometricaM).toBeCloseTo(23.0159, 3);
  });
  it("potência 0,7106 cv, margem 50 %, motor de 1,5 cv", () => {
    expect(r.motor.potenciaCv).toBeCloseTo(0.7106, 3);
    expect(r.motor.margem).toBe(0.5);
    expect(r.motor.motorCv).toBe(1.5);
  });
  it("sem alertas no caso comum", () => expect(r.alertas).toEqual([]));

  it("origem por ocupação usa a tabela de consumo (20 pessoas × 150 = 3 000 L/dia)", () => {
    const o = calcular({ ...base, origem: "ocupacao", unidades: 20 });
    expect(o.consumoDiarioL).toBe(3000);
  });

  it("DN digitado vence o sugerido", () => {
    const d = calcular({ ...base, dnRecalque: 50, dnSuccao: 60 });
    expect(d.recalque.dn).toBe(50);
    expect(d.succao.dn).toBe(60);
    expect(d.recalqueAutomatico).toBe(false);
  });

  it("bomba afogada (sucção negativa) reduz a altura geométrica", () => {
    expect(calcular({ ...base, alturaSuccaoM: -1.5 }).alturaGeometricaM).toBe(16.5);
  });

  it("alerta de velocidade acima de 3 m/s no recalque", () => {
    const a = calcular({ ...base, dnRecalque: 20 });
    expect(a.alertas.some((x) => x.includes("recalque") && x.includes("m/s"))).toBe(true);
  });

  it("alerta de sucção menor que o recalque", () => {
    const a = calcular({ ...base, dnRecalque: 50, dnSuccao: 40 });
    expect(a.alertas.some((x) => x.includes("sucção está com diâmetro menor"))).toBe(true);
  });

  it("alerta de NPSH com a bomba muito acima da água", () => {
    const a = calcular({ ...base, alturaSuccaoM: 6 });
    expect(a.alertas.some((x) => x.includes("NPSH"))).toBe(true);
  });

  it("recusa origem sem os dados dela", () => {
    expect(entradaSchema.safeParse({ ...base, consumoDiarioL: undefined }).success).toBe(false);
    expect(entradaSchema.safeParse({ ...base, origem: "ocupacao" }).success).toBe(false);
    expect(entradaSchema.safeParse({ ...base, origem: "ocupacao", ocupacao: "personalizado", unidades: 5 }).success).toBe(false);
  });

  it("recusa DN fora do catálogo e rendimento absurdo", () => {
    expect(entradaSchema.safeParse({ ...base, dnRecalque: 33 }).success).toBe(false);
    expect(entradaSchema.safeParse({ ...base, rendimento: 1.2 }).success).toBe(false);
  });
});
