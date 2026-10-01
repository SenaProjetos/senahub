/**
 * Regras do cadastro de uma disciplina do catálogo que não dependem de versão — **puras**, usadas
 * pela tela (para travar o campo) e pela action (para recusar), sempre com a mesma frase (ADR-0002).
 */

/**
 * A "pasta dos arquivos" (`DisciplinaCatalogo.codigo`) é o nome da pasta e o prefixo dos arquivos no
 * servidor. Só muda enquanto nenhum projeto usa a disciplina; depois separaria os arquivos em duas
 * pastas (spec 2026-09-30, E6). `null` = pode mudar.
 */
export function motivoCodigoTravado(uso: number): string | null {
  if (uso <= 0) return null;
  return `Em uso em ${uso} ${uso === 1 ? "projeto" : "projetos"}: mudar agora separaria os arquivos em duas pastas.`;
}
