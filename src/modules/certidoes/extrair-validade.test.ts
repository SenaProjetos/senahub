import { describe, expect, it } from "vitest";
import { extrairValidadeDoTexto } from "./extrair-validade";
import type { ItemTextoPdf } from "@/lib/ler-texto-pdf";

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

  it("usa a data FINAL quando a validade é um período (CRF do FGTS)", () => {
    const texto = "O presente Certificado não servirá de prova contra cobrança. Validade: 12/09/2026 a 11/10/2026 Certificação Número: 123";
    expect(extrairValidadeDoTexto(texto)).toBe("2026-10-11");
    expect(extrairValidadeDoTexto("Validade: 12/09/2026 até 11/10/2026")).toBe("2026-10-11");
    expect(extrairValidadeDoTexto("Validade: 12/09/2026 - 11/10/2026")).toBe("2026-10-11");
    expect(extrairValidadeDoTexto("Validade:12/09/2026a11/10/2026")).toBe("2026-10-11");
    expect(extrairValidadeDoTexto("Validade: 12 de setembro de 2026 a 11 de outubro de 2026")).toBe("2026-10-11");
  });

  it("não confunde data solta depois da validade com fim de período", () => {
    expect(extrairValidadeDoTexto("Validade: 10/07/2026. Emitida em 01/01/2026")).toBe("2026-07-10");
    expect(extrairValidadeDoTexto("Validade: 10/07/2026 a partir de 01/01/2026")).toBe("2026-07-10");
  });

  it("soma o prazo em dias à data de expedição (certidão municipal do Recife)", () => {
    const texto =
      "8. Validade/Autenticidade Esta certidão é válida por 60 (sessenta) dias a contar da data de sua expedição " +
      "e sua autenticidade deverá ser confirmada na página http://recifeemdia.recife.pe.gov.br/certidoes " +
      "9. Código de Autenticidade 10. Expedida em 330.2484.1233 Recife, 14 de SETEMBRO de 2026 " +
      "11. Certidão emitida com base nos pagamentos registrados até 11 de SETEMBRO de 2026";
    expect(extrairValidadeDoTexto(texto)).toBe("2026-11-13");
  });

  it("aceita outras formas de prazo em dias e de data de emissão", () => {
    expect(extrairValidadeDoTexto("Data de emissão: 01/01/2026. Validade de 90 dias.")).toBe("2026-04-01");
    expect(extrairValidadeDoTexto("Válido pelo prazo de 180 dias. Emitida em 10/03/2026")).toBe("2026-09-06");
  });

  it("prazo em dias sem data de emissão não sugere nada", () => {
    expect(extrairValidadeDoTexto("Esta certidão é válida por 30 dias.")).toBeNull();
  });

  it("data explícita de validade vence o prazo em dias", () => {
    expect(extrairValidadeDoTexto("Emitida em 01/01/2026. Válida por 30 dias. Válida até: 15/01/2026")).toBe("2026-01-15");
  });

  it("lê a data na célula abaixo do rótulo 'VALIDADE' (CIM do Recife)", () => {
    // Layout aproximado do CIM: linha de rótulos em y=700, valores em y=685, colunas centralizadas.
    const item = (str: string, x: number, y: number, w: number): ItemTextoPdf => ({ str, x, y, w, h: 10, pagina: 1 });
    const itens = [
      item("COMPETÊNCIA", 40, 700, 70), item("VALIDADE", 170, 700, 50), item("SITUAÇÃO", 330, 700, 50),
      item("PENDÊNCIAS", 480, 700, 60), item("DATA CADASTRAMENTO", 580, 700, 120),
      item("2026/2", 55, 685, 35), item("10/02/2027", 165, 685, 60), item("ATIVO", 340, 685, 30),
      item("NÃO", 500, 685, 20), item("14/08/2020", 610, 685, 60),
    ];
    const texto = itens.map((i) => i.str).join(" ");
    expect(extrairValidadeDoTexto(texto)).toBeNull(); // só o texto corrido é ambíguo
    expect(extrairValidadeDoTexto(texto, itens)).toBe("2027-02-10");
  });

  it("não pega data de outra coluna nem distante do rótulo", () => {
    const item = (str: string, x: number, y: number, w: number): ItemTextoPdf => ({ str, x, y, w, h: 10, pagina: 1 });
    // data na coluna vizinha
    expect(extrairValidadeDoTexto("", [item("VALIDADE", 170, 700, 50), item("14/08/2020", 300, 685, 60)])).toBeNull();
    // data na mesma coluna, mas muito abaixo (outra seção)
    expect(extrairValidadeDoTexto("", [item("VALIDADE", 170, 700, 50), item("14/08/2020", 170, 500, 60)])).toBeNull();
    // rótulo que não é só "validade"
    expect(extrairValidadeDoTexto("", [item("8. Validade/Autenticidade", 40, 700, 150), item("14/08/2020", 40, 685, 60)])).toBeNull();
  });

  it("continua tentando a próxima ocorrência da palavra-chave se a primeira não tem data válida por perto", () => {
    const texto = "Válida até quando o órgão determinar. Válida até: 01/02/2027.";
    expect(extrairValidadeDoTexto(texto)).toBe("2027-02-01");
  });
});
