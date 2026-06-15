/** Regra de alçada: despesa acima do limite configurado exige aprovação. */
export function devePassarPorAprovacao(
  tipo: "receita" | "despesa",
  valor: number,
  limite: number,
): boolean {
  return tipo === "despesa" && limite > 0 && valor >= limite;
}
