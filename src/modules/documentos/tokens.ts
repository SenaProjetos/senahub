/**
 * Motor de tokens dos documentos (puro — sem server-only; testável).
 *
 * Sintaxe nos textos dos elementos:
 *   [Campo]               → valor escalar ou da linha atual (banda detalhe)
 *   [Fonte.Campo]         → idem, com prefixo da fonte (equivalente)
 *   [Sum(Campo)]          → agregado sobre as linhas da coleção (em bandas de
 *                           grupo: subtotal das linhas DAQUELE grupo)
 *   [Count()] [Avg(X)] [Min(X)] [Max(X)]
 *   [Grupo]               → valor da chave de agrupamento do grupo corrente
 *                           (bandas grupoCabecalho/grupoRodape)
 *   [Pagina] [Paginas] [Hoje]
 *   [= EXPR]              → campo calculado: aritmética (+ - * / e parênteses)
 *                           sobre tokens e números. Ex.: [= [Total] * 0,1 ],
 *                           [= [Sum(Valor)] / [Count()] :c2 ]. Avaliador próprio
 *                           e seguro (sem eval/Function).
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
  /**
   * Valor da chave de agrupamento do grupo corrente. Definido apenas nas bandas
   * grupoCabecalho/grupoRodape (e nas linhas detalhe de um grupo). Resolve [Grupo].
   */
  grupo?: string;
  pagina?: number;
  paginas?: number;
};

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

/**
 * Converte texto pt-BR para número: aceita "1.200,50" (separador de milhar "."
 * e decimal ","), "1200.50" (decimal "."), ou número puro. Vazio/NaN → NaN.
 */
