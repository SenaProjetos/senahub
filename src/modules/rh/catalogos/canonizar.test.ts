import { describe, expect, it } from "vitest";
import { agrupar, contarValores } from "./canonizar";

describe("contarValores", () => {
  it("ignora nulo, undefined e string em branco", () => {
    expect(contarValores(["Projetista", null, undefined, "   ", "Projetista"])).toEqual([
      { valorCru: "Projetista", n: 2 },
    ]);
  });

  it("não colapsa grafias diferentes — isso é trabalho do agrupar", () => {
    const r = contarValores(["Projetista", "PROJETISTA"]);
    expect(r).toHaveLength(2);
  });
});

describe("agrupar", () => {
  it("unifica caixa, acento e espaço duplicado num item só", () => {
    const g = agrupar(
      contarValores(["Engenheiro Civil", "ENGENHEIRO CIVIL", "Engenheiro  Civil", "Engenheiro Cívil"]),
      "user.cargo",
    );
    expect(g).toHaveLength(1);
    expect(g[0]!.total).toBe(4);
    expect(g[0]!.variantes).toHaveLength(4);
  });

  it("elege a grafia mais frequente como canônica", () => {
    const g = agrupar(
      contarValores([...Array(3).fill("Projetista"), "PROJETISTA", "projetista"]),
      "user.cargo",
    );
    expect(g[0]!.canonico).toBe("Projetista");
  });

  it("no empate prefere a grafia capitalizada a MAIÚSCULA e a minúscula", () => {
    expect(agrupar(contarValores(["projetista", "Projetista"]), "user.cargo")[0]!.canonico).toBe("Projetista");
    expect(agrupar(contarValores(["PROJETISTA", "Projetista"]), "user.cargo")[0]!.canonico).toBe("Projetista");
    expect(agrupar(contarValores(["projetista", "PROJETISTA"]), "user.cargo")[0]!.canonico).toBe("PROJETISTA");
  });

  it("no empate prefere a forma acentuada — cedilha não pode sumir do rótulo", () => {
    expect(agrupar(contarValores(["Orcamentos", "Orçamentos"]), "user.departamento")[0]!.canonico).toBe(
      "Orçamentos",
    );
    expect(agrupar(contarValores(["Estagiario", "Estagiário"]), "user.cargo")[0]!.canonico).toBe("Estagiário");
  });

  it("caixa desempata antes do acento", () => {
    // "Orcamentos" é capitalizada (escore 2), "ORÇAMENTOS" é toda maiúscula (escore 1).
    expect(agrupar(contarValores(["ORÇAMENTOS", "Orcamentos"]), "user.departamento")[0]!.canonico).toBe(
      "Orcamentos",
    );
  });

  it("frequência ganha da grafia bem formatada", () => {
    const g = agrupar(contarValores([...Array(4).fill("projetista"), "Projetista"]), "user.cargo");
    expect(g[0]!.canonico).toBe("projetista");
  });

  it("ordena os grupos por total decrescente", () => {
    const g = agrupar(
      contarValores([...Array(2).fill("Estagiário"), ...Array(5).fill("Projetista")]),
      "user.cargo",
    );
    expect(g.map((x) => x.canonico)).toEqual(["Projetista", "Estagiário"]);
  });

  it("valor limpo não gera ambiguidade", () => {
    const g = agrupar(contarValores(["Coordenador de Projetos"]), "user.cargo");
    expect(g[0]!.ambiguidades).toEqual([]);
  });

  it("marca campo com dois valores espremidos", () => {
    for (const v of ["Projetista / Fiscal", "Projetista|Fiscal", "Projetista e Fiscal", "Arquiteto; Urbanista"]) {
      const g = agrupar(contarValores([v]), "user.cargo");
      expect(g[0]!.ambiguidades, v).toContain("parece conter mais de um valor num campo só");
    }
  });

  it("não confunde hífen colado com separador", () => {
    const g = agrupar(contarValores(["Auxiliar Técnico-Administrativo"]), "user.cargo");
    expect(g[0]!.ambiguidades).toEqual([]);
  });

  it("marca lixo: só dígitos e texto curto demais", () => {
    expect(agrupar(contarValores(["123"]), "user.cargo")[0]!.ambiguidades).toContain("só dígitos");
    expect(agrupar(contarValores(["PJ"]), "user.cargo")[0]!.ambiguidades).toContain(
      "curto demais para virar item de catálogo",
    );
  });

  it("acusa departamento que na verdade é um setor — pelo valor do enum e pelo rótulo", () => {
    for (const v of ["engenharia", "Engenharia", "Jurídico", "juridico", "TI", "Administrativo"]) {
      const g = agrupar(contarValores([v]), "user.departamento");
      expect(g[0]!.ambiguidades.join(" "), v).toContain("é um SETOR");
    }
  });

  it("o mesmo texto como CARGO não é acusado de ser setor", () => {
    const g = agrupar(contarValores(["Engenharia"]), "user.cargo");
    expect(g[0]!.ambiguidades).toEqual([]);
  });

  it("departamento comum não é acusado", () => {
    const g = agrupar(contarValores(["Orçamentos"]), "user.departamento");
    expect(g[0]!.ambiguidades).toEqual([]);
  });

  it("lista vazia devolve lista vazia", () => {
    expect(agrupar(contarValores([]), "user.cargo")).toEqual([]);
  });
});
