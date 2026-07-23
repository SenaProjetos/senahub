/**
 * Visualizador DWG — referência UNIFICADA de desenho (puro, client-safe, testável).
 * Espelha `modules/coordenacao/modelo-ref.ts`: um desenho pode vir de duas origens
 * (Upload de disciplina OU DocumentoVersao recebida do cliente) e trafega como uma
 * única string (`desenhoId`) em toda rota/UI do visualizador DWG.
 */
export type TipoDesenho = "upload" | "documento";

const PREFIXO_DOC = "d:";

/** Chave de um DWG recebido do cliente (DocumentoVersao). */
export function refDocumentoDwg(versaoId: string): string {
  return PREFIXO_DOC + versaoId;
}

/** Chave de um DWG de disciplina (Upload) — crua, sem prefixo. */
export function refUploadDwg(uploadId: string): string {
  return uploadId;
}

/** Decodifica uma chave de desenho em { tipo, id }. Sem prefixo conhecido → upload. */
export function parseDesenhoId(desenhoId: string): { tipo: TipoDesenho; id: string } {
  if (desenhoId.startsWith(PREFIXO_DOC)) {
    return { tipo: "documento", id: desenhoId.slice(PREFIXO_DOC.length) };
  }
  return { tipo: "upload", id: desenhoId };
}

/** True se a chave aponta para um DWG recebido do cliente. */
export function ehDocumentoDwg(desenhoId: string): boolean {
  return desenhoId.startsWith(PREFIXO_DOC);
}
