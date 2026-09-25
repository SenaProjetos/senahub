import { describe, expect, it } from "vitest";
import { custoDaFolha, custosComResumo, custoTotal, type CustoLinha } from "./custo";

const taxas = new Map([
  ["ana", 80],
  ["bia", 55.5],
]);

describe("custoDaFolha", () => {
  it("horas × custo/hora de cada pessoa, somado ao centavo", () => {
    const c = custoDaFolha({
      horasDaLinha: 12.5,
      atribuicoes: [
        { userId: "ana", horas: 10 },
        { userId: "bia", horas: 2.5 },
      ],
      custoHora: taxas,
    });
    expect(c).toEqual({ custo: 938.75, motivo: null });
  });

  it("linha não estimada: desconhecido, nunca zero", () => {
    expect(custoDaFolha({ horasDaLinha: null, atribuicoes: [], custoHora: taxas })).toEqual({
      custo: null,
      motivo: "sem_horas",
    });
  });

  it("perfil com horas não tem taxa: desconhecido, dizendo por quê", () => {
    const c = custoDaFolha({
      horasDaLinha: 8,
      atribuicoes: [
        { userId: "ana", horas: 4 },
        { userId: null, horas: 4 },
      ],
      custoHora: taxas,
    });
    expect(c).toEqual({ custo: null, motivo: "perfil" });
  });

  it("pessoa sem custo/hora cadastrado: desconhecido (somar só a Ana daria um orçamento menor)", () => {
    const c = custoDaFolha({
      horasDaLinha: 8,
      atribuicoes: [
        { userId: "ana", horas: 4 },
        { userId: "caio", horas: 4 },
      ],
      custoHora: taxas,
    });
    expect(c).toEqual({ custo: null, motivo: "sem_custo_hora" });
  });

  it("zero conhecido (marco, etapa de terceiro) custa zero; quem está sem hora não custa", () => {
    expect(custoDaFolha({ horasDaLinha: 0, atribuicoes: [], custoHora: taxas })).toEqual({ custo: 0, motivo: null });
    expect(
      custoDaFolha({ horasDaLinha: 0, atribuicoes: [{ userId: "caio", horas: 0 }], custoHora: taxas }),
    ).toEqual({ custo: 0, motivo: null });
  });

  it("dízima da taxa arredonda por atribuição", () => {
    const c = custoDaFolha({
      horasDaLinha: 1,
      atribuicoes: [{ userId: "x", horas: 0.33 }],
      custoHora: new Map([["x", 33.33]]),
    });
    expect(c).toEqual({ custo: 11, motivo: null }); // 10,9989 → 11,00
  });
});

describe("custosComResumo", () => {
  const ok = (v: number): CustoLinha => ({ custo: v, motivo: null });
  const linhas = [
    { id: "raiz", parentId: null },
    { id: "a", parentId: "raiz" },
    { id: "a1", parentId: "a" },
    { id: "a2", parentId: "a" },
    { id: "b", parentId: "raiz" },
  ];

  it("resumo soma os filhos, em qualquer profundidade", () => {
    const c = custosComResumo(linhas, new Map([["a1", ok(100.1)], ["a2", ok(0.2)], ["b", ok(50)]]));
    expect(c.get("a")).toEqual(ok(100.3));
    expect(c.get("raiz")).toEqual(ok(150.3));
    expect(custoTotal(linhas, c)).toEqual(ok(150.3));
  });

  it("um filho desconhecido deixa o resumo e o total desconhecidos", () => {
    const c = custosComResumo(
      linhas,
      new Map<string, CustoLinha>([
        ["a1", ok(100)],
        ["a2", { custo: null, motivo: "sem_custo_hora" }],
        ["b", ok(50)],
      ]),
    );
    expect(c.get("a")).toEqual({ custo: null, motivo: "filho_sem_custo" });
    expect(c.get("raiz")?.custo).toBeNull();
    expect(c.get("b")).toEqual(ok(50));
    expect(custoTotal(linhas, c).custo).toBeNull();
  });

  it("ciclo (dado corrompido) vira desconhecido, sem estourar a pilha", () => {
    const ciclo = [
      { id: "x", parentId: "y" },
      { id: "y", parentId: "x" },
    ];
    const c = custosComResumo(ciclo, new Map());
    expect(c.get("x")?.custo).toBeNull();
  });
});
