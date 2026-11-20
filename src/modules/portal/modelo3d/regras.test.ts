import { describe, expect, it } from "vitest";
import {
  descendentesDe,
  modeloServidoDaOrigem,
  unirPavimentos,
  type UploadDaCadeia,
} from "./regras";

const up = (
  id: string,
  realinhadoDeId: string | null,
  versao: number,
  convertido: boolean,
): UploadDaCadeia => ({ id, realinhadoDeId, versao, convertido });

describe("modeloServidoDaOrigem", () => {
  it("sem descendente serve a origem", () => {
    expect(modeloServidoDaOrigem("U", [up("U", null, 1, true)])).toBe("U");
    expect(modeloServidoDaOrigem("U", [])).toBe("U");
  });

  it("serve o descendente realinhado convertido", () => {
    const lista = [up("U", null, 1, true), up("R1", "U", 2, true)];
    expect(modeloServidoDaOrigem("U", lista)).toBe("R1");
  });

  it("pula o descendente mais novo que ainda não converteu", () => {
    const lista = [
      up("U", null, 1, true),
      up("R1", "U", 2, true),
      up("R2", "R1", 3, false),
    ];
    expect(modeloServidoDaOrigem("U", lista)).toBe("R1");
  });

  it("serve o mais recente da cadeia quando todos convertidos", () => {
    const lista = [
      up("R2", "R1", 3, true),
      up("U", null, 1, true),
      up("R1", "U", 2, true),
    ];
    expect(modeloServidoDaOrigem("U", lista)).toBe("R2");
  });

  it("volta à origem se nenhum descendente converteu", () => {
    const lista = [up("U", null, 1, true), up("R1", "U", 2, false)];
    expect(modeloServidoDaOrigem("U", lista)).toBe("U");
  });

  it("descendente de OUTRA origem nunca volta", () => {
    const lista = [
      up("U", null, 1, true),
      up("V", null, 1, true),
      up("RV", "V", 2, true),
    ];
    expect(modeloServidoDaOrigem("U", lista)).toBe("U");
    expect(modeloServidoDaOrigem("V", lista)).toBe("RV");
  });

  it("ciclo defensivo (A→B→A) não trava", () => {
    const lista = [up("A", "B", 1, true), up("B", "A", 2, true)];
    expect(() => modeloServidoDaOrigem("A", lista)).not.toThrow();
    expect(["A", "B"]).toContain(modeloServidoDaOrigem("A", lista));
  });
});

describe("descendentesDe", () => {
  it("devolve a cadeia inteira, sem a origem", () => {
    const lista = [
      up("U", null, 1, true),
      up("R1", "U", 2, true),
      up("R2", "R1", 3, false),
      up("X", null, 1, true),
      up("RX", "X", 2, true),
    ];
    expect(descendentesDe("U", lista)).toEqual(new Set(["R1", "R2"]));
  });

  it("vazio sem descendentes e seguro em ciclo", () => {
    expect(descendentesDe("U", [up("U", null, 1, true)])).toEqual(new Set());
    const ciclo = [up("A", "B", 1, true), up("B", "A", 2, true)];
    expect(descendentesDe("A", ciclo).has("B")).toBe(true);
  });
});

describe("unirPavimentos", () => {
  it("une 'Térreo' e 'TERREO ' de dois modelos, piso = o menor", () => {
    const r = unirPavimentos([
      { modeloId: "m1", nome: "Térreo", pisoY: 0.2, localIds: [1, 2] },
      { modeloId: "m2", nome: "TERREO ", pisoY: -0.1, localIds: [9] },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].pisoY).toBe(-0.1);
    expect(r[0].porModelo.get("m1")).toEqual([1, 2]);
    expect(r[0].porModelo.get("m2")).toEqual([9]);
    expect(r[0].nome).toBe("Térreo");
  });

  it("ignora espaços internos repetidos", () => {
    const r = unirPavimentos([
      { modeloId: "m1", nome: "1º   Pavimento", pisoY: 3, localIds: [1] },
      { modeloId: "m2", nome: "1º Pavimento", pisoY: 3.1, localIds: [2] },
    ]);
    expect(r).toHaveLength(1);
  });

  it("ordena por piso crescente", () => {
    const r = unirPavimentos([
      { modeloId: "m1", nome: "Cobertura", pisoY: 9, localIds: [1] },
      { modeloId: "m1", nome: "Térreo", pisoY: 0, localIds: [2] },
      { modeloId: "m1", nome: "1º Pavimento", pisoY: 3, localIds: [3] },
    ]);
    expect(r.map((p) => p.nome)).toEqual(["Térreo", "1º Pavimento", "Cobertura"]);
  });

  it("sem nome agrupa em 'Sem pavimento' por último", () => {
    const r = unirPavimentos([
      { modeloId: "m1", nome: null, pisoY: -5, localIds: [1] },
      { modeloId: "m2", nome: "  ", pisoY: -4, localIds: [2] },
      { modeloId: "m1", nome: "Térreo", pisoY: 0, localIds: [3] },
    ]);
    expect(r.map((p) => p.nome)).toEqual(["Térreo", "Sem pavimento"]);
    const sem = r[1];
    expect(sem.porModelo.get("m1")).toEqual([1]);
    expect(sem.porModelo.get("m2")).toEqual([2]);
  });

  it("mesmo nome repetido no mesmo modelo concatena os ids", () => {
    const r = unirPavimentos([
      { modeloId: "m1", nome: "Térreo", pisoY: 0, localIds: [1] },
      { modeloId: "m1", nome: "terreo", pisoY: 0.1, localIds: [2] },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].porModelo.get("m1")).toEqual([1, 2]);
  });

  it("lista vazia dá lista vazia", () => {
    expect(unirPavimentos([])).toEqual([]);
  });
});
