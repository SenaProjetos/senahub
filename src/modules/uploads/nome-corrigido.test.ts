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
    })).toBe("260142-ELE-EXE-0042-PL.PDF");
  });

  it("nunca sugere revisão no nome — quem versiona é o HUB, não o -Rnn", () => {
    expect(nomeCorrigidoPeloPadrao({
      nomeOriginal: "planta.pdf",
      codigoProjeto: "260142",
      siglaDisciplina: "ELE",
      fase: "EXE",
      tipo: "PL",
      numeracao: 42,
    })).not.toContain("-R0");
  });
});

describe("nomeCorrigidoPeloPadrao pela versão do projeto (F3)", () => {
  it("projeto v2: modelo com texto fixo, sub no lugar da disciplina, 3 dígitos", () => {
    expect(
      nomeCorrigidoPeloPadrao({
        nomeOriginal: "planta agua fria.pdf",
        codigoProjeto: "260010",
        siglaDisciplina: "AGF",
        fase: "BAS",
        tipo: "PLB",
        numeracao: 2,
        padrao: "{proj}-SENA-{disc}-{fase}-{num}-{tipo}",
        larguraNumero: 3,
      }),
    ).toBe("260010-SENA-AGF-BAS-002-PLB.pdf");
  });

  it("projeto v1 (sem modelo): o formato de hoje, 4 dígitos", () => {
    expect(
      nomeCorrigidoPeloPadrao({
        nomeOriginal: "x.dwg",
        codigoProjeto: "260018",
        siglaDisciplina: "EST",
        fase: "EX",
        tipo: "DET",
        numeracao: 4012,
        padrao: null,
        larguraNumero: 4,
      }),
    ).toBe("260018-EST-EX-4012-DET.dwg");
  });
});
