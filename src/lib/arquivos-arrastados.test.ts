import { describe, expect, it } from "vitest";
import { arquivosDasEntradas, type EntradaArrastada } from "./arquivos-arrastados";

function arquivo(nome: string): EntradaArrastada {
  return {
    isFile: true,
    isDirectory: false,
    file: (aoLer) => aoLer(new File(["x"], nome)),
  };
}

/** Pasta que respeita o limite real da API: no máximo `porLote` entradas por `readEntries`. */
function pasta(filhos: EntradaArrastada[], porLote = 100): EntradaArrastada {
  return {
    isFile: false,
    isDirectory: true,
    createReader: () => {
      let posicao = 0;
      return {
        readEntries: (aoLer) => {
          const lote = filhos.slice(posicao, posicao + porLote);
          posicao += lote.length;
          aoLer(lote);
        },
      };
    },
  };
}

const nomes = (arquivos: File[]) => arquivos.map((a) => a.name);

describe("arquivosDasEntradas", () => {
  it("entra na pasta arrastada em vez de tratá-la como arquivo (bug das pastas DWG/IFC/PDF)", async () => {
    const entradas = [
      pasta([arquivo("260037-HID-EX-6001-DET.dwg")]),
      pasta([arquivo("260037-HID-EX-6001-DET.ifc")]),
      pasta([arquivo("260037-HID-EX-6001-DET.pdf")]),
    ];
    expect(nomes(await arquivosDasEntradas(entradas))).toEqual([
      "260037-HID-EX-6001-DET.dwg",
      "260037-HID-EX-6001-DET.ifc",
      "260037-HID-EX-6001-DET.pdf",
    ]);
  });

  it("lê a pasta inteira, não só o primeiro lote de 100 (readEntries é paginado)", async () => {
    const muitos = Array.from({ length: 250 }, (_, i) => arquivo(`prancha-${i}.pdf`));
    const achatados = await arquivosDasEntradas([pasta(muitos)]);
    expect(achatados).toHaveLength(250);
    expect(nomes(achatados)).toContain("prancha-249.pdf");
  });

  it("desce em subpastas de qualquer profundidade", async () => {
    const arvore = pasta([
      arquivo("raiz.pdf"),
      pasta([arquivo("meio.pdf"), pasta([arquivo("fundo.pdf")])]),
    ]);
    expect(nomes(await arquivosDasEntradas([arvore]))).toEqual(["raiz.pdf", "meio.pdf", "fundo.pdf"]);
  });

  it("mistura arquivo solto com pasta no mesmo drop", async () => {
    const entradas = [arquivo("solto.pdf"), pasta([arquivo("de-dentro.pdf")])];
    expect(nomes(await arquivosDasEntradas(entradas))).toEqual(["solto.pdf", "de-dentro.pdf"]);
  });

  it("pasta vazia não gera arquivo nenhum", async () => {
    expect(await arquivosDasEntradas([pasta([])])).toEqual([]);
    expect(await arquivosDasEntradas([])).toEqual([]);
  });

  it("arquivo ilegível é pulado, sem derrubar o resto do lote", async () => {
    const ilegivel: EntradaArrastada = {
      isFile: true,
      isDirectory: false,
      file: (_aoLer, aoFalhar) => aoFalhar?.(),
    };
    expect(nomes(await arquivosDasEntradas([pasta([ilegivel, arquivo("ok.pdf")])]))).toEqual(["ok.pdf"]);
  });

  it("erro no meio da leitura da pasta preserva o que já tinha vindo", async () => {
    const meioQuebrado: EntradaArrastada = {
      isFile: false,
      isDirectory: true,
      createReader: () => {
        let chamadas = 0;
        return {
          readEntries: (aoLer, aoFalhar) => {
            chamadas += 1;
            if (chamadas === 1) aoLer([arquivo("veio.pdf")]);
            else aoFalhar?.();
          },
        };
      },
    };
    expect(nomes(await arquivosDasEntradas([meioQuebrado]))).toEqual(["veio.pdf"]);
  });
});
