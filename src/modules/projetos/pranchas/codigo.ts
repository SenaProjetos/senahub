/**
 * Composição e parsing do código da Lista Mestre (pure, client-safe, testável).
 * Formato: {projeto}-{sigla disciplina}-{fase}-{numeracao4}-{tipo}[-Rnn]
 */

import { compilarPadrao } from "@/modules/uploads/nomenclatura/padrao";

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
 * Um nome está "fora do padrão" da Lista Mestre? Com `padrao` configurado, usa o compilador do
 * motor de nomenclatura (`compilarPadrao`), que entende as DUAS escritas: modelo
 * (`{proj}-{disc}-{fase}-{nº}-{tipo}[-{Rnn}]`, como as pessoas escreveram em produção) e a regex
 * legada. Sem padrão, cai no embutido (`parsePranchaFilename`).
 *
 * Padrão que não compila (regex inválida) NÃO alerta ninguém — mesma decisão de sempre: um
 * padrão quebrado não pode marcar o acervo inteiro (foi o que aconteceu até 2026-09-15, quando
 * o modelo era compilado como regex e nunca casava).
 *
 * Pure — usado no client (badge/alerta) e no server.
 */
export function foraDoPadrao(nome: string, padrao?: string | null): boolean {
  const base = nome.replace(/\.[^.]+$/, "");
  if (padrao?.trim()) {
    const compilado = compilarPadrao(padrao);
    if (!compilado) return false;
    return !compilado.regex.test(base);
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
