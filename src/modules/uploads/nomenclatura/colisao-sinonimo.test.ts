import { describe, expect, it } from "vitest";
import { itemQueColide, normalizarSinonimos, primeiraColisao } from "./colisao-sinonimo";

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
