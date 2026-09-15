import { describe, expect, it } from "vitest";
import {
  JANELA_ACESSO_MS,
  TIPOS_EVENTO,
  camposAlterados,
  categoriaDoTipo,
  chaveAgrupamentoAcesso,
  complementoEvento,
  ehTipoEvento,
} from "./eventos";

describe("categoriaDoTipo", () => {
  it("download e visualização são acesso; todo o resto é alteração", () => {
    expect(categoriaDoTipo("download")).toBe("acesso");
    expect(categoriaDoTipo("visualizacao")).toBe("acesso");
    const alteracoes = Object.keys(TIPOS_EVENTO).filter((t) => t !== "download" && t !== "visualizacao");
    for (const t of alteracoes) expect(categoriaDoTipo(t as keyof typeof TIPOS_EVENTO)).toBe("alteracao");
  });

  it("reconhece só tipos catalogados", () => {
    expect(ehTipoEvento("status")).toBe(true);
    expect(ehTipoEvento("toString")).toBe(false);
  });
});

describe("chaveAgrupamentoAcesso", () => {
  const base = { tipo: "download" as const, uploadId: "u1", origem: "interno" as const, userId: "p1" };
  const inicio = new Date(Math.floor(Date.UTC(2026, 8, 15, 10) / JANELA_ACESSO_MS) * JANELA_ACESSO_MS);

  it("mesma pessoa, arquivo e ação dentro da janela dão a mesma chave", () => {
    const depois = new Date(inicio.getTime() + JANELA_ACESSO_MS - 1);
    expect(chaveAgrupamentoAcesso({ ...base, em: inicio })).toBe(chaveAgrupamentoAcesso({ ...base, em: depois }));
  });

  it("virar a janela abre um evento novo", () => {
    const proxima = new Date(inicio.getTime() + JANELA_ACESSO_MS);
    expect(chaveAgrupamentoAcesso({ ...base, em: inicio })).not.toBe(chaveAgrupamentoAcesso({ ...base, em: proxima }));
  });

  it("baixar e visualizar, ou pessoas diferentes, nunca se misturam", () => {
    const k = chaveAgrupamentoAcesso({ ...base, em: inicio });
    expect(chaveAgrupamentoAcesso({ ...base, tipo: "visualizacao", em: inicio })).not.toBe(k);
    expect(chaveAgrupamentoAcesso({ ...base, userId: "p2", em: inicio })).not.toBe(k);
  });

  it("sem usuário, o link público identifica quem acessou", () => {
    const externo = { ...base, userId: null, origem: "link_publico" as const, em: inicio };
    expect(chaveAgrupamentoAcesso({ ...externo, linkId: "L1" })).not.toBe(chaveAgrupamentoAcesso({ ...externo, linkId: "L2" }));
  });
});

describe("camposAlterados", () => {
  const campos = ["titulo", "descricao", "fase"] as const;

  it("devolve só o que mudou, com de/para", () => {
    expect(
      camposAlterados({ titulo: "A", descricao: null, fase: "BS" }, { titulo: "B", descricao: null, fase: "BS" }, campos),
    ).toEqual({ titulo: { de: "A", para: "B" } });
  });

  it("vazio e nulo são o mesmo valor — salvar sem mexer não gera mudança", () => {
    expect(camposAlterados({ titulo: "", descricao: null, fase: null }, { titulo: null, descricao: " ", fase: null }, campos)).toEqual({});
  });
});

describe("complementoEvento", () => {
  it("descreve cada campo alterado dos metadados", () => {
    expect(
      complementoEvento("metadados", { campos: { fase: { de: null, para: "BS" }, titulo: { de: "A", para: "B" } } }),
    ).toBe('fase: vazio → "BS" · título: "A" → "B"');
  });

  it("status e renomeio mostram de → para", () => {
    expect(complementoEvento("status", { de: "Em análise", para: "Aprovado" })).toBe('"Em análise" → "Aprovado"');
  });

  it("detalhe ausente ou malformado não quebra, só omite", () => {
    expect(complementoEvento("metadados", null)).toBeNull();
    expect(complementoEvento("ajuste_solicitado", { motivo: 3 })).toBeNull();
    expect(complementoEvento("download", { qualquer: "coisa" })).toBeNull();
  });
});
