import { Packer } from "docx";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { nomeDoArquivo, paraMemoriaDoc, textoDaCelula } from "./formato";
import type { EmpresaTimbrado } from "@/modules/configuracoes/empresa/timbrado";

import { renderRelatorioDocx } from "./render-docx";
import { preencherWorkbookRelatorio } from "./render-xlsx";
import { abrirFaixaDoCabecalho, cabecalhoPdfDoTimbrado, linhaDoTimbrado, logoDoTimbrado } from "./timbrado";
import { num, ABAS_EXCEL, type RelatorioCargas } from "./tipos";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs") as typeof import("exceljs");

const rel: RelatorioCargas = {
  titulo: "Relatório de teste",
  subtitulo: "Sub",
  emissao: "2026-11-13",
  nomeEstudo: "Edifício Ação 1",
  obra: "260031 — Obra",
  naoConferido: true,
  secoes: [
    { numero: 1, titulo: "Identificação", aba: "Resumo", blocos: [{ tipo: "texto", texto: "Olá" }] },
    {
      numero: 3,
      titulo: "Levantamento",
      aba: "Levantamento",
      blocos: [
        { tipo: "subtitulo", texto: "3.1 Flat" },
        { tipo: "tabela", tabela: { colunas: ["Ambiente", "Área (m²)", "Ilum. (VA)"], linhas: [["Sala", num(18), num(280, 0)], ["Total", "", num(280, 0)]], ultimaEhTotal: true } },
        { tipo: "lista", itens: ["a", "b"] },
      ],
    },
    { numero: 7, titulo: "Fontes", aba: "Fontes", blocos: [{ tipo: "tabela", tabela: { colunas: ["Valor", "Fonte"], linhas: [["FD", "Norma, Tabela 1"]] } }] },
  ],
};

const PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const empresa: EmpresaTimbrado = { razaoSocial: "Sena Projetos Ltda", cnpj: "00.000.000/0001-00", endereco: "Rua Exemplo, 100", logoDataUri: `data:image/png;base64,${PNG_1X1}` };

/** PNG só com a assinatura e o IHDR (largura × altura): basta para o tamanho do logo. */
function pngComTamanho(w: number, h: number): string {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return `data:image/png;base64,${b.toString("base64")}`;
}

