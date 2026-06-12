/**
 * Motor de tokens dos documentos (puro — sem server-only; testável).
 *
 * Sintaxe nos textos dos elementos:
 *   [Campo]               → valor escalar ou da linha atual (banda detalhe)
 *   [Fonte.Campo]         → idem, com prefixo da fonte (equivalente)
 *   [Sum(Campo)]          → agregado sobre as linhas da coleção
 *   [Count()] [Avg(X)] [Min(X)] [Max(X)]
 *   [Pagina] [Paginas] [Hoje]
 *   Sufixo de formato após ':' → [Valor:c2] [Data:d] [Pct:p1] [Qtd:n0]
 *     c2=moeda BRL · d=data pt-BR · p0/p1/p2=percentual · n0/n2=número
 */

export type Escalar = Record<string, unknown>;
export type Linha = Record<string, unknown>;

export type ContextoDados = {
  escalar: Escalar;
  linhas: Linha[];
  /** linha atual (banda detalhe); undefined fora do detalhe */
  linha?: Linha;
  pagina?: number;
  paginas?: number;
};

const RE_TOKEN = /\[([^\[\]]+)\]/g;
const RE_AGG = /^(Sum|Count|Avg|Min|Max)\(([^)]*)\)$/i;

export function formatar(valor: unknown, fmt?: string): string {
  if (valor === null || valor === undefined) return "";
  if (!fmt) {
    if (valor instanceof Date) return valor.toLocaleDateString("pt-BR");
    return String(valor);
  }
  const f = fmt.toLowerCase();
  if (f === "d") {
    const d = valor instanceof Date ? valor : new Date(String(valor));
    return isNaN(d.getTime()) ? String(valor) : d.toLocaleDateString("pt-BR");
  }
  const n = typeof valor === "number" ? valor : Number(valor);
  if (isNaN(n)) return String(valor);
  if (f.startsWith("c")) {
    const dec = Number(f.slice(1) || 2);
    return n.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    });
  }
  if (f.startsWith("p")) {
    const dec = Number(f.slice(1) || 0);
    return (
      n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + "%"
    );
  }
  if (f.startsWith("n")) {
    const dec = Number(f.slice(1) || 0);
    return n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  return String(valor);
}

function buscar(chave: string, ctx: ContextoDados): unknown {
  // linha atual primeiro (detalhe), depois escalar; aceita "Fonte.Campo" → tenta caminho completo e só o final
  const candidatos = [chave, chave.includes(".") ? chave.split(".").pop()! : null].filter(
    Boolean,
  ) as string[];
  for (const k of candidatos) {
    if (ctx.linha && k in ctx.linha) return ctx.linha[k];
    if (k in ctx.escalar) return ctx.escalar[k];
  }
  return undefined;
}

function agregar(fn: string, campo: string, linhas: Linha[]): number {
  if (fn === "count") return linhas.length;
  const nums = linhas
    .map((l) => Number(l[campo]))
    .filter((n) => !isNaN(n));
  if (nums.length === 0) return 0;
  switch (fn) {
    case "sum":
      return nums.reduce((s, n) => s + n, 0);
    case "avg":
      return nums.reduce((s, n) => s + n, 0) / nums.length;
    case "min":
      return Math.min(...nums);
    case "max":
      return Math.max(...nums);
    default:
      return 0;
  }
}

/** Resolve um token (sem colchetes, com sufixo de formato opcional). */
export function resolverToken(token: string, ctx: ContextoDados): string {
  const [expr, fmt] = splitFormato(token);

  if (/^pagina$/i.test(expr)) return String(ctx.pagina ?? 1);
  if (/^paginas$/i.test(expr)) return String(ctx.paginas ?? 1);
  if (/^hoje$/i.test(expr)) return formatar(new Date(), fmt ?? "d");

  const agg = expr.match(RE_AGG);
  if (agg) {
    const valor = agregar(agg[1].toLowerCase(), agg[2].trim(), ctx.linhas);
    return formatar(valor, fmt);
  }

  return formatar(buscar(expr, ctx), fmt);
}

function splitFormato(token: string): [string, string | undefined] {
  const i = token.lastIndexOf(":");
  // ':' só é formato se o que vem depois parece um código curto (c2, d, p0, n2)
  if (i > 0 && /^[a-z]\d?$/i.test(token.slice(i + 1))) {
    return [token.slice(0, i).trim(), token.slice(i + 1)];
  }
  return [token.trim(), undefined];
}

/** Substitui todos os tokens de um texto. */
export function resolverTexto(texto: string, ctx: ContextoDados): string {
  return texto.replace(RE_TOKEN, (_m, inner: string) => resolverToken(inner, ctx));
}
