import { describe, expect, it } from "vitest";
import { comVolta, voltaPadrao, voltaValida } from "./volta-visualizador";

describe("voltaValida", () => {
  it("aceita a aba Arquivos do próprio projeto, com a pasta, o filtro e a página", () => {
    expect(voltaValida("/projetos/p1/arquivos?disciplinaId=d1&fase=f1&ext=pdf&page=3", "p1")).toBe(
      "/projetos/p1/arquivos?disciplinaId=d1&fase=f1&ext=pdf&page=3",
    );
    expect(voltaValida("/projetos/p1/arquivos", "p1")).toBe("/projetos/p1/arquivos");
  });

  it("aceita o diretório geral", () => {
    expect(voltaValida("/arquivos?ano=2026&projetoId=p1", "p1")).toBe("/arquivos?ano=2026&projetoId=p1");
  });

  it("recusa outro projeto, outra página do mesmo projeto e caminho que se disfarça", () => {
    expect(voltaValida("/projetos/p2/arquivos", "p1")).toBeNull();
    expect(voltaValida("/projetos/p1", "p1")).toBeNull();
    expect(voltaValida("/projetos/p1/arquivos/u1/visualizar", "p1")).toBeNull();
    expect(voltaValida("/projetos/p1/arquivos/../../financeiro", "p1")).toBeNull();
    expect(voltaValida("/arquivos/outra", "p1")).toBeNull();
  });

  it("recusa qualquer coisa que saia do site (redirecionamento aberto)", () => {
    for (const ruim of [
      "https://evil.example/projetos/p1/arquivos",
      "//evil.example/projetos/p1/arquivos",
      "/\\evil.example/projetos/p1/arquivos",
      "javascript:alert(1)",
      "projetos/p1/arquivos",
      "",
    ]) {
      expect(voltaValida(ruim, "p1")).toBeNull();
    }
    expect(voltaValida(null, "p1")).toBeNull();
    expect(voltaValida(undefined, "p1")).toBeNull();
  });

  it("recusa endereço gigante", () => {
    expect(voltaValida(`/projetos/p1/arquivos?q=${"a".repeat(3000)}`, "p1")).toBeNull();
  });
});

describe("comVolta", () => {
  it("junta o endereço de volta preservando o que já está na URL", () => {
    const href = comVolta("/projetos/p1/arquivos/u1/visualizar?pagina=2", "/projetos/p1/arquivos?fase=f1");
    const url = new URL(href, "http://x");
    expect(url.pathname).toBe("/projetos/p1/arquivos/u1/visualizar");
    expect(url.searchParams.get("pagina")).toBe("2");
    expect(url.searchParams.get("volta")).toBe("/projetos/p1/arquivos?fase=f1");
  });

  it("sem volta, devolve o endereço como veio; ida e volta fecha com voltaValida", () => {
    expect(comVolta("/projetos/p1/arquivos/u1/visualizar", null)).toBe("/projetos/p1/arquivos/u1/visualizar");
    const href = comVolta("/projetos/p1/arquivos/u1/visualizar", "/projetos/p1/arquivos?disciplinaId=d1&fase=f1");
    expect(voltaValida(new URL(href, "http://x").searchParams.get("volta"), "p1")).toBe("/projetos/p1/arquivos?disciplinaId=d1&fase=f1");
  });
});

describe("voltaPadrao", () => {
  it("com fase, a pasta PDF da fase; sem fase, a disciplina", () => {
    expect(voltaPadrao("p1", { disciplinaId: "d1", faseId: "f1" })).toBe("/projetos/p1/arquivos?disciplinaId=d1&fase=f1&ext=pdf");
    expect(voltaPadrao("p1", { disciplinaId: "d1", faseId: null })).toBe("/projetos/p1/arquivos?disciplinaId=d1");
  });

  it("o padrão é sempre um endereço que o validador aceita", () => {
    const padrao = voltaPadrao("p1", { disciplinaId: "d1", faseId: "f1" });
    expect(voltaValida(padrao, "p1")).toBe(padrao);
  });
});
