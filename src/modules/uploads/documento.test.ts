import { describe, expect, it } from "vitest";
import { chaveDocumento } from "./documento";

describe("chaveDocumento", () => {
  it("usa o pacote quando o arquivo é do esquema legado", () => {
    expect(chaveDocumento({ pacote: "A", pastaId: null, nomeArquivo: "planta.pdf" })).toBe("A/planta.pdf");
    expect(chaveDocumento({ pacote: "RECEBIDOS", pastaId: null, nomeArquivo: "cliente.dwg" })).toBe(
      "RECEBIDOS/cliente.dwg",
    );
  });

  it("usa a pasta quando o arquivo vive na árvore PastaProjeto", () => {
    expect(chaveDocumento({ pacote: null, pastaId: "pst123", nomeArquivo: "laudo.pdf" })).toBe(
      "pasta:pst123/laudo.pdf",
    );
  });

  it("prefere o pacote se ambos vierem preenchidos (não deveria acontecer — XOR)", () => {
    expect(chaveDocumento({ pacote: "B", pastaId: "pst123", nomeArquivo: "x.rvt" })).toBe("B/x.rvt");
  });

  it("cai no fallback quando pacote e pasta são nulos, em vez de gerar chave vazia", () => {
    // Sem isso a chave sairia "/x.pdf" e o UNIQUE (disciplinaId, chave) não protegeria.
    expect(chaveDocumento({ pacote: null, pastaId: null, nomeArquivo: "x.pdf" })).toBe("sem-local/x.pdf");
  });

  it("separa documentos diferentes e agrupa o mesmo nome no mesmo local", () => {
    const a1 = chaveDocumento({ pacote: "A", pastaId: null, nomeArquivo: "planta.pdf" });
    const a2 = chaveDocumento({ pacote: "A", pastaId: null, nomeArquivo: "planta.pdf" });
    const b = chaveDocumento({ pacote: "B", pastaId: null, nomeArquivo: "planta.pdf" });
    expect(a1).toBe(a2); // mesma cadeia de versões
    expect(a1).not.toBe(b); // pacotes diferentes = documentos diferentes
  });

  it("preserva caixa e espaços do nome (a cadeia é por nome exato)", () => {
    expect(chaveDocumento({ pacote: "A", pastaId: null, nomeArquivo: "Planta Baixa.PDF" })).toBe(
      "A/Planta Baixa.PDF",
    );
  });
});
