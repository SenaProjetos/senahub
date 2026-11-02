import { describe, expect, it } from "vitest";

import { fmtFixo, fmtNum } from "./index";
import { renderMemoriaHtml } from "./render-html";
import type { MemoriaDoc } from "./types";

describe("fmtNum — vírgula decimal (pt-BR)", () => {
  it("usa vírgula e tira os zeros supérfluos", () => {
    expect(fmtNum(5.64)).toBe("5,64");
    expect(fmtNum(6.5)).toBe("6,5");
    expect(fmtNum(23.0)).toBe("23");
    expect(fmtNum(0.1 + 0.2, 4)).toBe("0,3");
  });

  it("negativo, zero negativo e valor inválido", () => {
    expect(fmtNum(-1.25)).toBe("-1,25");
    expect(fmtNum(-0.001, 2)).toBe("0");
    expect(fmtNum(Number.NaN)).toBe("—");
  });
});

describe("fmtFixo — casas fixas com vírgula (alertas)", () => {
  it("mantém as casas pedidas", () => {
    expect(fmtFixo(2.5, 2)).toBe("2,50");
    expect(fmtFixo(10, 1)).toBe("10,0");
  });
});

describe("renderMemoriaHtml — número cru sai com vírgula", () => {
  it("valores e células numéricas", () => {
    const doc: MemoriaDoc = {
      ferramenta: "x",
      titulo: "T",
      geradoEm: new Date("2026-07-27T12:00:00Z").toISOString(),
      disclaimer: "d",
      secoes: [
        {
          titulo: "S",
          valores: [{ descricao: "Altura", valor: 12.5, unidade: "cm" }],
          tabelas: [{ colunas: ["a"], linhas: [[0.75]] }],
        },
      ],
    };
    const html = renderMemoriaHtml(doc);
    expect(html).toContain("12,5");
    expect(html).toContain("0,75");
    expect(html).not.toContain("12.5");
  });
});
