/**
 * Destino de upload puro e seguro para cliente e servidor.
 *
 * Existe `modules/uploads/nomenclatura/destino.ts` também — aquele é o motor rico
 * (`resolverDestino`, backup/pranchas/outros por catálogo + validade do nome, decide o `alvo`
 * ANTES do envio); este aqui só decide, dado o `alvo` já escolhido, se a EXTENSÃO cabe no
 * pacote A ou vira OUTROS — é o roteamento físico, síncrono, sem banco, que roda no caminho de
 * escrita do arquivo (`/api/uploads`). As duas listas (esta e o catálogo `ExtensaoArquivo`)
 * precisam ser mantidas em sincronia manualmente — nenhuma gera a outra.
 */
export const EXT_PACOTE_A = new Set([
  "pdf", "dwg", "dxf", "ifc", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "rvt", "rfa", "gsm", "rte", "pln", "nwd", "obj", "skp", "png", "jpg", "jpeg",
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
