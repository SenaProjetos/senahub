import { describe, expect, it } from "vitest";
import {
  achatarTemplate,
  slugSegmento,
  usaEstruturaCustom,
} from "./estrutura-tipo";

describe("usaEstruturaCustom", () => {
  it("é true só para aprovacao/laudo", () => {
    expect(usaEstruturaCustom("aprovacao")).toBe(true);
    expect(usaEstruturaCustom("laudo")).toBe(true);
    expect(usaEstruturaCustom("particular")).toBe(false);
    expect(usaEstruturaCustom("licitacao")).toBe(false);
    expect(usaEstruturaCustom("qualquer")).toBe(false);
  });
});

describe("slugSegmento", () => {
  it("remove acento, baixa a caixa e troca separadores", () => {
    expect(slugSegmento("Documentação")).toBe("documentacao");
    expect(slugSegmento("Aprovação")).toBe("aprovacao");
    expect(slugSegmento("Fotos e Anexos")).toBe("fotos-e-anexos");
    expect(slugSegmento("  ///  ")).toBe("pasta"); // fallback quando esvazia
  });
});

describe("achatarTemplate", () => {
  it("aprovacao: raiz + 3 subpastas, com caminhos e parentesco", () => {
    const flat = achatarTemplate("aprovacao");
    expect(flat.map((f) => f.caminho)).toEqual([
      "aprovacao",
      "aprovacao/laudos",
      "aprovacao/projetos",
      "aprovacao/documentacao",
    ]);
    // Raiz vem antes dos filhos e é a única com parentCaminho null.
    expect(flat[0]).toMatchObject({ nome: "Aprovação", parentCaminho: null, ordem: 0 });
    expect(flat[1]).toMatchObject({ nome: "Laudos", parentCaminho: "aprovacao", ordem: 0 });
    expect(flat[3]).toMatchObject({ nome: "Documentação", parentCaminho: "aprovacao", ordem: 2 });
  });

  it("laudo: raiz Laudo + 4 subpastas", () => {
    const flat = achatarTemplate("laudo");
    expect(flat).toHaveLength(5);
    expect(flat.map((f) => f.nome)).toEqual([
      "Laudo",
      "Fotos",
      "Projetos",
      "Anexos",
      "Documentos",
    ]);
    expect(flat[0].caminho).toBe("laudo");
    expect(flat[2].caminho).toBe("laudo/projetos");
  });

  it("tipos sem template retornam vazio", () => {
    expect(achatarTemplate("particular")).toEqual([]);
    expect(achatarTemplate("licitacao")).toEqual([]);
  });
});
