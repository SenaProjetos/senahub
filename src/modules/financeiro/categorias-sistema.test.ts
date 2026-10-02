import { describe, expect, it } from "vitest";
import { acharCategoriaDoSistema, CHAVE_POR_CODIGO, mensagemCategoriaAusente } from "@/modules/financeiro/categorias-sistema";

function banco(linhas: { id: string; chave?: string; codigo: string }[]) {
  return {
    categoriaFinanceira: {
      async findFirst(a: { where: { chave: string } | { codigo: string }; select: { id: true } }) {
        const w = a.where as { chave?: string; codigo?: string };
        return linhas.find((l) => (w.chave ? l.chave === w.chave : l.codigo === w.codigo)) ?? null;
      },
    },
  };
}

describe("categorias do sistema (N6)", () => {
  it("acha pela chave mesmo com o código renumerado", async () => {
    expect(await acharCategoriaDoSistema(banco([{ id: "x", chave: "despesa_folha_clt", codigo: "9.99" }]), "2.03")).toBe("x");
  });
  it("sem chave, cai no código", async () => {
    expect(await acharCategoriaDoSistema(banco([{ id: "y", codigo: "2.03" }]), "2.03")).toBe("y");
  });
  it("a chave vence um código que passou a ser de OUTRA categoria", async () => {
    const b = banco([{ id: "outra", codigo: "2.03" }, { id: "certa", chave: "despesa_folha_clt", codigo: "5.01" }]);
    expect(await acharCategoriaDoSistema(b, "2.03")).toBe("certa");
  });
  it("não existe: null, e a frase diz qual", async () => {
    expect(await acharCategoriaDoSistema(banco([]), "2.03")).toBeNull();
    expect(mensagemCategoriaAusente("2.03")).toContain("despesa_folha_clt");
  });
  it("todo código que os produtores usam tem chave", () => {
    for (const c of ["1.01", "1.02", "1.03", "2.01", "2.02", "2.03", "2.04", "2.05", "2.09"]) expect(CHAVE_POR_CODIGO[c]).toBeTruthy();
  });
});
