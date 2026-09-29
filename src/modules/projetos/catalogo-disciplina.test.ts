import { describe, expect, it } from "vitest";
import { casarCatalogo } from "./catalogo-disciplina";

const catalogo = [
  { id: "est", nome: "Estrutural" },
  { id: "ele", nome: "Elétrico" },
  { id: "hid", nome: "Hidrossanitário" },
];

describe("casarCatalogo", () => {
  it("casa pelo nome exato", () => {
    expect(casarCatalogo("Estrutural", catalogo)).toBe("est");
  });

  it("ignora espaço nas pontas, caixa e acento", () => {
    expect(casarCatalogo("  eletrico ", catalogo)).toBe("ele");
    expect(casarCatalogo("HIDROSSANITARIO", catalogo)).toBe("hid");
  });

  it("não aproxima: nome com complemento fica sem catálogo", () => {
    expect(casarCatalogo("Estrutural - Torre A", catalogo)).toBeNull();
    expect(casarCatalogo("Estrutura", catalogo)).toBeNull();
  });

  it("nome vazio não casa", () => {
    expect(casarCatalogo("   ", catalogo)).toBeNull();
  });

  it("exato vence a folga, e folga ambígua não escolhe", () => {
    const comGemeos = [...catalogo, { id: "ele2", nome: "Eletrico" }];
    expect(casarCatalogo("Elétrico", comGemeos)).toBe("ele");
    expect(casarCatalogo("ELETRICO", comGemeos)).toBeNull();
  });
});
