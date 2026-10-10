import { describe, expect, it } from "vitest";
import {
  agruparConflitos,
  chaveParCategorias,
  nomeDoLado,
  paresDeCategorias,
  rotuloCategoria,
  type ConflitoListavel,
} from "@/modules/coordenacao/conflitos-lista";

function conflito(
  a: [number, string | null, string | null],
  b: [number, string | null, string | null],
  profundidade: number,
): ConflitoListavel {
  return {
    a: { modeloId: "ARQ", localId: a[0], categoria: a[1], nome: a[2] },
    b: { modeloId: "EST", localId: b[0], categoria: b[1], nome: b[2] },
    profundidade,
  };
}

const lista = [
  conflito([1, "IFCSLAB", "Laje L1"], [10, "IFCBEAM", "V1"], 0.1),
  conflito([1, "IFCSLAB", "Laje L1"], [11, "IFCBEAM", "V2"], 0.3),
  conflito([1, "IFCSLAB", "Laje L1"], [12, "IFCCOLUMN", "P1"], 0.05),
  conflito([2, "IFCWALLSTANDARDCASE", null], [10, "IFCBEAM", "V1"], 0.5),
];

describe("rotuloCategoria", () => {
  it("traduz as classes comuns", () => {
    expect(rotuloCategoria("IFCBEAM")).toBe("Viga");
    expect(rotuloCategoria("IFCWALLSTANDARDCASE")).toBe("Parede");
    expect(rotuloCategoria("IfcSlab")).toBe("Laje");
  });
  it("classe desconhecida perde só o prefixo", () => {
    expect(rotuloCategoria("IFCSHADINGDEVICE")).toBe("SHADINGDEVICE");
    expect(rotuloCategoria(null)).toBe("Elemento");
  });
});

describe("paresDeCategorias", () => {
  it("conta cada combinação, da mais frequente para a menos", () => {
    expect(paresDeCategorias(lista).map((p) => [p.chave, p.total])).toEqual([
      ["IFCSLAB|IFCBEAM", 2],
      ["IFCSLAB|IFCCOLUMN", 1],
      ["IFCWALLSTANDARDCASE|IFCBEAM", 1],
    ]);
  });
});

describe("agruparConflitos", () => {
  it("agrupa por elemento do modelo A, quem tem mais conflitos primeiro", () => {
    const grupos = agruparConflitos(lista);
    expect(grupos.map((g) => [g.elemento.localId, g.conflitos.length])).toEqual([
      [1, 3],
      [2, 1],
    ]);
  });

  it("dentro do grupo, maior penetração primeiro", () => {
    const [laje] = agruparConflitos(lista);
    expect(laje.conflitos.map((c) => c.b.localId)).toEqual([11, 10, 12]);
    expect(laje.maiorProfundidade).toBe(0.3);
  });

  it("combinação ignorada some da lista inteira", () => {
    const grupos = agruparConflitos(lista, new Set([chaveParCategorias(lista[0])]));
    expect(grupos.map((g) => [g.elemento.localId, g.conflitos.map((c) => c.b.localId)])).toEqual([
      [2, [10]],
      [1, [12]],
    ]);
  });
});

describe("nomeDoLado", () => {
  it("usa o Name do IFC e cai para categoria + id", () => {
    expect(nomeDoLado(lista[0].a)).toBe("Laje L1");
    expect(nomeDoLado(lista[3].a)).toBe("Parede #2");
  });
});
