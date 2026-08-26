import { describe, expect, it } from "vitest";
import { nomeCorrigidoPeloPadrao } from "./nome-corrigido";

describe("nomeCorrigidoPeloPadrao", () => {
  it("compõe o nome técnico e preserva a extensão original", () => {
    expect(nomeCorrigidoPeloPadrao({
      nomeOriginal: "planta antiga.PDF",
      codigoProjeto: "260142",
      siglaDisciplina: "ELE",
      fase: "EXE",
      tipo: "PL",
      numeracao: 42,
      revisao: 2,
    })).toBe("260142-ELE-EXE-0042-PL-R02.PDF");
  });
});
