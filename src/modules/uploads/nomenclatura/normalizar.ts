/**
 * Normalização de texto para comparação — nunca para exibição nem para gravar.
 * O nome original do arquivo continua intacto em quem chama (ADR-0003).
 */

/** Remove acentos e cedilha (`ELÉTRICA` → `ELETRICA`, `ARÇ` → `ARC`). */
export function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Forma canônica de uma parte do nome: sem acento, sem apóstrofo, maiúscula. */
export function normalizarParte(texto: string): string {
  return semAcento(texto).replace(/['’`´]/g, "").toUpperCase();
}
