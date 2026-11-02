import { describe, it, expect } from "vitest";
import { areaDaUnidade, calcular, ciDoFuro, entradaSchema, type EntradaInfiltracaoInput } from "./soil-infiltration";

// Valores conferidos à mão (script independente, mesma fórmula):
// furo 1: 10 min para 1 cm → t = 10 min/cm → Ci = 490/12,5 = 39,2
// furo 2: 40 min para 2 cm → t = 20 min/cm → Ci = 490/22,5 = 21,7778 (o menor, adotado)
// furo 3: 30 min para 3 cm → t = 10 min/cm → Ci = 39,2
// 5 pessoas × 150 L = 750 L/dia → A = 750 / 21,7778 = 34,4388 m²
// D = 1,2 m, 2 unidades → lateral por unidade 17,2194 m² → H = 4,5676 m ; topo 0,5 m → fundo a 5,0676 m
// nível d'água 6 m, mínimo 1,5 m → H máximo = 6 − 1,5 − 0,5 = 4,0 m → 34,4388 / (π·1,2·4) = 2,284 → 3 unidades
const base: EntradaInfiltracaoInput = {
  contribuicao: "pessoas",
  pessoas: 5,
  contribuicaoLPessoaDia: 150,
  furos: [
    { tempoMin: 10, rebaixamentoCm: 1 },
    { tempoMin: 40, rebaixamentoCm: 2 },
    { tempoMin: 30, rebaixamentoCm: 3 },
  ],
  diametroM: 1.2,
  unidades: 2,
  profundidadeTopoM: 0.5,
  nivelAguaM: 6,
};

describe("H04 — Destino final do esgoto (sumidouro)", () => {
  const r = calcular(base);

  it("Ci por furo: 39,2 / 21,78 / 39,2 e taxa em min/m", () => {
    expect(r.furos.map((f) => f.ci)).toEqual([expect.closeTo(39.2, 9), expect.closeTo(21.7778, 4), expect.closeTo(39.2, 9)]);
    expect(r.furos[1].minPorCm).toBeCloseTo(20, 9);
    expect(r.furos[1].minPorM).toBeCloseTo(2000, 9);
  });
  it("adota o menor Ci (furo mais lento)", () => expect(r.ciAdotado).toBeCloseTo(21.7778, 4));
  it("volume 750 L/dia e área necessária 34,4388 m²", () => {
    expect(r.volumeDiarioL).toBe(750);
    expect(r.areaNecessariaM2).toBeCloseTo(34.4388, 3);
  });
  it("2 unidades de D = 1,2 m: H = 4,5676 m, fundo a 5,0676 m", () => {
    expect(r.areaPorUnidadeM2).toBeCloseTo(17.2194, 3);
    expect(r.profundidadeUtilM).toBeCloseTo(4.5676, 3);
    expect(r.profundidadeFundoM).toBeCloseTo(5.0676, 3);
  });
  it("lençol a 6 m: limite de 4,0 m, não cabe, precisa de 3 unidades", () => {
    expect(r.limite?.profundidadeMaximaM).toBeCloseTo(4, 9);
    expect(r.limite?.folgaM).toBeCloseTo(0.9324, 3);
    expect(r.limite?.cabe).toBe(false);
    expect(r.limite?.unidadesParaCaber).toBe(3);
    expect(r.alertas.some((a) => a.includes("Use 3 unidades"))).toBe(true);
  });

  it("com 3 unidades cabe: H = 3,0451 m, sem alerta de lençol", () => {
    const c = calcular({ ...base, unidades: 3 });
    expect(c.profundidadeUtilM).toBeCloseTo(3.0451, 3);
    expect(c.limite?.cabe).toBe(true);
    expect(c.alertas.some((a) => a.includes("lençol"))).toBe(false);
  });

  it("contar o fundo reduz a profundidade em π·D²/4 ÷ (π·D) = D/4 = 0,3 m", () => {
    const c = calcular({ ...base, considerarFundo: true });
    expect(c.profundidadeUtilM).toBeCloseTo(4.2676, 3);
  });

  it("uma só unidade: H = 9,1352 m e alerta de uso alternado", () => {
    const c = calcular({ ...base, unidades: 1 });
    expect(c.profundidadeUtilM).toBeCloseTo(9.1352, 3);
    expect(c.alertas.some((a) => a.includes("uso alternado"))).toBe(true);
  });

  it("sem sondagem: não verifica o lençol e avisa", () => {
    const c = calcular({ ...base, nivelAguaM: undefined });
    expect(c.limite).toBeNull();
    expect(c.alertas.some((a) => a.includes("nível d'água"))).toBe(true);
  });

  it("lençol raso demais: nenhuma unidade cabe", () => {
    const c = calcular({ ...base, nivelAguaM: 1.8 });
    expect(c.limite?.profundidadeMaximaM).toBeLessThan(0);
    expect(c.limite?.unidadesParaCaber).toBeNull();
    expect(c.alertas.some((a) => a.includes("raso demais"))).toBe(true);
  });

  it("Ci informado de laudo dispensa os furos", () => {
    const c = calcular({ ...base, origemCi: "informado", ciInformado: 100, furos: [] });
    expect(c.ciAdotado).toBe(100);
    expect(c.areaNecessariaM2).toBeCloseTo(7.5, 9);
  });

  it("volume informado dispensa pessoas", () => {
    const c = calcular({ ...base, contribuicao: "volume", volumeDiarioL: 1000, pessoas: undefined, contribuicaoLPessoaDia: undefined });
    expect(c.volumeDiarioL).toBe(1000);
  });

  it("um furo só avisa sobre o número mínimo", () => {
    const c = calcular({ ...base, furos: [{ tempoMin: 10, rebaixamentoCm: 1 }] });
    expect(c.alertas.some((a) => a.includes("único furo"))).toBe(true);
  });

  it("ciDoFuro e areaDaUnidade", () => {
    expect(ciDoFuro({ tempoMin: 10, rebaixamentoCm: 1 }).ci).toBeCloseTo(39.2, 9);
    expect(areaDaUnidade(1, 2, false)).toBeCloseTo(2 * Math.PI, 9);
    expect(areaDaUnidade(1, 2, true)).toBeCloseTo(2 * Math.PI + Math.PI / 4, 9);
  });

  it("recusa entradas incompletas, com mensagem em português", () => {
    const msg = (v: object) => {
      const s = entradaSchema.safeParse(v);
      return s.success ? null : s.error.issues[0].message;
    };
    expect(msg({ ...base, pessoas: undefined })).toBe("Informe o número de pessoas.");
    expect(msg({ ...base, contribuicaoLPessoaDia: undefined })).toBe("Informe a contribuição por pessoa.");
    expect(msg({ ...base, furos: [] })).toBe("Informe ao menos um furo do teste de percolação.");
    expect(msg({ ...base, origemCi: "informado", furos: [] })).toBe("Informe o coeficiente de infiltração.");
    expect(msg({ ...base, contribuicao: "volume", pessoas: undefined, contribuicaoLPessoaDia: undefined })).toBe("Informe o volume diário.");
    expect(msg({ ...base, unidades: 0 })).toBe("Use ao menos 1 unidade.");
    expect(msg({ ...base, diametroM: undefined })).not.toBeNull();
  });
});
