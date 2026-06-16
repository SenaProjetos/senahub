import { describe, it, expect } from "vitest";
import {
  parseValorBr,
  parseDataBr,
  inferirTipo,
  mapearStatus,
  splitTags,
  chaveMatch,
  ehSentinela,
  valorOuVazio,
  classificarLinha,
} from "@/lib/import/valores";

describe("parseValorBr", () => {
  it("formato BR com milhar e decimal", () => {
    expect(parseValorBr("1.234,56")).toBe(1234.56);
  });
  it("formato com ponto decimal simples", () => {
    expect(parseValorBr("1234.56")).toBe(1234.56);
    expect(parseValorBr("-9.9")).toBe(-9.9);
  });
  it("prefixo R$ e espaços", () => {
    expect(parseValorBr("R$ 1.234,56")).toBe(1234.56);
  });
  it("parênteses = negativo", () => {
    expect(parseValorBr("(1.234,56)")).toBe(-1234.56);
  });
  it("vazio/traço = null", () => {
    expect(parseValorBr("")).toBeNull();
    expect(parseValorBr("-")).toBeNull();
    expect(parseValorBr(null)).toBeNull();
  });
  it("número direto", () => {
    expect(parseValorBr(-15000)).toBe(-15000);
  });
});

describe("parseDataBr", () => {
  it("dd/mm/aaaa em UTC", () => {
    const d = parseDataBr("05/01/2026")!;
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(5);
  });
  it("ISO aaaa-mm-dd", () => {
    const d = parseDataBr("2026-01-07")!;
    expect(d.getUTCDate()).toBe(7);
  });
  it("ano de 2 dígitos", () => {
    expect(parseDataBr("05/01/26")!.getUTCFullYear()).toBe(2026);
  });
  it("data inválida = null", () => {
    expect(parseDataBr("31/02/2026")).toBeNull();
    expect(parseDataBr("")).toBeNull();
    expect(parseDataBr("abc")).toBeNull();
  });
});

describe("inferirTipo", () => {
  it("usa a coluna Tipo quando presente", () => {
    expect(inferirTipo({ tipoTexto: "Despesa", valor: 100 })).toBe("despesa");
    expect(inferirTipo({ tipoTexto: "Receita", valor: -100 })).toBe("receita");
  });
  it("cai para o sinal do valor sem coluna Tipo", () => {
    expect(inferirTipo({ valor: 100 })).toBe("receita");
    expect(inferirTipo({ valor: -50 })).toBe("despesa");
  });
});

describe("mapearStatus", () => {
  it("confirmado/conciliado/realizado → confirmado", () => {
    expect(mapearStatus("Confirmado").confirma).toBe(true);
    expect(mapearStatus("Conciliado").status).toBe("confirmado");
    expect(mapearStatus("Realizado").confirma).toBe(true);
  });
  it("pendente/em aberto → previsto", () => {
    expect(mapearStatus("Pendente").status).toBe("previsto");
    expect(mapearStatus("Em aberto").confirma).toBe(false);
  });
  it("default previsto", () => {
    expect(mapearStatus("").status).toBe("previsto");
  });
});

describe("splitTags", () => {
  it("separa, dedup e remove vazios", () => {
    expect(splitTags("a; b , a |")).toEqual(["a", "b"]);
  });
  it("vazio → []", () => {
    expect(splitTags("")).toEqual([]);
  });
});

describe("sentinelas", () => {
  it("'Sem ...' e vazio são sentinelas", () => {
    expect(ehSentinela("Sem contato")).toBe(true);
    expect(ehSentinela("Sem forma pagto.")).toBe(true);
    expect(ehSentinela("")).toBe(true);
    expect(ehSentinela("Itaú")).toBe(false);
  });
  it("valorOuVazio limpa sentinela", () => {
    expect(valorOuVazio("Sem projeto")).toBe("");
    expect(valorOuVazio("SANTANDER")).toBe("SANTANDER");
  });
});

describe("classificarLinha", () => {
  it("reconhece transferência e saldo inicial", () => {
    expect(classificarLinha("Transferência")).toBe("transferencia");
    expect(classificarLinha("Saldo inicial")).toBe("saldo_inicial");
    expect(classificarLinha("Despesa")).toBe("lancamento");
    expect(classificarLinha("Receita")).toBe("lancamento");
  });
});

describe("chaveMatch", () => {
  it("minúsculo, sem acento, espaços colapsados", () => {
    expect(chaveMatch("  Razão  Social ")).toBe("razao social");
  });
});
