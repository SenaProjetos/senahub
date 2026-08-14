import { describe, expect, it } from "vitest";
import { chaveDocumento, chaveDocumentoLegada, baseSemExtensao } from "./documento";

describe("baseSemExtensao", () => {
  it("tira a extensão final e normaliza a caixa", () => {
    expect(baseSemExtensao("EST-FOR-001-R03.PDF")).toBe("est-for-001-r03");
    expect(baseSemExtensao("planta.dwg")).toBe("planta");
  });

  it("só corta a ÚLTIMA extensão", () => {
    expect(baseSemExtensao("backup.tar.gz")).toBe("backup.tar");
  });

  it("nome sem ponto fica inteiro", () => {
    expect(baseSemExtensao("LEIAME")).toBe("leiame");
  });

  it("dotfile não vira string vazia", () => {
    expect(baseSemExtensao(".env")).toBe(".env");
  });
});

describe("chaveDocumento", () => {
  it("junta PDF e DWG do mesmo nome-base na MESMA chave (motivo da Fase 2)", () => {
    const pdf = chaveDocumento({ pacote: "A", pastaId: null, nomeArquivo: "EST-FOR-001-R03.pdf" });
    const dwg = chaveDocumento({ pacote: "A", pastaId: null, nomeArquivo: "EST-FOR-001-R03.dwg" });
    expect(pdf).toBe(dwg);
    expect(pdf).toBe("A/est-for-001-r03");
  });

  it("mesmo nome em pacotes diferentes continua sendo documento diferente", () => {
    expect(chaveDocumento({ pacote: "A", pastaId: null, nomeArquivo: "x.pdf" })).not.toBe(
      chaveDocumento({ pacote: "B", pastaId: null, nomeArquivo: "x.pdf" }),
    );
  });

  it("usa a pasta quando o arquivo vive na árvore PastaProjeto", () => {
    expect(chaveDocumento({ pacote: null, pastaId: "pst123", nomeArquivo: "laudo.pdf" })).toBe(
      "pasta:pst123/laudo",
    );
  });

  it("arquivo de pasta não colide com arquivo de pacote de mesmo nome", () => {
    expect(chaveDocumento({ pacote: null, pastaId: "pst1", nomeArquivo: "a.pdf" })).not.toBe(
      chaveDocumento({ pacote: "A", pastaId: null, nomeArquivo: "a.pdf" }),
    );
  });

  it("prefere o pacote se ambos vierem preenchidos (não deveria acontecer — XOR)", () => {
    expect(chaveDocumento({ pacote: "B", pastaId: "pst123", nomeArquivo: "x.rvt" })).toBe("B/x");
  });

  it("sem pacote e sem pasta cai no fallback, nunca em chave vazia", () => {
    expect(chaveDocumento({ pacote: null, pastaId: null, nomeArquivo: "solto.pdf" })).toBe("sem-local/solto");
  });

  it("difere da chave legada justamente pela extensão", () => {
    const args = { pacote: "A", pastaId: null, nomeArquivo: "planta.pdf" };
    expect(chaveDocumentoLegada(args)).toBe("A/planta.pdf");
    expect(chaveDocumento(args)).toBe("A/planta");
  });
});
