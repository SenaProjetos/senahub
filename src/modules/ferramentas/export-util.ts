/** Utilidades puras compartilhadas pelas rotas de export. */

/** Gera um nome de arquivo seguro a partir do título do cálculo. */
export function slugCalculo(titulo: string): string {
  const base = titulo
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // remove acentos
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return base.length > 0 ? base : "calculo";
}
