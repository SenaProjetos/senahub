/**
 * Leitura de STEP (ISO-10303-21, o formato de texto do IFC) — PURO, sem I/O.
 *
 * O IFC federado é montado no TEXTO (spec 2026-10-04 §5): ler em pedaços, achar cada instrução, renumerar os
 * `#ids`. Só precisa entender o que separa instruções e o que é referência: `;` e `#n` FORA de string
 * (`'…'` com `''` escapado, ou `"…"` binário) e fora de comentário (`/* … *\/`). O resto é copiado como veio.
 */

export type Instancia = { id: number; tipo: string; args: string };

/** Lê instruções completas de um texto que chega em pedaços (o arquivo pode ter vários GB). */
export class LeitorStep {
  private buffer = "";
  private pos = 0;
  private aspas: string | null = null;
  private comentario = false;

  alimentar(texto: string): string[] {
    this.buffer += texto;
    const b = this.buffer;
    const saida: string[] = [];
    let inicio = 0;
    let i = this.pos;
    while (i < b.length) {
      const c = b[i];
      if (this.comentario) {
        if (c === "*") {
          if (i + 1 === b.length) break; // o "/" pode vir no próximo pedaço
          if (b[i + 1] === "/") {
            this.comentario = false;
            i += 2;
            continue;
          }
        }
        i++;
        continue;
      }
      if (this.aspas) {
        if (c === this.aspas) {
          if (this.aspas === "'") {
            if (i + 1 === b.length) break; // pode ser um '' partido entre pedaços
            if (b[i + 1] === "'") {
              i += 2;
              continue;
            }
          }
          this.aspas = null;
        }
        i++;
        continue;
      }
      if (c === "'" || c === '"') {
        this.aspas = c;
        i++;
        continue;
      }
      if (c === "/") {
        if (i + 1 === b.length) break;
        if (b[i + 1] === "*") {
          this.comentario = true;
          i += 2;
          continue;
        }
      }
      if (c === ";") {
        const instr = b.slice(inicio, i).trim();
        if (instr) saida.push(instr);
        inicio = i + 1;
      }
      i++;
    }
    this.buffer = b.slice(inicio);
    this.pos = i - inicio;
    return saida;
  }

  finalizar(): string[] {
    if (this.aspas || this.comentario) {
      throw new Error("IFC truncado: o arquivo termina no meio de um texto ou comentário.");
    }
    const resto = this.buffer.trim();
    this.buffer = "";
    this.pos = 0;
    return resto ? [resto] : [];
  }
}

/** Tira comentários do começo da instrução (o leitor os deixa grudados na instrução seguinte). */
function semComentarioInicial(instr: string): string {
  let s = instr;
  while (s.startsWith("/*")) {
    const fim = s.indexOf("*/");
    if (fim < 0) return s;
    s = s.slice(fim + 2).trimStart();
  }
  return s;
}

export function palavraDaInstrucao(instr: string): string {
  const s = semComentarioInicial(instr);
  const m = /^(#\d+|[A-Za-z0-9_-]+)/.exec(s);
  return m ? m[1].toUpperCase() : "";
}

export function idDaInstrucao(instr: string): number | null {
  const m = /^#(\d+)\s*=/.exec(semComentarioInicial(instr));
  return m ? Number(m[1]) : null;
}

const RE_INSTANCIA = /^#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\(([\s\S]*)\)$/;

export function lerInstancia(instr: string): Instancia | null {
  const m = RE_INSTANCIA.exec(semComentarioInicial(instr));
  return m ? { id: Number(m[1]), tipo: m[2].toUpperCase(), args: m[3] } : null;
}

export function atributos(args: string): string[] {
  const saida: string[] = [];
  let nivel = 0;
  let aspas: string | null = null;
  let inicio = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (aspas) {
      if (c === aspas) {
        if (aspas === "'" && args[i + 1] === "'") {
          i++;
          continue;
        }
        aspas = null;
      }
      continue;
    }
    if (c === "'" || c === '"') aspas = c;
    else if (c === "(") nivel++;
    else if (c === ")") nivel--;
    else if (c === "," && nivel === 0) {
      saida.push(args.slice(inicio, i).trim());
      inicio = i + 1;
    }
  }
  saida.push(args.slice(inicio).trim());
  return saida;
}

export function trocarReferencias(texto: string, novoId: (id: number) => number): string {
  let saida = "";
  let inicio = 0;
  let aspas: string | null = null;
  let comentario = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comentario) {
      if (c === "*" && texto[i + 1] === "/") {
        comentario = false;
        i++;
      }
      continue;
    }
    if (aspas) {
      if (c === aspas) {
        if (aspas === "'" && texto[i + 1] === "'") {
          i++;
          continue;
        }
        aspas = null;
      }
      continue;
    }
    if (c === "'" || c === '"') {
      aspas = c;
      continue;
    }
    if (c === "/" && texto[i + 1] === "*") {
      comentario = true;
      i++;
      continue;
    }
    if (c === "#") {
      let j = i + 1;
      while (j < texto.length && texto.charCodeAt(j) >= 48 && texto.charCodeAt(j) <= 57) j++;
      if (j > i + 1) {
        saida += texto.slice(inicio, i) + "#" + novoId(Number(texto.slice(i + 1, j)));
        inicio = j;
        i = j - 1;
      }
    }
  }
  return saida + texto.slice(inicio);
}

export function referencias(texto: string): number[] {
  const achadas: number[] = [];
  trocarReferencias(texto, (n) => {
    achadas.push(n);
    return n;
  });
  return achadas;
}

/**
 * Literal STEP: ASCII puro; fora do ASCII vira \X2\HHHH\X0\ e, fora do plano básico (emoji…), \X4\HHHHHHHH\X0\
 * (ISO-10303-21 §6.4.3.3) — o caractere inteiro, nunca meio par de surrogates.
 */
export function textoStep(s: string): string {
  let saida = "";
  let hex = "";
  const fecharHex = () => {
    if (hex) {
      saida += `\\X2\\${hex}\\X0\\`;
      hex = "";
    }
  };
  for (const c of s) {
    const code = c.codePointAt(0) ?? 0;
    if (code > 0xffff) {
      fecharHex();
      saida += `\\X4\\${code.toString(16).toUpperCase().padStart(8, "0")}\\X0\\`;
      continue;
    }
    if (code > 126 || code < 32) {
      hex += code.toString(16).toUpperCase().padStart(4, "0");
      continue;
    }
    fecharHex();
    saida += c === "'" ? "''" : c === "\\" ? "\\\\" : c;
  }
  fecharHex();
  return `'${saida}'`;
}
