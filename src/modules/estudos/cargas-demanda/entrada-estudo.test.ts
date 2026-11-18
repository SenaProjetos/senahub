import { describe, expect, it } from "vitest";

import { calcularEntrada, entradaVazia, metodosDeInstalacao, opcoesDeAgrupamento } from "./entrada-estudo";

const perto = (recebido: number | null | undefined, esperado: number, tol = 0.01) => {
  expect(recebido).not.toBeNull();
  expect(recebido).toBeDefined();
  expect(Math.abs((recebido as number) - esperado)).toBeLessThanOrEqual(tol + 1e-12);
};

/** Método "3" da Tabela 33 = eletroduto aparente (referência B1). */
const entrada = (extra: Record<string, unknown> = {}) => ({
  ...entradaVazia({ nivel: "cpg" }),
  metodoInstalacao: "3",
  isolacao: "PVC" as const,
  material: "cobre" as const,
  carregados: 3 as const,
  ...extra,
});

describe("entrada do CMD 1 do caso 29 (29,21 kVA, 380/220 V, trifásica)", () => {
  const r = calcularEntrada(entrada(), 29.21, "380/220", "tri");
  it("corrente I = S ÷ (√3 · V) = 44,38 A", () => perto(r.correnteA, 44.38));
  it("disjuntor sugerido = 50 A (menor da série ≥ I)", () => expect(r.disjuntorSugeridoA).toBe(50));
  it("seção sugerida = 10 mm² (FCT e FCA = 1)", () => expect(r.secaoFinal?.sugeridaMm2).toBe(10));
  it("sem pendência", () => expect(r.faltam).toEqual([]));
});

describe("entrada do CPG do caso 29 (55,16 kVA)", () => {
  const r = calcularEntrada(entrada(), 55.16, "380/220", "tri");
  it("corrente = 83,81 A", () => perto(r.correnteA, 83.81));
  it("disjuntor = 90 A", () => expect(r.disjuntorSugeridoA).toBe(90));
  it("seção = 25 mm²", () => expect(r.secaoFinal?.sugeridaMm2).toBe(25));
  it("Ib′ = I quando FCT × FCA = 1", () => perto(r.ibCorrigidaA, 83.81));
});

describe("o que a pessoa digita vale mais que o sugerido", () => {
  it("disjuntor e seção adotados", () => {
    const r = calcularEntrada(entrada({ disjuntorAdotadoA: 100, secaoAdotadaMm2: 35 }), 55.16, "380/220", "tri");
    expect(r.disjuntorAdotadoA).toBe(100);
    expect(r.secaoFinal?.adotadaMm2).toBe(35);
    expect(r.disjuntorSugeridoA).toBe(90);
  });

  it("seção digitada menor que a calculada gera o alerta da spec", () => {
    const r = calcularEntrada(entrada({ secaoAdotadaMm2: 16 }), 55.16, "380/220", "tri");
    expect(r.avisos.map((a) => a.id)).toContain("secao_digitada_menor");
  });

  it("FCA digitado entra na corrente corrigida", () => {
    const r = calcularEntrada(entrada({ fca: 0.5 }), 29.21, "380/220", "tri");
    perto(r.ibCorrigidaA, 44.38 / 0.5);
  });
});

describe("temperatura e agrupamento", () => {
  it("40 °C no ar muda o FCT pela Tabela 40 (PVC)", () => {
    const r = calcularEntrada(entrada({ temperaturaC: 40 }), 29.21, "380/220", "tri");
    expect(r.fct?.adotado).not.toBe(1);
    expect(r.ibCorrigidaA!).toBeGreaterThan(r.correnteA!);
  });

  it("temperatura fora da tabela: recusa com a mensagem da spec e sem seção", () => {
    const r = calcularEntrada(entrada({ temperaturaC: 65 }), 29.21, "380/220", "tri");
    expect(r.avisos.map((a) => a.id)).toContain("temperatura_fora_tabela");
    expect(r.secaoFinal).toBeNull();
    expect(r.faltam).toContain("fator de temperatura");
  });

  it("FCT digitado resolve a temperatura fora da tabela", () => {
    const r = calcularEntrada(entrada({ temperaturaC: 65, fct: 0.5 }), 29.21, "380/220", "tri");
    perto(r.ibCorrigidaA, 44.38 / 0.5);
  });
});

describe("pendências", () => {
  it("sem sistema ou ligação, sem corrente", () => {
    const r = calcularEntrada(entrada(), 29.21, null, null);
    expect(r.correnteA).toBeNull();
    expect(r.faltam).toEqual(expect.arrayContaining(["sistema de tensão", "ligação"]));
  });

  it("sem escolhas de instalação, só a corrente e o disjuntor", () => {
    const r = calcularEntrada(entradaVazia({ nivel: "cpg" }), 29.21, "380/220", "tri");
    perto(r.correnteA, 44.38);
    expect(r.disjuntorSugeridoA).toBe(50);
    expect(r.secaoFinal).toBeNull();
    expect(r.faltam).toEqual(expect.arrayContaining(["método de instalação", "isolação", "material", "condutores carregados"]));
  });

  it("sem demanda não há corrente", () => {
    const r = calcularEntrada(entrada(), null, "380/220", "tri");
    expect(r.correnteA).toBeNull();
    expect(r.faltam).toContain("demanda");
  });
});

describe("lista de métodos de instalação", () => {
  it("vem da Tabela 33 com a descrição e o método de referência", () => {
    const l = metodosDeInstalacao();
    expect(l.length).toBeGreaterThan(40);
    expect(l.find((m) => m.valor === "3")?.referencia).toBe("B1");
  });
});

describe("formas de agrupamento", () => {
  it("B1 tem formas com o texto da norma; o enterrado (D) só as de cabos e eletrodutos enterrados", () => {
    const b1 = opcoesDeAgrupamento("B1");
    expect(b1.length).toBeGreaterThan(0);
    expect(b1.every((o) => o.rotulo.length > 0)).toBe(true);
    const d = opcoesDeAgrupamento("D");
    expect(d.every((o) => o.forma.tabela === "44" || o.forma.tabela === "45")).toBe(true);
  });

  it("o valor serializado volta à mesma forma", () => {
    for (const o of opcoesDeAgrupamento("D")) expect(JSON.parse(o.valor)).toEqual(o.forma);
  });
});
