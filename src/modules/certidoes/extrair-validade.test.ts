import { describe, expect, it } from "vitest";
import { extrairValidadeDoTexto } from "./extrair-validade";

describe("extrairValidadeDoTexto", () => {
  it("reconhece data numérica após 'Válida até'", () => {
    const texto = "CERTIDÃO NEGATIVA DE DÉBITOS\nEmitida em 01/01/2026\nVálida até: 05/12/2026\nOutras informações...";
    expect(extrairValidadeDoTexto(texto)).toBe("2026-12-05");
  });

  it("reconhece data por extenso após 'válida até'", () => {
    const texto = "Esta certidão é válida até 5 de dezembro de 2026, contado da emissão.";
    expect(extrairValidadeDoTexto(texto)).toBe("2026-12-05");
  });

  it("ignora a data de emissão (não ancorada em palavra-chave de validade)", () => {
    const texto = "Certidão emitida em 01/03/2026. Sem menção de validade explícita.";
    expect(extrairValidadeDoTexto(texto)).toBeNull();
  });

  it("prioriza a validade mesmo quando a data de emissão vem antes no texto", () => {
    const texto = "Data de emissão: 10/01/2026. Data de validade: 10/07/2026.";
    expect(extrairValidadeDoTexto(texto)).toBe("2026-07-10");
  });

  it("aceita separador com ponto ou traço", () => {
    expect(extrairValidadeDoTexto("Vencimento: 15-08-2026")).toBe("2026-08-15");
    expect(extrairValidadeDoTexto("Vencimento: 15.08.2026")).toBe("2026-08-15");
  });

  it("não sugere data implausível (dia/mês inválido)", () => {
    expect(extrairValidadeDoTexto("Válida até: 32/13/2026")).toBeNull();
    expect(extrairValidadeDoTexto("Válida até: 30/02/2026")).toBeNull(); // fevereiro não tem dia 30
  });

  it("retorna null para texto sem nenhuma palavra-chave (ex.: PDF escaneado sem camada de texto)", () => {
    expect(extrairValidadeDoTexto("")).toBeNull();
    expect(extrairValidadeDoTexto("documento qualquer sem data nenhuma")).toBeNull();
  });

  it("é insensível a maiúsculas/minúsculas e a variação de acento", () => {
    expect(extrairValidadeDoTexto("VALIDO ATE 20/09/2026")).toBe("2026-09-20");
  });

  it("continua tentando a próxima ocorrência da palavra-chave se a primeira não tem data válida por perto", () => {
    const texto = "Válida até quando o órgão determinar. Válida até: 01/02/2027.";
    expect(extrairValidadeDoTexto(texto)).toBe("2027-02-01");
  });
});
