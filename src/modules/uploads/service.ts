import "server-only";

/** Extensões aceitas em Pranchas e arquivos (pacote A). */
export const EXT_PACOTE_A = new Set([
  "pdf",
  "dwg",
  "dxf",
  "ifc",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "rvt",
  "skp",
  "png",
  "jpg",
  "jpeg",
]);

export type PacoteAlvo = "A" | "B" | "RECEBIDOS";
export type PacoteDestino = "A" | "B" | "OUTROS" | "RECEBIDOS";

export function extensao(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i >= 0 ? nome.slice(i + 1).toLowerCase() : "";
}

/**
 * Decide o destino real do arquivo. Backup do modelo (B) e Recebidos (item 17, beta)
 * aceitam qualquer formato, sem roteamento. Em Pranchas e arquivos (A), formato não
 * suportado é roteado para OUTROS (não falha o lote).
 */
export function destinoArquivo(nome: string, alvo: PacoteAlvo): PacoteDestino {
  if (alvo === "B" || alvo === "RECEBIDOS") return alvo;
  return EXT_PACOTE_A.has(extensao(nome)) ? "A" : "OUTROS";
}

export { TAMANHO_MAX, TAMANHO_MAX_LABEL } from "./limites";
