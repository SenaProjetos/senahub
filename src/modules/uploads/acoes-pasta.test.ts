import { describe, expect, it } from "vitest";
import { ACAO_ABRIR_PASTA, ACAO_COPIAR_LINK_PASTA, itensDePasta } from "./acoes-pasta";

describe("itensDePasta", () => {
  it("abre, repõe o que o menu nativo dava no link e baixa a pasta", () => {
    const itens = itensDePasta({ href: "/p/arquivos?disciplinaId=d", hrefZip: "/api/uploads/pasta/zip?disciplinaId=d" });
    expect(itens.map((i) => i.id)).toEqual([
      ACAO_ABRIR_PASTA,
      "abrir-pasta-nova-aba",
      ACAO_COPIAR_LINK_PASTA,
      "sep-baixar",
      "baixar-pasta",
    ]);
    const novaAba = itens.find((i) => i.id === "abrir-pasta-nova-aba");
    expect(novaAba).toMatchObject({ tipo: "link", href: "/p/arquivos?disciplinaId=d", novaAba: true });
    expect(itens.find((i) => i.id === "baixar-pasta")).toMatchObject({ tipo: "link", href: "/api/uploads/pasta/zip?disciplinaId=d" });
  });

  it("pasta sem .zip (área, pasta vazia) não deixa separador sobrando", () => {
    const itens = itensDePasta({ href: "/p/arquivos?area=geral", hrefZip: null });
    expect(itens.map((i) => i.id)).toEqual([ACAO_ABRIR_PASTA, "abrir-pasta-nova-aba", ACAO_COPIAR_LINK_PASTA]);
  });
});
