/**
 * Coordenação BIM — referência UNIFICADA de modelo (puro, client-safe, testável).
 *
 * Um modelo no viewer pode vir de duas origens:
 *  - `upload`    — IFC de uma disciplina (Upload). Chave = o próprio uploadId (cru).
 *  - `documento` — IFC recebido do cliente (DocumentoVersao). Chave = `d:<versaoId>`.
 *
 * A chave (`modeloId`) trafega como string única em toda a coordenação (URL da rota
 * .frag, `ApontamentoCoordenacao.uploadId`, seleção do engine). Uploads ficam SEM
 * prefixo — assim as chaves e apontamentos já existentes continuam válidos (retrocompat).
 */
export type TipoModelo = "upload" | "documento";

const PREFIXO_DOC = "d:";

/** Chave de um IFC recebido (DocumentoVersao). */
export function refDocumento(versaoId: string): string {
  return PREFIXO_DOC + versaoId;
}

/** Chave de um IFC de disciplina (Upload) — crua, sem prefixo (retrocompat). */
export function refUpload(uploadId: string): string {
  return uploadId;
}

/** Decodifica uma chave de modelo em { tipo, id }. Sem prefixo conhecido → upload. */
export function parseModeloId(modeloId: string): { tipo: TipoModelo; id: string } {
  if (modeloId.startsWith(PREFIXO_DOC)) {
    return { tipo: "documento", id: modeloId.slice(PREFIXO_DOC.length) };
  }
  return { tipo: "upload", id: modeloId };
}

/** True se a chave aponta para um IFC recebido do cliente. */
export function ehDocumento(modeloId: string): boolean {
  return modeloId.startsWith(PREFIXO_DOC);
}
