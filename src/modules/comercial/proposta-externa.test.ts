import { describe, expect, it } from "vitest";
import { caminhoPdfExternoValido, ehPdf } from "./proposta-externa";

describe("ehPdf", () => {
  it("reconhece pela assinatura, não pela extensão", () => {
    expect(ehPdf(Buffer.from("%PDF-1.7\n..."))).toBe(true);
    expect(ehPdf(Buffer.from("PK docx"))).toBe(false);
    expect(ehPdf(Buffer.from("%PD"))).toBe(false);
  });
});

describe("caminhoPdfExternoValido", () => {
  it("aceita só o que a rota de upload gera", () => {
    expect(caminhoPdfExternoValido("comercial/propostas/externas/0123456789abcdef01234567.pdf")).toBe(true);
  });

  it("recusa outros arquivos do storage e tentativas de sair da pasta", () => {
    expect(caminhoPdfExternoValido("rh/folha/holerite.pdf")).toBe(false);
    expect(caminhoPdfExternoValido("comercial/propostas/externas/../../rh/x.pdf")).toBe(false);
    expect(caminhoPdfExternoValido("comercial/propostas/externas/0123456789abcdef01234567.docx")).toBe(false);
    expect(caminhoPdfExternoValido("comercial/leads/0123456789abcdef01234567.pdf")).toBe(false);
  });
});

describe("registrarVersaoExternaSchema", () => {
  const valido = {
    negociacaoId: "n1",
    titulo: "Edif. Teste",
    itens: [{ disciplina: "Estrutural", valor: 1000 }],
    dataEnvio: "2026-09-18",
    validade: "2026-10-18",
    pdfCaminho: "comercial/propostas/externas/0123456789abcdef01234567.pdf",
  };

  it("aceita datas yyyy-mm-dd", async () => {
    const { registrarVersaoExternaSchema } = await import("./schemas");
    expect(registrarVersaoExternaSchema.safeParse(valido).success).toBe(true);
  });

  it("recusa sem disciplina e com data malformada", async () => {
    const { registrarVersaoExternaSchema } = await import("./schemas");
    expect(registrarVersaoExternaSchema.safeParse({ ...valido, itens: [] }).success).toBe(false);
    expect(registrarVersaoExternaSchema.safeParse({ ...valido, dataEnvio: "18/09/2026" }).success).toBe(false);
  });
});
