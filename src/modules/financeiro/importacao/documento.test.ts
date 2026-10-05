import { describe, it, expect } from "vitest";
import { chaveDocumento, documentoParaGravar } from "@/modules/financeiro/importacao/documento";

describe("documentoParaGravar", () => {
  it("fornecedor grava no formato padrão (CNPJ e CPF)", () => {
    expect(documentoParaGravar("fornecedor", "11222333000181")).toBe("11.222.333/0001-81");
    expect(documentoParaGravar("fornecedor", "529.982.247-25")).toBe("529.982.247-25");
  });

  it("cliente grava só dígitos (convenção de Cliente.documento)", () => {
    expect(documentoParaGravar("cliente", "11.222.333/0001-81")).toBe("11222333000181");
    expect(documentoParaGravar("cliente", "529.982.247-25")).toBe("52998224725");
  });

  it("vazio vira null", () => {
    expect(documentoParaGravar("fornecedor", "")).toBeNull();
    expect(documentoParaGravar("cliente", "")).toBeNull();
  });
});

describe("chaveDocumento", () => {
  it("o CNPJ do CSV formatado casa com o fornecedor gravado só com dígitos (legado) e com o já formatado", () => {
    const legado = new Map([[chaveDocumento("11222333000181"), "forn-1"]]);
    const novo = new Map([[chaveDocumento(documentoParaGravar("fornecedor", "11222333000181")!), "forn-2"]]);
    expect(legado.get(chaveDocumento("11.222.333/0001-81"))).toBe("forn-1");
    expect(novo.get(chaveDocumento("11.222.333/0001-81"))).toBe("forn-2");
    expect(novo.get(chaveDocumento("11222333000181"))).toBe("forn-2");
  });
});
