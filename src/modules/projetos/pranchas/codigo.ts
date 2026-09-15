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
 * `{proj}`, `{nº}`, `{Rnn}`: campo de modelo. Só letras entre chaves — `{4}` e `{1,3}` são
 * quantificadores de regex e continuam sendo regex.
 */
const CAMPO_DE_MODELO = /\{[A-Za-zÀ-ÿºª]+\}/;

/**
 * Um nome está "fora do padrão" da Lista Mestre? Se `padrao` (regex) for informado, usa-o;
 * senão usa o padrão embutido (parsePranchaFilename). Regex inválido = não alerta (retorna false).
 *
 * Padrão escrito como modelo (`{proj}-{disc}-{fase}-{nº}-{tipo}`) cai no embutido, que é esse
 * mesmo formato: como regex ele nunca casava e marcava todo arquivo (produção, 2026-09-15). O
 * compilador de modelo do motor de nomenclatura substitui este desvio (spec 2026-09-15, F3).
 * Pure — usado no client (badge/alerta) e no server.
 */
export function foraDoPadrao(nome: string, padrao?: string | null): boolean {
  const base = nome.replace(/\.[^.]+$/, "");
  if (padrao && padrao.trim() && !CAMPO_DE_MODELO.test(padrao)) {
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
  // A especialidade aceita dígito porque `normalizarCatalogo` permite sigla [A-Z0-9] (ex.: SPD1).
  // O `(?!RV?\d+$)` no TIPO evita o falso positivo em nomes de desenho de elemento como
  // "253-PIL-VIG-001-R00": sem ele, o parser casava e devolvia tipo="R00" com revisao=null —
  // dado errado alimentando o import da Lista Mestre, em vez de recusar o nome.
  const m = base.match(
    /^([A-Za-z0-9]+)-([A-Za-z0-9]+)-([A-Za-z]+)-(\d{1,6})-(?!RV?\d+$)([A-Za-z0-9]+)(?:-RV?(\d+))?$/,
  );
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

/**
 * Fase do catálogo cuja sigla aparece no 3º campo do nome (`260029-HDR-BS-6008-3D` → BS).
 * Nome fora do padrão ou sigla ausente do catálogo devolve `undefined` — quem chama decide
 * se isso é "sem fase" (upload opcional, backfill) ou pede escolha manual.
 */
export function faseDoNomeArquivo<F extends { sigla: string }>(nome: string, fases: readonly F[]): F | undefined {
  const sigla = parsePranchaFilename(nome)?.fase;
  return sigla ? fases.find((fase) => fase.sigla.toUpperCase() === sigla) : undefined;
}
