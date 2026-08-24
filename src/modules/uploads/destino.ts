/** Destino de upload puro e seguro para cliente e servidor. */
export const EXT_PACOTE_A = new Set([
  "pdf", "dwg", "dxf", "ifc", "doc", "docx", "xls", "xlsx", "rvt", "skp", "png", "jpg", "jpeg",
]);

export type PacoteAlvo = "A" | "B" | "RECEBIDOS";
export type PacoteDestino = "A" | "B" | "OUTROS" | "RECEBIDOS";

export function extensao(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i >= 0 ? nome.slice(i + 1).toLowerCase() : "";
}

export function destinoArquivo(nome: string, alvo: PacoteAlvo): PacoteDestino {
  if (alvo === "B" || alvo === "RECEBIDOS") return alvo;
  return EXT_PACOTE_A.has(extensao(nome)) ? "A" : "OUTROS";
}
