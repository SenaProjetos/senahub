import { strFromU8, unzipSync } from "fflate";
import { MOTIVO_TIPO_ARQUIVO, extensaoDoArquivo } from "./regras";

/**
 * Texto dos arquivos de anotações que o Google Docs baixa (.docx, .md, .txt) — PURO, sem biblioteca nova: o .docx é um
 * zip (`fflate`) e o texto sai de `word/document.xml`. Um parágrafo por linha; parágrafo numerado (lista) vira "- …".
 */

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Teto do `word/document.xml` descompactado: anotações de verdade têm dezenas de KB; acima disso é arquivo estranho. */
export const DOCX_XML_MAX = 10 * 1024 * 1024;

function decodificar(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTIDADES[e.toLowerCase()] ?? _;
  });
}

export function textoDoDocx(bytes: Uint8Array): string {
  let arquivos: Record<string, Uint8Array>;
  try {
    // Nada além do texto, e com teto: um .docx de 20 MB comprimido não pode virar gigabytes na memória.
    arquivos = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" && f.originalSize <= DOCX_XML_MAX });
  } catch {
    throw new Error(MOTIVO_TIPO_ARQUIVO);
  }
  const doc = arquivos["word/document.xml"];
  if (!doc || doc.length > DOCX_XML_MAX) throw new Error(MOTIVO_TIPO_ARQUIVO);
  const xml = strFromU8(doc);
  const linhas: string[] = [];
  for (const m of xml.matchAll(/<w:p\b[^>]*\/>|<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    const corpo = m[1] ?? "";
    const lista = /<w:numPr\b/.test(corpo);
    const semPropriedades = corpo.replace(/<w:pPr\b[\s\S]*?<\/w:pPr>/g, "");
    let texto = "";
    for (const t of semPropriedades.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(br|cr)\b[^>]*\/>|<w:tab\b[^>]*\/>/g)) {
      if (t[1] !== undefined) texto += decodificar(t[1]);
      else if (t[2]) texto += "\n";
      else texto += "\t";
    }
    texto = texto.replace(/[ \t]+$/gm, "");
    if (texto.trim().length === 0) continue;
    linhas.push(lista ? `- ${texto.trim()}` : texto);
  }
  return linhas.join("\n");
}

/** .docx → `textoDoDocx`; .md/.txt → UTF-8 (sem BOM); outro tipo → `Error(MOTIVO_TIPO_ARQUIVO)`. */
export function textoDoArquivo(nome: string, bytes: Uint8Array): string {
  const ext = extensaoDoArquivo(nome);
  if (ext === "docx") return textoDoDocx(bytes);
  if (ext === "md" || ext === "txt") return new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
  throw new Error(MOTIVO_TIPO_ARQUIVO);
}
