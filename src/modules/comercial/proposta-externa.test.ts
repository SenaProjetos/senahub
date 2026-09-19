import { describe, expect, it } from "vitest";
import { caminhoPdfExternoValido, ehPdf, selecionarPdfsOrfaos } from "./proposta-externa";

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

describe("selecionarPdfsOrfaos", () => {
  const agora = new Date("2026-09-19T12:00:00Z");
  const horas = (h: number) => new Date(agora.getTime() - h * 3_600_000);
  const c = (n: string) => `comercial/propostas/externas/${n.padEnd(24, "0")}.pdf`;

  it("só apaga o que não tem versão E já passou da carência", () => {
    const arquivos = [
      { caminho: c("a"), modificadoEm: horas(48) }, // órfão antigo → apaga
      { caminho: c("b"), modificadoEm: horas(48) }, // referenciado → guarda
      { caminho: c("c"), modificadoEm: horas(2) }, // órfão recente (formulário aberto?) → guarda
    ];
    expect(selecionarPdfsOrfaos(arquivos, new Set([c("b")]), agora)).toEqual([c("a")]);
  });

  it("ignora o que não tem o formato do upload (nunca apaga arquivo alheio na pasta)", () => {
    const arquivos = [
      { caminho: "comercial/propostas/externas/leia-me.txt", modificadoEm: horas(999) },
      { caminho: "comercial/propostas/externas/meu-arquivo.pdf", modificadoEm: horas(999) },
    ];
    expect(selecionarPdfsOrfaos(arquivos, new Set(), agora)).toEqual([]);
  });
});
