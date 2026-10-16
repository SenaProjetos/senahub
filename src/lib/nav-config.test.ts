import { describe, expect, it } from "vitest";
import { NAV_GROUPS, hrefAtivo } from "@/lib/nav-config";

const itens = NAV_GROUPS.flatMap((g) => g.items);

describe("hrefAtivo", () => {
  it("acende só o item mais específico", () => {
    expect(hrefAtivo("/planejamento/modelos/abc", itens)).toBe("/planejamento/modelos");
    expect(hrefAtivo("/planejamento", itens)).toBe("/planejamento");
    expect(hrefAtivo("/rh/catalogos", itens)).toBe("/rh/catalogos");
    expect(hrefAtivo("/rh", itens)).toBe("/rh");
    expect(hrefAtivo("/patrimonio/ti/maquina-1", itens)).toBe("/patrimonio/ti");
    expect(hrefAtivo("/projetos/meu-trabalho", itens)).toBe("/projetos/meu-trabalho");
    expect(hrefAtivo("/projetos/p1/arquivos", itens)).toBe("/projetos");
    expect(hrefAtivo("/arquivos/pendencias", itens)).toBe("/arquivos/pendencias");
    expect(hrefAtivo("/arquivos", itens)).toBe("/arquivos");
  });

  it("casa por segmento, não por prefixo de texto", () => {
    expect(hrefAtivo("/rhx", [{ href: "/rh" }])).toBeNull();
    expect(hrefAtivo("/rh/", [{ href: "/rh" }])).toBe("/rh");
  });

  it("Início só na raiz", () => {
    expect(hrefAtivo("/", itens)).toBe("/");
    expect(hrefAtivo("/chat", [{ href: "/" }])).toBeNull();
  });

  it("sem item correspondente, nada acende", () => {
    expect(hrefAtivo("/versoes", itens)).toBeNull();
  });
});

describe("item Pendências documentais", () => {
  it("fica ao lado de Aprovações, só para quem recebe os avisos de gestão", () => {
    const item = itens.find((i) => i.href === "/arquivos/pendencias");
    expect(item).toMatchObject({ title: "Pendências", permissao: "notificacoes:gestao", tipo: "interno" });
  });
});
