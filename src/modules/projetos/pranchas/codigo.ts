/**
 * Composição e parsing do código da Lista Mestre (pure, client-safe, testável).
 * Formato: {projeto}-{sigla disciplina}-{fase}-{numeracao4}-{tipo}[-Rnn]
 */

export function revisaoLabel(n: number): string {
  return `R${String(Math.max(0, n)).padStart(2, "0")}`;
}

export function codigoPrancha(args: {
  projetoCodigo: string;
  siglaDisciplina: string | null;
  fase: string;
  numeracao: number;
  tipo: string;
  revisao: number;
}): string {
  const esp = args.siglaDisciplina || "???";
  const num = String(args.numeracao).padStart(4, "0");
  const base = `${args.projetoCodigo}-${esp}-${args.fase}-${num}-${args.tipo}`;
  return args.revisao > 0 ? `${base}-${revisaoLabel(args.revisao)}` : base;
}

/**
 * Um nome está "fora do padrão" da Lista Mestre? Se `padrao` (regex) for informado, usa-o;
 * senão usa o padrão embutido (parsePranchaFilename). Regex inválido = não alerta (retorna false).
 * Pure — usado no client (badge/alerta) e no server.
 */
export function foraDoPadrao(nome: string, padrao?: string | null): boolean {
  const base = nome.replace(/\.[^.]+$/, "");
  if (padrao && padrao.trim()) {
    try {
      return !new RegExp(padrao).test(base);
    } catch {
      return false;
    }
  }
  return parsePranchaFilename(nome) === null;
}

export type PranchaParseada = {
  codigoProjeto: string;
  especialidade: string;
  fase: string;
  numeracao: number;
  tipo: string;
  revisao: number | null;
};

/**
 * Extrai os campos do nome de um arquivo no padrão da Lista Mestre.
 * Aceita `-Rnn` ou `-RVnn` no fim; ignora a extensão. Retorna null se não casar.
 */
export function parsePranchaFilename(filename: string): PranchaParseada | null {
  const base = filename.replace(/\.[^.]+$/, "");
  const m = base.match(/^([A-Za-z0-9]+)-([A-Za-z]+)-([A-Za-z]+)-(\d{1,6})-([A-Za-z0-9]+)(?:-RV?(\d+))?$/);
  if (!m) return null;
  return {
    codigoProjeto: m[1].toUpperCase(),
    especialidade: m[2].toUpperCase(),
    fase: m[3].toUpperCase(),
    numeracao: parseInt(m[4], 10),
    tipo: m[5].toUpperCase(),
    revisao: m[6] != null ? parseInt(m[6], 10) : null,
  };
}
