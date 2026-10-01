/**
 * Regras do cadastro de uma disciplina do catálogo que não dependem de versão — **puras**, usadas
 * pela tela (para travar o campo) e pela action (para recusar), sempre com a mesma frase (ADR-0002).
 */

/**
 * A "pasta dos arquivos" (`DisciplinaCatalogo.codigo`) é o nome da pasta e o prefixo dos arquivos no
 * servidor. Só muda enquanto nenhum projeto usa a disciplina; depois separaria os arquivos em duas
 * pastas (spec 2026-09-30, E6). `null` = pode mudar.
 */
export function normalizarPasta(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

export type CamposCadastro = {
  nome: string;
  categoria: string | null;
  codigo: string | null;
  icone: string | null;
  iconeSvg: string | null;
  numeracao: number | null;
  numeracaoFim: number | null;
};

/** O lápis mudou algo em relação ao cadastro? Espaços nas pontas e vazio ≡ nulo não contam. */
export function cadastroMudou(original: CamposCadastro, atual: CamposCadastro): boolean {
  const t = (v: string | null) => (v ?? "").trim();
  return (
    t(original.nome) !== t(atual.nome) ||
    t(original.categoria) !== t(atual.categoria) ||
    t(original.codigo) !== t(atual.codigo) ||
    t(original.icone) !== t(atual.icone) ||
    (original.iconeSvg ?? "") !== (atual.iconeSvg ?? "") ||
    original.numeracao !== atual.numeracao ||
    original.numeracaoFim !== atual.numeracaoFim
  );
}

export function motivoCodigoTravado(uso: number): string | null {
  if (uso <= 0) return null;
  return `Em uso em ${uso} ${uso === 1 ? "projeto" : "projetos"}: mudar agora separaria os arquivos em duas pastas.`;
}
