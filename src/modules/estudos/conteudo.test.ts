import { describe, expect, it } from "vitest";

import {
  MAX_AMBIENTES,
  MAX_CARGAS_ESTUDO,
  conteudoSchema,
  conteudoVazio,
  lerConteudo,
  nomeEstudoSchema,
  totalDeCargas,
} from "./conteudo";

const carga = (id: string) => ({ id, descricao: "x", quantidade: 1, potenciaW: 100, fp: 1, rendimento: 1, fd: 1, tensaoV: 127, ligacao: "mono" });

describe("conteudoSchema", () => {
  it("o estudo vazio é válido e traz as condições padrão do motor", () => {
    const c = conteudoVazio();
    expect(conteudoSchema.safeParse(c).success).toBe(true);
    expect(c.ambientes).toEqual([]);
    expect(c.condicoes).toMatchObject({ isolacao: "PVC", temperaturaC: 30, circuitosAgrupados: 1, alimentacaoTensaoV: 220, alimentacaoLigacao: "tri" });
  });

  it("aceita um ambiente sem carga", () => {
    expect(conteudoSchema.safeParse({ ambientes: [{ id: "a", nome: "Sala", cargas: [] }], condicoes: {} }).success).toBe(true);
  });

  it("nenhum valor técnico vem por padrão: potência é obrigatória", () => {
    const { potenciaW: _p, ...semPotencia } = carga("c");
    void _p;
    expect(conteudoSchema.safeParse({ ambientes: [{ id: "a", nome: "Sala", cargas: [semPotencia] }], condicoes: {} }).success).toBe(false);
  });

  it("recusa ambiente sem nome", () => {
    const r = conteudoSchema.safeParse({ ambientes: [{ id: "a", nome: "  ", cargas: [] }], condicoes: {} });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Dê um nome ao ambiente.");
  });

  it("recusa temperatura fora da Tabela 40 sem FCT manual, mas aceita com FCT manual", () => {
    const base = { ambientes: [], condicoes: { temperaturaC: 33 } };
    expect(conteudoSchema.safeParse(base).success).toBe(false);
    expect(conteudoSchema.safeParse({ ...base, condicoes: { temperaturaC: 33, fctManual: 0.95 } }).success).toBe(true);
  });

  it(`recusa mais de ${MAX_CARGAS_ESTUDO} cargas no total`, () => {
    const ambientes = [
      { id: "a", nome: "A", cargas: Array.from({ length: 150 }, (_, i) => carga(`a${i}`)) },
      { id: "b", nome: "B", cargas: Array.from({ length: 51 }, (_, i) => carga(`b${i}`)) },
    ];
    expect(conteudoSchema.safeParse({ ambientes, condicoes: {} }).success).toBe(false);
    ambientes[1].cargas.pop();
    expect(conteudoSchema.safeParse({ ambientes, condicoes: {} }).success).toBe(true);
  });

  it(`recusa mais de ${MAX_AMBIENTES} ambientes`, () => {
    const ambientes = Array.from({ length: MAX_AMBIENTES + 1 }, (_, i) => ({ id: `a${i}`, nome: `A${i}`, cargas: [] }));
    expect(conteudoSchema.safeParse({ ambientes, condicoes: {} }).success).toBe(false);
  });

  it("recusa identificadores repetidos", () => {
    const r = conteudoSchema.safeParse({
      ambientes: [
        { id: "a", nome: "A", cargas: [carga("c")] },
        { id: "b", nome: "B", cargas: [carga("c")] },
      ],
      condicoes: {},
    });
    expect(r.success).toBe(false);
  });

  it("recusa tipo de ponto desconhecido", () => {
    const c = { ...carga("c"), tipoPonto: "chuveiro" };
    expect(conteudoSchema.safeParse({ ambientes: [{ id: "a", nome: "A", cargas: [c] }], condicoes: {} }).success).toBe(false);
  });
});

describe("lerConteudo / totalDeCargas / nome", () => {
  it("devolve null para JSON que não passa no esquema", () => {
    expect(lerConteudo({ ambientes: "x" })).toBeNull();
    expect(lerConteudo(null)).toBeNull();
  });

  it("conta as cargas de todos os ambientes", () => {
    const c = conteudoSchema.parse({
      ambientes: [
        { id: "a", nome: "A", cargas: [carga("1"), carga("2")] },
        { id: "b", nome: "B", cargas: [carga("3")] },
      ],
      condicoes: {},
    });
    expect(totalDeCargas(c)).toBe(3);
  });

  it("o nome do estudo é obrigatório e aparado", () => {
    expect(nomeEstudoSchema.safeParse("   ").success).toBe(false);
    expect(nomeEstudoSchema.parse("  Casa principal ")).toBe("Casa principal");
  });
});
