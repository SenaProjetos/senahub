import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { DOCX_XML_MAX, textoDoArquivo, textoDoDocx } from "./docx";
import { MOTIVO_TIPO_ARQUIVO } from "./regras";

function docx(corpo: string): Uint8Array {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo}</w:body></w:document>`;
  return zipSync({ "word/document.xml": strToU8(xml), "[Content_Types].xml": strToU8("<Types/>") });
}
const p = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const li = (t: string) => `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>${t}</w:t></w:r></w:p>`;

describe("atas — texto dos arquivos", () => {
  it("docx com parágrafos e lista", () => {
    const bytes = docx(p("Resumo") + p("Texto &amp; mais") + p("Próximas etapas sugeridas") + li("Ana vai enviar a planta.") + `<w:p></w:p>`);
    expect(textoDoDocx(bytes)).toBe("Resumo\nTexto & mais\nPróximas etapas sugeridas\n- Ana vai enviar a planta.");
  });

  it("docx com texto dividido em vários trechos e quebra de linha", () => {
    const bytes = docx(`<w:p><w:r><w:t>Reu</w:t></w:r><w:r><w:t>nião</w:t><w:br/><w:t>linha 2</w:t></w:r></w:p>`);
    expect(textoDoDocx(bytes)).toBe("Reunião\nlinha 2");
  });

  it("md com BOM", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("# Resumo\nOlá")]);
    expect(textoDoArquivo("ata.MD", bytes)).toBe("# Resumo\nOlá");
    expect(textoDoArquivo("ata.txt", new TextEncoder().encode("abc"))).toBe("abc");
    expect(textoDoArquivo("ata.docx", docx(p("x")))).toBe("x");
  });

  it(".pdf recusa", () => {
    expect(() => textoDoArquivo("ata.pdf", new Uint8Array([1]))).toThrow(MOTIVO_TIPO_ARQUIVO);
  });

  it("docx que descompacta além do teto recusa (zip bomb)", () => {
    const enorme = docx(p("a".repeat(DOCX_XML_MAX + 10)));
    expect(enorme.length).toBeLessThan(1024 * 1024);
    expect(() => textoDoDocx(enorme)).toThrow(MOTIVO_TIPO_ARQUIVO);
  });

  it("docx corrompido recusa com a frase do tipo", () => {
    expect(() => textoDoArquivo("ata.docx", new Uint8Array([1, 2, 3]))).toThrow(MOTIVO_TIPO_ARQUIVO);
  });
});