export function paraNumero(valor: unknown): number {
  if (typeof valor === "number") return valor;
  if (valor === null || valor === undefined) return NaN;
  let s = String(valor).trim();
  if (s === "") return NaN;
  // Remove tudo que não seja dígito, sinal, vírgula, ponto.
  s = s.replace(/[^\d,.\-+]/g, "");
  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");
  if (temVirgula && temPonto) {
    // "1.200,50" → "." é milhar, "," é decimal.
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (temVirgula) {
    // "1200,50" → "," é decimal.
    s = s.replace(",", ".");
  }
  // Só "." → já é decimal padrão JS ("1200.50").
  const n = Number(s);
  return n;
}

/** Resolve um token (sem colchetes, com sufixo de formato opcional). */
export function resolverToken(token: string, ctx: ContextoDados): string {
  // Campo calculado: "[= EXPR]" (com sufixo de formato opcional dentro).
  if (/^\s*=/.test(token)) {
    return resolverCalculo(token, ctx);
  }

  const [expr, fmt] = splitFormato(token);

  if (/^pagina$/i.test(expr)) return String(ctx.pagina ?? 1);
  if (/^paginas$/i.test(expr)) return String(ctx.paginas ?? 1);
  if (/^grupo$/i.test(expr)) return formatar(ctx.grupo ?? "", fmt);
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

/**
 * Substitui todos os tokens de um texto.
 *
 * Faz uma varredura própria (em vez de só `String.replace`) para suportar
 * tokens calculados aninhados: `[= [Total] * 0,1 ]` contém `[...]` internos,
 * que o regex simples de token não casaria. Tokens são casados por profundidade
 * de colchetes; o conteúdo é entregue a `resolverToken`.
 */
export function resolverTexto(texto: string, ctx: ContextoDados): string {
  let out = "";
  let i = 0;
  while (i < texto.length) {
    const ch = texto[i];
    if (ch === "[") {
      // Acha o "]" correspondente respeitando aninhamento.
      let depth = 0;
      let j = i;
      for (; j < texto.length; j++) {
        if (texto[j] === "[") depth++;
        else if (texto[j] === "]") {
          depth--;
          if (depth === 0) break;
        }
      }
      if (j < texto.length) {
        const inner = texto.slice(i + 1, j);
        out += resolverToken(inner, ctx);
        i = j + 1;
        continue;
      }
      // "[" sem fechamento: mantém literal e segue.
      out += ch;
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Resolve um campo calculado `= EXPR` (conteúdo do token, já sem colchetes
 * externos). Passos:
 *  1. separa o sufixo de formato externo opcional (ex.: `:c2` no fim);
 *  2. resolve os tokens internos `[...]` para NÚMERO (trata vírgula pt-BR);
 *  3. avalia a aritmética com um parser próprio e seguro (sem eval);
 *  4. formata o resultado numérico (respeita o sufixo de formato).
 */
function resolverCalculo(token: string, ctx: ContextoDados): string {
  // Remove o "=" inicial.
  let corpo = token.replace(/^\s*=/, "");

  // Sufixo de formato externo: ":c2" / ":n0" / ":p1" / ":d" no fim do corpo.
  let fmt: string | undefined;
  const mFmt = corpo.match(/:([a-z]\d?)\s*$/i);
  if (mFmt) {
    fmt = mFmt[1];
    corpo = corpo.slice(0, mFmt.index);
  }

  // Substitui cada token interno [...] pelo seu valor numérico.
  let expr = "";
  let i = 0;
  while (i < corpo.length) {
    const ch = corpo[i];
    if (ch === "[") {
      let depth = 0;
      let j = i;
      for (; j < corpo.length; j++) {
        if (corpo[j] === "[") depth++;
        else if (corpo[j] === "]") {
          depth--;
          if (depth === 0) break;
        }
      }
      if (j < corpo.length) {
        const inner = corpo.slice(i + 1, j);
        const num = paraNumero(resolverToken(inner, ctx));
        expr += isNaN(num) ? "0" : String(num);
        i = j + 1;
        continue;
      }
    }
    expr += ch;
    i++;
  }

  // Normaliza vírgula decimal de literais pt-BR (ex.: "0,1" → "0.1").
  // Só vírgulas entre dígitos viram ponto decimal.
  expr = expr.replace(/(\d),(\d)/g, "$1.$2");

  const valor = avaliarAritmetica(expr);
  if (valor === null || isNaN(valor)) return "";
  // Com sufixo de formato → usa o formatador padrão (c/p/n/d).
  // Sem sufixo → número pt-BR (até 6 casas, sem zeros à direita).
  if (fmt) return formatar(valor, fmt);
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
}

/**
 * Avaliador aritmético seguro (sem eval/Function). Suporta `+ - * /`,
 * parênteses, números decimais e o menos unário. Implementado com o
 * algoritmo shunting-yard (Dijkstra): tokeniza a expressão, converte para
 * notação polonesa reversa (RPN) respeitando precedência/associatividade e
 * avalia a RPN com uma pilha. Expressão inválida → null.
 */
export function avaliarAritmetica(expr: string): number | null {
  const tokens = tokenizarAritmetica(expr);
  if (tokens === null) return null;
  const rpn = paraRPN(tokens);
  if (rpn === null) return null;
  return avaliarRPN(rpn);
}

type TokAr =
  | { t: "num"; v: number }
  | { t: "op"; v: "+" | "-" | "*" | "/" }
  | { t: "par"; v: "(" | ")" }
  | { t: "neg" }; // menos unário

function tokenizarAritmetica(expr: string): TokAr[] | null {
  const out: TokAr[] = [];
  let i = 0;
  // Para distinguir menos unário do binário, olhamos o token anterior.
  const anteriorEhValorOuFecha = () => {
    const prev = out[out.length - 1];
    return !!prev && (prev.t === "num" || (prev.t === "par" && prev.v === ")"));
  };
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === " " || ch === "\t" || ch === "\n") {
      i++;
      continue;
    }
    if (ch >= "0" && ch <= "9") {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      const num = Number(expr.slice(i, j));
      if (isNaN(num)) return null;
      out.push({ t: "num", v: num });
      i = j;
      continue;
    }
    if (ch === ".") {
      // número iniciando com ".": ".5"
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      const num = Number(expr.slice(i, j));
      if (isNaN(num)) return null;
      out.push({ t: "num", v: num });
      i = j;
      continue;
    }
    if (ch === "+" || ch === "-") {
      if (ch === "-" && !anteriorEhValorOuFecha()) {
        out.push({ t: "neg" });
      } else {
        out.push({ t: "op", v: ch });
      }
      i++;
      continue;
    }
    if (ch === "*" || ch === "/") {
      out.push({ t: "op", v: ch });
      i++;
      continue;
    }
    if (ch === "(") {
      out.push({ t: "par", v: "(" });
      i++;
      continue;
    }
    if (ch === ")") {
      out.push({ t: "par", v: ")" });
      i++;
      continue;
    }
    // Caractere inesperado → expressão inválida.
    return null;
  }
  return out;
}

const PRECEDENCIA: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

function paraRPN(tokens: TokAr[]): TokAr[] | null {
  const saida: TokAr[] = [];
  const pilha: TokAr[] = [];
  for (const tk of tokens) {
    if (tk.t === "num") {
      saida.push(tk);
    } else if (tk.t === "neg") {
      // unário: maior precedência, associatividade à direita → empilha.
      pilha.push(tk);
    } else if (tk.t === "op") {
      while (pilha.length) {
        const topo = pilha[pilha.length - 1];
        if (topo.t === "neg") {
          saida.push(pilha.pop()!);
        } else if (topo.t === "op" && PRECEDENCIA[topo.v] >= PRECEDENCIA[tk.v]) {
          saida.push(pilha.pop()!);
        } else break;
      }
      pilha.push(tk);
    } else if (tk.v === "(") {
      pilha.push(tk);
    } else {
      // ")"
      let achou = false;
      while (pilha.length) {
        const topo = pilha.pop()!;
        if (topo.t === "par" && topo.v === "(") {
          achou = true;
          break;
        }
        saida.push(topo);
      }
      if (!achou) return null; // parênteses desbalanceados
    }
  }
  while (pilha.length) {
    const topo = pilha.pop()!;
    if (topo.t === "par") return null; // parêntese sem fechar
    saida.push(topo);
  }
  return saida;
}

function avaliarRPN(rpn: TokAr[]): number | null {
  const pilha: number[] = [];
  for (const tk of rpn) {
    if (tk.t === "num") {
      pilha.push(tk.v);
    } else if (tk.t === "neg") {
      const a = pilha.pop();
      if (a === undefined) return null;
      pilha.push(-a);
    } else if (tk.t === "op") {
      const b = pilha.pop();
      const a = pilha.pop();
      if (a === undefined || b === undefined) return null;
      switch (tk.v) {
        case "+":
          pilha.push(a + b);
          break;
        case "-":
          pilha.push(a - b);
          break;
        case "*":
          pilha.push(a * b);
          break;
        case "/":
          if (b === 0) return null;
          pilha.push(a / b);
          break;
      }
    } else {
      return null;
    }
  }
  if (pilha.length !== 1) return null;
  return pilha[0];
}
