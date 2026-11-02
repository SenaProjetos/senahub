import { describe, expect, it } from "vitest";

import { calcular } from "@/modules/ferramentas/calc/electrical-demand";

import { calcularEstudo, entradaDoMotor, ROTULO_SEM_TIPO, SEM_TIPO_PONTO } from "./calculo";
import { conteudoSchema, conteudoVazio, type ConteudoEstudo } from "./conteudo";

const carga = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  descricao: `carga ${id}`,
  quantidade: 1,
  potenciaW: 100,
  fp: 1,
  rendimento: 1,
  fd: 1,
  tensaoV: 127,
  ligacao: "mono" as const,
  ...over,
});

function estudo(): ConteudoEstudo {
  return conteudoSchema.parse({
    ambientes: [
      {
        id: "a1",
        nome: "Sala",
        cargas: [
          carga("c1", { descricao: "lâmpadas", quantidade: 4, potenciaW: 10, tipoPonto: "iluminacao" }),
          carga("c2", { descricao: "tomadas", quantidade: 2, potenciaW: 100, fd: 0.5, tipoPonto: "tomada_uso_geral" }),
        ],
      },
      { id: "a2", nome: "Banheiro", cargas: [carga("c3", { descricao: "chuveiro", potenciaW: 5500, tensaoV: 220, tipoPonto: "tomada_uso_especifico" })] },
      { id: "a3", nome: "Garagem", cargas: [] },
    ],
    condicoes: {},
  });
}

describe("calcularEstudo", () => {
  it("sem nenhuma carga não há total, e o ambiente vazio fica sem resultado", () => {
    const r = calcularEstudo({ ...conteudoVazio(), ambientes: [{ id: "a", nome: "Sala", cargas: [] }] });
    expect(r.total).toBeNull();
    expect(r.ambientes).toEqual([{ id: "a", nome: "Sala", cargas: 0, resultado: null }]);
    expect(r.porTipoPonto).toEqual([]);
  });

  it("totais conferidos à mão (40 + 200 + 5500 W instalados; 40 + 100 + 5500 W demandados)", () => {
    const { total } = calcularEstudo(estudo());
    expect(total?.pInstaladaW).toBeCloseTo(5740, 6);
    expect(total?.pDemandadaW).toBeCloseTo(5640, 6);
    expect(total?.sDemandadaVA).toBeCloseTo(5640, 6);
    // 5640 / (√3 · 220) com os padrões de alimentação do motor (220 V trifásico)
    expect(total?.correnteTotalA).toBeCloseTo(14.8016, 3);
  });

  it("os subtotais dos ambientes somam exatamente o total (potências instalada, demandada e aparente)", () => {
    const r = calcularEstudo(estudo());
    const comResultado = r.ambientes.filter((a) => a.resultado);
    expect(comResultado.map((a) => a.nome)).toEqual(["Sala", "Banheiro"]);
    const soma = (f: (x: NonNullable<(typeof comResultado)[number]["resultado"]>) => number) =>
      comResultado.reduce((s, a) => s + f(a.resultado!), 0);
    expect(soma((x) => x.pInstaladaW)).toBeCloseTo(r.total!.pInstaladaW, 9);
    expect(soma((x) => x.pDemandadaW)).toBeCloseTo(r.total!.pDemandadaW, 9);
    expect(soma((x) => x.sDemandadaVA)).toBeCloseTo(r.total!.sDemandadaVA, 9);
    expect(r.ambientes.find((a) => a.nome === "Garagem")?.resultado).toBeNull();
  });

  it("a soma continua exata com rendimento e fator de potência diferentes de 1", () => {
    const c = conteudoSchema.parse({
      ambientes: [
        { id: "a", nome: "Oficina", cargas: [carga("m", { potenciaW: 1000, rendimento: 0.8, fp: 0.8, fd: 0.8, tensaoV: 220 })] },
        { id: "b", nome: "Cozinha", cargas: [carga("f", { potenciaW: 1500, fp: 0.9 })] },
      ],
      condicoes: {},
    });
    const r = calcularEstudo(c);
    const m = r.ambientes[0].resultado!;
    expect(m.pInstaladaW).toBeCloseTo(1250, 9); // 1000 / 0,8
    expect(m.pDemandadaW).toBeCloseTo(1000, 9); // × 0,8
    expect(m.sDemandadaVA).toBeCloseTo(1250, 9); // 1000 / 0,8
    expect(r.ambientes.reduce((s, a) => s + a.resultado!.sDemandadaVA, 0)).toBeCloseTo(r.total!.sDemandadaVA, 9);
  });

  it("subtotal por tipo de ponto agrupa as cargas e fecha com o total", () => {
    const r = calcularEstudo(estudo());
    const porTipo = Object.fromEntries(r.porTipoPonto.map((g) => [g.tipo, g]));
    expect(porTipo.iluminacao.pInstaladaW).toBeCloseTo(40, 9);
    expect(porTipo.tomada_uso_geral.pDemandadaW).toBeCloseTo(100, 9);
    expect(porTipo.tomada_uso_especifico.pInstaladaW).toBeCloseTo(5500, 9);
    expect(r.porTipoPonto.reduce((s, g) => s + g.pDemandadaW, 0)).toBeCloseTo(r.total!.pDemandadaW, 9);
  });

  it("carga sem tipo cai no grupo 'sem tipo'", () => {
    const c = conteudoSchema.parse({ ambientes: [{ id: "a", nome: "Sala", cargas: [carga("x")] }], condicoes: {} });
    const r = calcularEstudo(c);
    expect(r.porTipoPonto).toHaveLength(1);
    expect(r.porTipoPonto[0]).toMatchObject({ tipo: SEM_TIPO_PONTO, rotulo: ROTULO_SEM_TIPO, cargas: 1 });
  });

  it("as condições valem para todos os ambientes (FCT × FCA entram na corrente corrigida)", () => {
    const c = conteudoSchema.parse({
      ambientes: [{ id: "a", nome: "Sala", cargas: [carga("x")] }],
      condicoes: { temperaturaC: 40, circuitosAgrupados: 3 },
    });
    const { total, ambientes } = calcularEstudo(c);
    expect(total?.fct).toBe(0.87);
    expect(total?.fca).toBe(0.7);
    expect(ambientes[0].resultado?.fct).toBe(0.87);
  });
});

describe("entradaDoMotor", () => {
  it("é a mesma conta da calculadora: igual a rodar o motor na lista achatada", () => {
    const c = estudo();
    const direto = calcular(entradaDoMotor(c));
    expect(calcularEstudo(c).total).toEqual(direto);
  });

  it("prefixa a descrição com o ambiente", () => {
    const e = entradaDoMotor(estudo());
    expect(e.cargas.map((x) => x.descricao)).toEqual(["Sala — lâmpadas", "Sala — tomadas", "Banheiro — chuveiro"]);
  });
});