describe("renderizadores do relatório", () => {
  it("número em pt-BR, com as casas da célula; ausente vira travessão", () => {
    expect(textoDaCelula(num(1234.5, 2))).toBe("1.234,50");
    expect(textoDaCelula(num(280, 0))).toBe("280");
    expect(textoDaCelula(num(null))).toBe("—");
    expect(textoDaCelula("texto")).toBe("texto");
  });

  it("PDF: o MemoriaDoc traz uma seção por título e subtítulo, com o texto já formatado", () => {
    const doc = paraMemoriaDoc(rel);
    expect(doc.secoes.map((s) => s.titulo)).toEqual(["1. Identificação", "3. Levantamento", "3.1 Flat", "7. Fontes"]);
    expect(doc.secoes[2].tabelas?.[0].linhas[0]).toEqual(["Sala", "18,00", "280"]);
    expect(doc.disclaimer).toContain("Dados não conferidos");
  });

  it("Word: gera o arquivo A4 compacto com rodapé de páginas", async () => {
    const buffer = await Packer.toBuffer(renderRelatorioDocx(rel));
    expect(buffer.length).toBeGreaterThan(2000);
    const JSZip = require("jszip") as typeof import("jszip");
    const zip = await JSZip.loadAsync(buffer);
    const doc = await zip.file("word/document.xml")!.async("string");
    expect(doc).toContain("Relatório de teste");
    expect(doc).toContain("11906"); // A4
    expect(doc).toContain('w:left="851"'); // 1,5 cm
    expect(doc).toContain("w:tblHeader"); // cabeçalho repetido
    expect(doc).toContain("w:cantSplit"); // linha inteira na mesma página
    const rodape = await zip.file("word/footer1.xml")!.async("string");
    expect(rodape).toContain("PAGE");
    expect(rodape).toContain("NUMPAGES");
  });

  it("Excel: uma aba por etapa, número como número, impressão em paisagem", async () => {
    const wb = new ExcelJS.Workbook();
    preencherWorkbookRelatorio(wb, rel);
    expect(wb.worksheets.map((w) => w.name)).toEqual([...ABAS_EXCEL]);
    const lev = wb.getWorksheet("Levantamento")!;
    const celulas: unknown[] = [];
    lev.eachRow((r) => r.eachCell((c) => celulas.push(c.value)));
    expect(celulas).toContain(18);
    expect(lev.pageSetup.orientation).toBe("landscape");
    const buffer = await wb.xlsx.writeBuffer();
    expect((buffer as ArrayBuffer).byteLength).toBeGreaterThan(2000);
  });

  it("nome do arquivo sem acento nem caractere perigoso", () => {
    expect(nomeDoArquivo(rel)).toBe("cargas-demanda-Edificio-Acao-1-2026-11-13");
    expect(nomeDoArquivo({ nomeEstudo: "../..", emissao: "2026-11-13" })).toBe("cargas-demanda-estudo-2026-11-13");
  });

  describe("timbrado da empresa", () => {
    it("linha do timbrado: CNPJ e endereço; sem nenhum dos dois, nada", () => {
      expect(linhaDoTimbrado(empresa)).toBe("CNPJ 00.000.000/0001-00 · Rua Exemplo, 100");
      expect(linhaDoTimbrado({ ...empresa, cnpj: null, endereco: null })).toBeNull();
    });

    it("logo: lê o tamanho do PNG e reduz para caber, sem mudar a proporção; outro formato vira sem logo", () => {
      expect(logoDoTimbrado({ ...empresa, logoDataUri: pngComTamanho(400, 100) })).toMatchObject({ largura: 130, altura: 33 });
      expect(logoDoTimbrado({ ...empresa, logoDataUri: pngComTamanho(20, 10) })).toMatchObject({ largura: 20, altura: 10 });
      expect(logoDoTimbrado({ ...empresa, logoDataUri: "data:image/jpeg;base64,AAAA" })).toBeNull();
      expect(logoDoTimbrado({ ...empresa, logoDataUri: "data:image/png;base64,AAAA" })).toBeNull();
      expect(logoDoTimbrado(null)).toBeNull();
    });

    it("PDF: cabeçalho nativo (repetido em toda página) com logo, razão social e linha; a faixa é aberta no @page; sem timbrado, nada", () => {
      const cab = cabecalhoPdfDoTimbrado(empresa)!;
      expect(cab).toContain("Sena Projetos Ltda");
      expect(cab).toContain("CNPJ 00.000.000/0001-00 · Rua Exemplo, 100");
      expect(cab).toContain("<img");
      expect(cabecalhoPdfDoTimbrado({ ...empresa, razaoSocial: "A & <B>" })).toContain("A &amp; &lt;B&gt;");
      const html = "<html><head><style>a{}</style></head><body></body></html>";
      expect(abrirFaixaDoCabecalho(html, empresa)).toContain("@page { margin: 34mm 16mm 18mm !important; }");
      expect(abrirFaixaDoCabecalho(html, null)).toBe(html);
      expect(cabecalhoPdfDoTimbrado(null)).toBeNull();
    });

    it("Word: o cabeçalho de página traz a razão social e o logo; sem timbrado não há cabeçalho", async () => {
      const JSZip = require("jszip") as typeof import("jszip");
      const zip = await JSZip.loadAsync(await Packer.toBuffer(renderRelatorioDocx(rel, empresa)));
      const cab = await zip.file("word/header1.xml")!.async("string");
      expect(cab).toContain("Sena Projetos Ltda");
      expect(cab).toContain("CNPJ 00.000.000/0001-00");
      expect(cab).toContain("w:drawing");
      const sem = await JSZip.loadAsync(await Packer.toBuffer(renderRelatorioDocx(rel)));
      expect(sem.file("word/header1.xml")).toBeNull();
    });

    it("Excel: razão social no alto de cada aba e o logo embutido", () => {
      const wb = new ExcelJS.Workbook();
      preencherWorkbookRelatorio(wb, rel, empresa);
      for (const ws of wb.worksheets) {
        const textos: unknown[] = [];
        ws.eachRow((r) => r.eachCell((c) => textos.push(c.value)));
        expect(textos).toContain("Sena Projetos Ltda");
        expect(ws.getImages()).toHaveLength(1);
      }
      const sem = new ExcelJS.Workbook();
      preencherWorkbookRelatorio(sem, rel);
      expect(sem.worksheets.every((w) => w.getImages().length === 0)).toBe(true);
    });
  });
});
