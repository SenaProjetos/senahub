/**
 * O pdf.js rejeita a promessa de um desenho ou da camada de texto quando a gente mesmo os cancela (trocou o zoom,
 * a página ou o giro, ou a página saiu da tela): `RenderingCancelledException` no `render()` e `AbortException` no
 * `TextLayer.cancel()`. Isso é o fluxo normal, não falha — só o resto é erro de verdade e merece aviso.
 */
const NOMES_DE_CANCELAMENTO = new Set(["RenderingCancelledException", "AbortException"]);

export function ehCancelamentoDoPdf(erro: unknown): boolean {
  if (typeof erro !== "object" || erro === null) return false;
  const nome = (erro as { name?: unknown }).name;
  return typeof nome === "string" && NOMES_DE_CANCELAMENTO.has(nome);
}
