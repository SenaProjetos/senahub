import { describe, it, expect } from "vitest";
import { calcular, entradaSchema, volumeDaPiscina } from "./pool-pump";

// Valores conferidos à mão (script independente, mesma fórmula):
// 8 × 4 × 1,5 m = 48 m³ ; residencial 6 h → Q = 8 m³/h = 2,2222 L/s
// sucção: menor DN com v ≤ 1,8 m/s = DN50 (1,461 m/s) ; retorno: v ≤ 3,0 = DN40 (2,284 m/s)
// DN50: J = 0,056842 × (4+6) = 0,5684 mca ; DN40: J = 0,168508 × (10+8) = 3,0331 mca
// Hm = 0,5684 + 3,0331 + 4 (filtro) + 2 (retornos) = 9,6016 mca ; η = 50 % → 0,5692 cv ; × 1,5 = 0,854 cv → motor 1 cv
const base = {
  forma: "retangular",
  comprimentoM: 8,
  larguraM: 4,
  profundidadeMediaM: 1.5,
  comprimentoSuccaoM: 4,
  leqSuccaoM: 6,
  comprimentoRetornoM: 10,
  leqRetornoM: 8,
  perdaEquipamentosMca: 4,
  pressaoRetornoMca: 2,
} as const;

describe("H03 — Bomba de piscina (NBR 10339)", () => {
  const r = calcular(base);

  it("volume 48 m³, 6 h, vazão 8 m³/h", () => {
    expect(r.volumeM3).toBe(48);
    expect(r.horasRecirculacao).toBe(6);
    expect(r.vazaoM3h).toBeCloseTo(8, 9);
    expect(r.vazaoLs).toBeCloseTo(2.2222, 3);
  });
  it("sucção DN50 e retorno DN40 pelos limites de velocidade", () => {
    expect(r.succao.dn).toBe(50);
    expect(r.retorno.dn).toBe(40);
    expect(r.succao.velocidadeMs).toBeCloseTo(1.4615, 3);
    expect(r.retorno.velocidadeMs).toBeCloseTo(2.2836, 3);
  });
  it("perdas: sucção 0,5684 mca, retorno 3,0331 mca", () => {
    expect(r.succao.perdaMca).toBeCloseTo(0.5684, 3);
    expect(r.retorno.perdaMca).toBeCloseTo(3.0331, 3);
  });
  it("altura manométrica = tubulação + equipamentos + retornos = 9,6016 mca", () => {
    expect(r.alturaManometricaM).toBeCloseTo(9.6016, 3);
  });
  it("potência 0,5692 cv, motor de 1 cv", () => {
    expect(r.motor.potenciaCv).toBeCloseTo(0.5692, 3);
    expect(r.motor.motorCv).toBe(1);
  });
  it("sem taxa de filtração não há área filtrante, e avisa", () => {
    expect(r.areaFiltranteM2).toBeNull();
    expect(r.alertas.some((a) => a.includes("taxa de filtração"))).toBe(true);
  });
  it("com taxa de 25 m³/h·m², área filtrante = 8 / 25 = 0,32 m²", () => {
    expect(calcular({ ...base, taxaFiltracao: 25 }).areaFiltranteM2).toBeCloseTo(0.32, 9);
  });

  it("uso coletivo usa 4 h; tempo digitado vence o do uso", () => {
    expect(calcular({ ...base, uso: "coletiva" }).horasRecirculacao).toBe(4);
    expect(calcular({ ...base, uso: "coletiva", horasRecirculacao: 3 }).horasRecirculacao).toBe(3);
    expect(calcular({ ...base, uso: "coletiva" }).vazaoM3h).toBeCloseTo(12, 9);
  });

  it("volume: circular e informado", () => {
    const circ = entradaSchema.parse({ ...base, forma: "circular", diametroM: 4, profundidadeMediaM: 1.2 });
    expect(volumeDaPiscina(circ)).toBeCloseTo(Math.PI * 4 * 1.2, 9);
    expect(calcular({ ...base, forma: "volume", volumeM3: 30 }).volumeM3).toBe(30);
  });

  it("avisa quando a perda dos equipamentos não foi informada", () => {
    const a = calcular({ ...base, perdaEquipamentosMca: 0 });
    expect(a.alertas.some((x) => x.includes("equipamentos"))).toBe(true);
    expect(r.alertas.some((x) => x.includes("equipamentos"))).toBe(false);
  });

  it("DN pequeno digitado dispara alerta de velocidade", () => {
    const a = calcular({ ...base, dnSuccao: 32 });
    expect(a.alertas.some((x) => x.includes("sucção") && x.includes("m/s"))).toBe(true);
  });

  it("recusa forma sem as medidas dela", () => {
    expect(entradaSchema.safeParse({ ...base, larguraM: undefined }).success).toBe(false);
    expect(entradaSchema.safeParse({ ...base, forma: "circular" }).success).toBe(false);
    expect(entradaSchema.safeParse({ ...base, forma: "volume" }).success).toBe(false);
    expect(entradaSchema.safeParse({ ...base, profundidadeMediaM: undefined }).success).toBe(false);
  });
});
