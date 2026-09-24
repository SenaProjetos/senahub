import { describe, expect, it } from "vitest";
import {
  calcularCodigos,
  compararCodigos,
  diferencaDeCodigos,
  type NoEap,
} from "./codigo-eap";

const no = (id: string, parentId: string | null, ordem: number): NoEap => ({ id, parentId, ordem });

const mapa = (nos: NoEap[]) => new Map(calcularCodigos(nos).map((c) => [c.id, c.codigo]));

describe("calcularCodigos", () => {
  it("numera as raízes a partir de 1", () => {
    const c = mapa([no("a", null, 0), no("b", null, 1), no("c", null, 2)]);
    expect(c.get("a")).toBe("1");
    expect(c.get("b")).toBe("2");
    expect(c.get("c")).toBe("3");
  });

  it("reproduz a hierarquia do Doc 03 §3", () => {
    const nos: NoEap[] = [
      no("projeto", null, 0),
      no("desenvolvimento", "projeto", 1),
      no("eletrico", "desenvolvimento", 0),
      no("basico", "eletrico", 0),
      no("executivo", "eletrico", 1),
      no("planejamento", "projeto", 0),
    ];
    const c = mapa(nos);
    expect(c.get("projeto")).toBe("1");
    expect(c.get("planejamento")).toBe("1.1");
    expect(c.get("desenvolvimento")).toBe("1.2");
    expect(c.get("eletrico")).toBe("1.2.1");
    expect(c.get("basico")).toBe("1.2.1.1");
    expect(c.get("executivo")).toBe("1.2.1.2");
  });

  it("respeita a ordem entre irmãos, não a ordem de entrada", () => {
    const c = mapa([no("segundo", null, 5), no("primeiro", null, 1)]);
    expect(c.get("primeiro")).toBe("1");
    expect(c.get("segundo")).toBe("2");
  });

  it("desempata ordem igual pelo id, para o resultado ser estável", () => {
    const um = mapa([no("b", null, 0), no("a", null, 0)]);
    const dois = mapa([no("a", null, 0), no("b", null, 0)]);
    expect(um.get("a")).toBe(dois.get("a"));
    expect(um.get("b")).toBe(dois.get("b"));
  });

  it("devolve o nível para a tela indentar sem recalcular", () => {
    const r = calcularCodigos([no("p", null, 0), no("f", "p", 0), no("n", "f", 0)]);
    expect(r.find((x) => x.id === "p")!.nivel).toBe(1);
    expect(r.find((x) => x.id === "f")!.nivel).toBe(2);
    expect(r.find((x) => x.id === "n")!.nivel).toBe(3);
  });
});

describe("mover a linha muda o código, nunca a identidade", () => {
  it("o exemplo do Doc 02: 3.2.4 vira 4.1.2 e a atividade é a mesma", () => {
    // Antes: dois ramos, a atividade no segundo filho do segundo ramo.
    const antes = mapa([
      no("r1", null, 0),
      no("r2", null, 1),
      no("r3", null, 2),
      no("r3f1", "r3", 0),
      no("r3f2", "r3", 1),
      no("alvo", "r3f2", 3),
      no("x1", "r3f2", 0),
      no("x2", "r3f2", 1),
      no("x3", "r3f2", 2),
    ]);
    expect(antes.get("alvo")).toBe("3.2.4");

    // Depois: a MESMA linha (mesmo id) pendurada noutro lugar.
    const depois = mapa([
      no("r1", null, 0),
      no("r2", null, 1),
      no("r3", null, 2),
      no("r4", null, 3),
      no("r4f1", "r4", 0),
      no("y1", "r4f1", 0),
      no("alvo", "r4f1", 1),
    ]);
    expect(depois.get("alvo")).toBe("4.1.2");
  });
});

describe("árvore malformada não perde linha", () => {
  it("órfão vira raiz em vez de sumir da tela", () => {
    const c = mapa([no("a", null, 0), no("orfao", "pai-que-nao-existe", 0)]);
    expect(c.size).toBe(2);
    expect(c.get("orfao")).toBeDefined();
  });

  it("linha apontando para si mesma vira raiz", () => {
    const c = mapa([no("a", "a", 0)]);
    expect(c.get("a")).toBe("1");
  });

  it("ciclo de parentesco não trava e todas as linhas saem", () => {
    const c = mapa([no("a", "b", 0), no("b", "a", 1)]);
    expect(c.size).toBe(2);
  });

  it("lista vazia devolve lista vazia", () => {
    expect(calcularCodigos([])).toEqual([]);
  });
});

describe("diferencaDeCodigos", () => {
  it("reporta só quem mudou de lugar", () => {
    const calculados = calcularCodigos([no("a", null, 0), no("b", null, 1)]);
    const atuais = new Map([
      ["a", "1"],
      ["b", "5"],
    ]);
    const d = diferencaDeCodigos(atuais, calculados);
    expect(d).toHaveLength(1);
    expect(d[0]).toEqual({ tarefaId: "b", codigoAnterior: "5", codigoNovo: "2" });
  });

  it("linha nova entra com anterior null", () => {
    const calculados = calcularCodigos([no("nova", null, 0)]);
    const d = diferencaDeCodigos(new Map(), calculados);
    expect(d[0]).toEqual({ tarefaId: "nova", codigoAnterior: null, codigoNovo: "1" });
  });

  it("nada muda, nada é gravado — histórico não vira ruído", () => {
    const calculados = calcularCodigos([no("a", null, 0), no("b", null, 1)]);
    const atuais = new Map([
      ["a", "1"],
      ["b", "2"],
    ]);
    expect(diferencaDeCodigos(atuais, calculados)).toEqual([]);
  });
});

describe("compararCodigos", () => {
  it("ordena por número, não por texto — 1.2 antes de 1.10", () => {
    const ordenado = ["1.10", "1.2", "1.1", "2"].sort(compararCodigos);
    expect(ordenado).toEqual(["1.1", "1.2", "1.10", "2"]);
  });

  it("pai vem antes do filho", () => {
    expect(compararCodigos("1", "1.1")).toBeLessThan(0);
  });

  it("códigos iguais empatam", () => {
    expect(compararCodigos("1.2.3", "1.2.3")).toBe(0);
  });

  it("ordena uma EAP com mais de 9 irmãos, como a do escritório", () => {
    const codigos = Array.from({ length: 12 }, (_, i) => `2.${i + 1}`);
    const embaralhado = [...codigos].reverse();
    expect(embaralhado.sort(compararCodigos)).toEqual(codigos);
  });
});
