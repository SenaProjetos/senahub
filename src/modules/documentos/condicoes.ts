/**
 * Avaliador de condições de visibilidade dos elementos (puro — testável).
 *
 * Sintaxe simples e SEGURA (sem eval/Function):
 *
 *   TOKEN OP VALOR
 *     TOKEN — qualquer token resolvível pela engine: [Campo], [Sum(x)],
 *             [Count()], [Grupo], [= fórmula ], etc. (com ou sem colchetes).
 *     OP    — == != > >= < <=
 *     VALOR — número (pt-BR: vírgula decimal) OU texto entre aspas ("x"/'x')
 *             OU texto livre (comparado como string).
 *
 *   Abreviações:
 *     vazio([Campo])     → verdadeiro se o token resolve para vazio
 *     naoVazio([Campo])  → verdadeiro se o token tem valor
 *
 * Sem expressão (undefined/"" ) → true (elemento visível). Expressão inválida
 * → true (falha aberta: não esconde por engano).
 */

import { resolverTexto, paraNumero, type ContextoDados } from "@/modules/documentos/tokens";

type Operador = "==" | "!=" | ">=" | "<=" | ">" | "<";

/** Resolve um TOKEN da condição. Aceita com ou sem colchetes externos. */
function resolverAlvo(bruto: string, ctx: ContextoDados): string {
  const t = bruto.trim();
  // Se já vier com colchetes (ou contiver tokens inline), resolve direto.
  if (t.includes("[")) return resolverTexto(t, ctx);
  // Caso contrário, trata como nome de token e envolve em colchetes.
  return resolverTexto(`[${t}]`, ctx);
}

/** Remove aspas externas de um literal de texto, se houver. */
function desaspar(v: string): string {
  const t = v.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Avalia a condição de visibilidade. Sem expressão → true.
 * @param expr expressão da condição (ou undefined)
 * @param ctx  contexto de dados (mesmo da engine de tokens)
 */
export function avaliarCondicao(expr: string | undefined, ctx: ContextoDados): boolean {
  if (expr === undefined) return true;
  const e = expr.trim();
  if (e === "") return true;

  // Abreviações: vazio(...) / naoVazio(...)
  const mVazio = e.match(/^(naoVazio|vazio)\s*\((.*)\)\s*$/i);
  if (mVazio) {
    const valor = resolverAlvo(mVazio[2], ctx).trim();
    const estaVazio = valor === "";
    return /^vazio$/i.test(mVazio[1]) ? estaVazio : !estaVazio;
  }

  // TOKEN OP VALOR — operadores de 2 chars primeiro (== != >= <=).
  const mOp = e.match(/^(.*?)(==|!=|>=|<=|>|<)(.*)$/);
  if (!mOp) return true; // sem operador reconhecido → não esconde

  const op = mOp[2] as Operador;
  const ladoEsq = resolverAlvo(mOp[1], ctx);
  const ladoDirBruto = mOp[3].trim();

  // Comparação numérica quando ambos os lados são números (pt-BR).
  const numEsq = paraNumero(ladoEsq);
  const literalNumerico = /^[+-]?[\d.,]+$/.test(ladoDirBruto);
  const numDir = literalNumerico ? paraNumero(ladoDirBruto) : NaN;

  if (!isNaN(numEsq) && !isNaN(numDir)) {
    return comparaNum(numEsq, op, numDir);
  }

  // Comparação textual (case-insensitive); só == e != fazem sentido,
  // mas mantemos os demais via comparação lexicográfica para robustez.
  const txtEsq = ladoEsq.trim().toLowerCase();
  const txtDir = desaspar(ladoDirBruto).toLowerCase();
  return comparaTxt(txtEsq, op, txtDir);
}

function comparaNum(a: number, op: Operador, b: number): boolean {
  switch (op) {
    case "==":
      return a === b;
    case "!=":
      return a !== b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
  }
}

function comparaTxt(a: string, op: Operador, b: string): boolean {
  switch (op) {
    case "==":
      return a === b;
    case "!=":
      return a !== b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
  }
}
