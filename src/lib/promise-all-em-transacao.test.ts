import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda de regressão: uma transação do Prisma usa UMA conexão. `Promise.all` com consultas do `tx`
 * dispara várias no mesmo cliente ao mesmo tempo — o driver pg deprecia isso e o pg@9 quebra. Dentro
 * de `$transaction`, as consultas vão em sequência (`await` uma a uma, ou `for … of`).
 */

const RAIZ = path.resolve(__dirname, "..");

function arquivosDeCodigo(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) return nome === "generated" ? [] : arquivosDeCodigo(p);
    if (p.endsWith(".test.ts") || p.endsWith(".test.tsx")) return [];
    return p.endsWith(".tsx") || p.endsWith(".ts") ? [p] : [];
  });
}

function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Argumentos (entre parênteses balanceados) de cada `Promise.all(` / `Promise.allSettled(`. */
function chamadasPromiseAll(src: string): { linha: number; corpo: string }[] {
  const re = /\bPromise\.(?:all|allSettled)\s*\(/g;
  const achados: { linha: number; corpo: string }[] = [];
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let nivel = 1;
    let i = m.index + m[0].length;
    while (i < src.length && nivel > 0) {
      if (src[i] === "(") nivel++;
      else if (src[i] === ")") nivel--;
      i++;
    }
    achados.push({ linha: src.slice(0, m.index).split("\n").length, corpo: src.slice(m.index, i) });
  }
  return achados;
}

/** Nome do cliente da transação que o arquivo usa: `tx`, e `db` quando o arquivo abre `$transaction(async (db)`. */
function clientesDeTransacao(src: string): string[] {
  return /\$transaction\(\s*async\s*\(?\s*db\b/.test(src) ? ["tx", "db"] : ["tx"];
}

function violacoes(src: string): number[] {
  const limpo = semComentarios(src);
  const clientes = clientesDeTransacao(limpo);
  const usaCliente = new RegExp(`\\b(?:${clientes.join("|")})\\.`);
  return chamadasPromiseAll(limpo)
    .filter((c) => usaCliente.test(c.corpo))
    .map((c) => c.linha);
}

describe("Promise.all dentro de transação do Prisma", () => {
  it("o detector acha o padrão ruim e ignora o bom", () => {
    const ruim = `await prisma.$transaction(async (tx) => {
      await Promise.all([tx.lead.update(a), tx.negociacao.update(b)]);
    });`;
    const ruimMap = `await Promise.all(itens.map((i) => tx.upload.update({ where: { id: i.id }, data })));`;
    const ruimDb = `prisma.$transaction(async (db) => { await Promise.all([db.a.findMany(), db.b.findMany()]); })`;
    const bom = `await tx.lead.update(a); await tx.negociacao.update(b);
      const [x, y] = await Promise.all([prisma.a.findMany(), prisma.b.findMany()]);`;
    const emComentario = `// Promise.all([tx.a.update(), tx.b.update()]) trava a conexão
      /* Promise.all(tx.x) */ await tx.a.update(a);`;
    expect(violacoes(ruim)).toEqual([2]);
    expect(violacoes(ruimMap)).toEqual([1]);
    expect(violacoes(ruimDb)).toEqual([1]);
    expect(violacoes(bom)).toEqual([]);
    expect(violacoes(emComentario)).toEqual([]);
  });

  it("nenhum arquivo dispara consultas do tx em paralelo", () => {
    const achados = arquivosDeCodigo(RAIZ).flatMap((arquivo) =>
      violacoes(readFileSync(arquivo, "utf8")).map((linha) => `${path.relative(RAIZ, arquivo)}:${linha}`),
    );
    expect(achados).toEqual([]);
  });
});
