import { describe, expect, it } from "vitest";
import { MODELO_PADRAO_ORIGINAL, outrosPadroes, versaoDoProjeto, type VersaoNomenclatura } from "./versao";

const v = (numero: number, vigenteDesde: string, extra: Partial<VersaoNomenclatura> = {}): VersaoNomenclatura => ({
  id: `v${numero}`,
  numero,
  nome: `Padrão ${numero}`,
  modelo: `{proj}-V${numero}-{disc}`,
  larguraNumero: 3,
  sequenciaPor: "sub",
  vigenteDesde: new Date(vigenteDesde),
  publicadaEm: new Date("2026-01-01"),
  ...extra,
});

const V1 = v(1, "2000-01-01", { modelo: null, larguraNumero: 4, sequenciaPor: "faixa" });
const V2 = v(2, "2026-10-01");
const RASCUNHO = v(3, "2026-09-01", { publicadaEm: null });

describe("versaoDoProjeto", () => {
  it("fixada vence a data", () => {
    const p = { nomenclaturaVersaoId: "v1", createdAt: new Date("2026-12-01") };
    expect(versaoDoProjeto(p, [V1, V2])?.numero).toBe(1);
  });

  it("sem fixar, vale a publicada mais recente com vigência até a criação (D2)", () => {
    expect(versaoDoProjeto({ nomenclaturaVersaoId: null, createdAt: new Date("2026-09-30") }, [V1, V2])?.numero).toBe(1);
    expect(versaoDoProjeto({ nomenclaturaVersaoId: null, createdAt: new Date("2026-10-01") }, [V1, V2])?.numero).toBe(2);
  });

  it("rascunho nunca vale, nem fixado nem pela data", () => {
    expect(versaoDoProjeto({ nomenclaturaVersaoId: "v3", createdAt: new Date("2026-09-15") }, [V1, V2, RASCUNHO])?.numero).toBe(1);
  });

  it("projeto mais antigo que qualquer vigência fica com a primeira publicada", () => {
    const tardia = v(1, "2030-01-01");
    expect(versaoDoProjeto({ nomenclaturaVersaoId: null, createdAt: new Date("2026-01-01") }, [tardia])?.numero).toBe(1);
  });

  it("sem versão publicada: null", () => {
    expect(versaoDoProjeto({ nomenclaturaVersaoId: null, createdAt: new Date() }, [RASCUNHO])).toBeNull();
  });
});

describe("outrosPadroes", () => {
  it("tira a versão do projeto e os rascunhos; v1 sem modelo usa o modelo do leitor embutido", () => {
    expect(outrosPadroes([V1, V2, RASCUNHO], "v2")).toEqual([
      { rotulo: "v1 (Padrão 1)", padrao: MODELO_PADRAO_ORIGINAL },
    ]);
    expect(outrosPadroes([V1, V2], null).map((o) => o.rotulo)).toEqual(["v2 (Padrão 2)", "v1 (Padrão 1)"]);
  });
});
