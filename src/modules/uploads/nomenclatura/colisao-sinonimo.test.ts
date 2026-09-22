import { describe, expect, it } from "vitest";
import {
  faixasSeSobrepoem,
  itemQueColide,
  normalizarSinonimos,
  primeiraColisao,
  primeiraColisaoNaVersao,
} from "./colisao-sinonimo";

describe("normalizarSinonimos", () => {
  it("maiúscula, tira espaço e duplicata", () => {
    expect(normalizarSinonimos("DET", [" dtc ", "de", "DTC"])).toEqual(["DTC", "DE"]);
  });

  it("descarta vazio e a própria sigla", () => {
    expect(normalizarSinonimos("EX", ["", "  ", "ex", "PE"])).toEqual(["PE"]);
  });
});

describe("itemQueColide", () => {
  const outros = [
    { id: "t-det", sigla: "DET", sinonimos: ["DTC", "DE"] },
    { id: "t-mem", sigla: "MEM", sinonimos: ["MED"] },
  ];

  it("acha colisão pela sigla e pelo sinônimo, case-insensitive", () => {
    expect(itemQueColide("det", outros)?.id).toBe("t-det");
    expect(itemQueColide("dtc", outros)?.id).toBe("t-det");
    expect(itemQueColide("MED", outros)?.id).toBe("t-mem");
  });

  it("sem colisão devolve null", () => {
    expect(itemQueColide("PQT", outros)).toBeNull();
    expect(itemQueColide("", outros)).toBeNull();
  });
});

describe("primeiraColisao", () => {
  const outros = [{ id: "t-mem", sigla: "MEM", sinonimos: ["MED", "MD"] }];

  it("detecta quando o NOVO sinônimo já pertence a outro item", () => {
    const r = primeiraColisao({ sigla: "DET", sinonimos: ["DTC", "MD"] }, outros);
    expect(r).toMatchObject({ valor: "MD", comItem: { id: "t-mem" } });
  });

  it("detecta quando a própria sigla nova colide com sinônimo de outro item", () => {
    const r = primeiraColisao({ sigla: "MED", sinonimos: [] }, outros);
    expect(r).toMatchObject({ valor: "MED", comItem: { id: "t-mem" } });
  });

  it("sem colisão devolve null", () => {
    expect(primeiraColisao({ sigla: "PQT", sinonimos: ["PLQ"] }, outros)).toBeNull();
  });
});

describe("primeiraColisaoNaVersao", () => {
  const l = (sigla: string, versaoDesde: number, versaoAte: number | null, oficial = true) => ({ sigla, oficial, versaoDesde, versaoAte });

  it("mesma sigla em faixas que não se cruzam convive (ESG: HID até a v1, sub Esgoto da v2)", () => {
    const hid = { id: "d-hid", siglas: [l("HID", 1, null), l("ESG", 1, 1, false)] };
    const esgoto = { id: "s-esg", siglas: [l("ESG", 2, null)] };
    expect(primeiraColisaoNaVersao(esgoto, [hid])).toBeNull();
  });

  it("mesma sigla com faixas cruzadas colide, em qualquer caixa", () => {
    const hid = { id: "d-hid", siglas: [l("HID", 1, null), l("ESG", 1, null, false)] };
    const esgoto = { id: "s-esg", siglas: [l("esg", 2, null)] };
    expect(primeiraColisaoNaVersao(esgoto, [hid])).toEqual({ sigla: "ESG", comItemId: "d-hid" });
  });

  it("o próprio item não colide consigo", () => {
    const item = { id: "a", siglas: [l("AGF", 2, null)] };
    expect(primeiraColisaoNaVersao(item, [item])).toBeNull();
  });

  it("faixasSeSobrepoem trata fim nulo como sem fim", () => {
    expect(faixasSeSobrepoem(l("X", 1, null), l("X", 5, 5))).toBe(true);
    expect(faixasSeSobrepoem(l("X", 1, 1), l("X", 2, null))).toBe(false);
  });
});
