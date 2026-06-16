/**
 * Normalização de valores de planilhas brasileiras (puro, sem I/O).
 * Usado pela importação financeira para converter texto cru em tipos do domínio.
 */

export type TipoLanc = "receita" | "despesa";
export type StatusLanc = "previsto" | "confirmado";

/** trim + colapsa espaços internos. */
export function normalizarTexto(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/** chave de comparação de cadastros: minúsculo, sem acento, espaços colapsados. */
export function chaveMatch(s: string): string {
  return normalizarTexto(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Converte valor monetário BR em número.
 * Aceita "1.234,56", "1234.56", "R$ 1.234,56", "(1.234,56)" (parênteses = negativo), "-".
 * Retorna null se vazio/inválido.
 */
export function parseValorBr(s: string | number | null | undefined): number | null {
  if (s == null) return null;
  if (typeof s === "number") return isNaN(s) ? null : s;

  let t = s.trim();
  if (t === "" || t === "-") return null;

  let negativo = false;
  if (/^\(.*\)$/.test(t)) {
    negativo = true;
    t = t.slice(1, -1);
  }
  if (t.includes("-")) negativo = true;

  // mantém só dígitos, vírgula e ponto
  t = t.replace(/[^\d.,]/g, "");
  if (t === "") return null;

  const temVirgula = t.includes(",");
  if (temVirgula) {
    // vírgula = separador decimal; ponto = milhar
    t = t.replace(/\./g, "").replace(",", ".");
  }
  // sem vírgula: ponto já é decimal (ou inteiro)

  const n = Number(t);
  if (isNaN(n)) return null;
  return negativo ? -Math.abs(n) : n;
}

/**
 * Converte data BR em Date UTC (campo Prisma é @db.Date — evita deslocamento de fuso).
 * Aceita dd/mm/aaaa, dd/mm/aa, dd-mm-aaaa, aaaa-mm-dd. Retorna null se inválida.
 */
export function parseDataBr(s: string | null | undefined): Date | null {
  if (s == null) return null;
  const t = s.trim();
  if (t === "") return null;

  let y: number, mo: number, d: number;

  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); // ISO aaaa-mm-dd
  if (m) {
    y = Number(m[1]);
    mo = Number(m[2]);
    d = Number(m[3]);
  } else {
    m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/); // dd/mm/aaaa ou dd-mm-aaaa
    if (!m) return null;
    d = Number(m[1]);
    mo = Number(m[2]);
    y = Number(m[3]);
    if (y < 100) y += y < 70 ? 2000 : 1900;
  }

  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  // valida overflow (ex.: 31/02 -> mês muda)
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/**
 * Valores "vazios" usados pelo Meu Dinheiro como placeholder (ex.: "Sem contato",
 * "Sem forma pagto.", "Sem projeto"). Tratados como ausência de valor.
 */
export function ehSentinela(s: string | null | undefined): boolean {
  if (s == null) return true;
  const t = chaveMatch(s);
  return t === "" || t.startsWith("sem ");
}

/** Retorna o texto normalizado, ou "" se for sentinela/vazio. */
export function valorOuVazio(s: string | null | undefined): string {
  return ehSentinela(s) ? "" : normalizarTexto(s as string);
}

export type ClasseLinha = "lancamento" | "transferencia" | "saldo_inicial";

/** Classifica a linha pelo texto do campo Tipo (transferência e saldo inicial têm tratamento próprio). */
export function classificarLinha(tipoTexto: string | null | undefined): ClasseLinha {
  const t = tipoTexto ? chaveMatch(tipoTexto) : "";
  if (t.includes("transferencia")) return "transferencia";
  if (t.includes("saldo inicial") || t.includes("saldo")) return "saldo_inicial";
  return "lancamento";
}

const TIPO_RECEITA = ["receita", "entrada", "credito", "crédito", "recebimento", "receber"];
const TIPO_DESPESA = ["despesa", "saida", "saída", "debito", "débito", "pagamento", "pagar"];

/**
 * Infere o tipo do lançamento.
 * Prioridade: (1) coluna Tipo mapeada; (2) sinal do valor (>=0 receita, <0 despesa).
 */
export function inferirTipo(opts: { tipoTexto?: string | null; valor: number }): TipoLanc {
  const t = opts.tipoTexto ? chaveMatch(opts.tipoTexto) : "";
  if (t) {
    if (TIPO_RECEITA.some((k) => t.includes(k))) return "receita";
    if (TIPO_DESPESA.some((k) => t.includes(k))) return "despesa";
  }
  return opts.valor >= 0 ? "receita" : "despesa";
}

const STATUS_CONFIRMADO = [
  "confirmado",
  "pago",
  "recebido",
  "liquidado",
  "conciliado",
  "baixado",
  "efetivado",
  "quitado",
  "realizado",
];
const STATUS_PREVISTO = [
  "pendente",
  "em aberto",
  "aberto",
  "previsto",
  "a pagar",
  "a receber",
  "agendado",
];

/** Mapeia o rótulo de situação para status do domínio. `confirma` indica realização (caixa/DRE). */
export function mapearStatus(s: string | null | undefined): { status: StatusLanc; confirma: boolean } {
  const t = s ? chaveMatch(s) : "";
  if (t) {
    if (STATUS_CONFIRMADO.some((k) => t.includes(k))) return { status: "confirmado", confirma: true };
    if (STATUS_PREVISTO.some((k) => t.includes(k))) return { status: "previsto", confirma: false };
  }
  return { status: "previsto", confirma: false };
}

/** Separa tags por `;`, `,` ou `|`; trim; dedup; descarta vazias. */
export function splitTags(s: string | null | undefined): string[] {
  if (!s) return [];
  const partes = s
    .split(/[;,|]/)
    .map((x) => x.trim())
    .filter((x) => x !== "");
  return [...new Set(partes)];
}
