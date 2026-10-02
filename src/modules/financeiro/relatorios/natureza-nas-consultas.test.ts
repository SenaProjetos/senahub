import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Teste-guarda da spec §8: consulta que SOMA dinheiro de `Lancamento` tem de dizer o que faz com a
 * natureza da categoria — senão a distribuição de lucros volta a aparecer como despesa na DRE e a
 * perna de transferência infla os dois lados do balanço.
 *
 * A regra é mecânica: em cada arquivo da lista, todo `prisma.lancamento.findMany|aggregate|groupBy`
 * precisa de `SO_RESULTADO`, `SEM_TRANSFERENCIA` ou de um comentário `natureza-ok:` com o motivo,
 * antes da próxima consulta. Consulta nova sem nada disso quebra o teste — é o ponto.
 */
const RAIZ = join(__dirname, "..", "..", "..");
const ARQUIVOS = [
  "modules/financeiro/relatorios/queries.ts",
  "modules/financeiro/fechamento/queries.ts",
  "modules/financeiro/aging/queries.ts",
  "modules/dashboard/queries.ts",
  "modules/documentos/fontes.ts",
  // N6: leitores de fora do módulo que somam dinheiro ou cobram.
  "lib/jobs-handlers.ts",
  "modules/projetos/queries.ts",
  "modules/projetos/evm/queries.ts",
  "modules/qualidade/queries.ts",
];
const CONSULTA = /prisma\.lancamento\.(findMany|aggregate|groupBy)/g;
const MARCAS = ["SO_RESULTADO", "SEM_TRANSFERENCIA", "natureza-ok:"];

/** Janela de cada consulta: a linha de comentário logo acima até a próxima consulta. */
function trechos(fonte: string): { inicio: number; texto: string }[] {
  const pos = [...fonte.matchAll(CONSULTA)].map((m) => m.index ?? 0);
  return pos.map((p, i) => ({ inicio: p, texto: fonte.slice(Math.max(0, p - 220), pos[i + 1] ?? fonte.length) }));
}

describe("natureza da categoria nas consultas de dinheiro (spec §8)", () => {
  for (const arq of ARQUIVOS) {
    it(`${arq}: toda consulta de lançamento declara a natureza`, () => {
      const fonte = readFileSync(join(RAIZ, arq), "utf8");
      const semMarca = trechos(fonte).filter((t) => !MARCAS.some((m) => t.texto.includes(m)));
      const linhas = semMarca.map((t) => fonte.slice(0, t.inicio).split("\n").length);
      expect(linhas, `linhas sem SO_RESULTADO / SEM_TRANSFERENCIA / "natureza-ok:" em ${arq}`).toEqual([]);
    });
  }

  it("a lista cobre os arquivos que a spec §8 mandou revisar", () => {
    expect(ARQUIVOS).toContain("modules/financeiro/relatorios/queries.ts");
    expect(ARQUIVOS).toContain("modules/documentos/fontes.ts");
  });

  it("os filtros centrais são objetos simples: `natureza.ts` continua puro", () => {
    const fonte = readFileSync(join(RAIZ, "modules/financeiro/natureza.ts"), "utf8");
    expect(fonte).not.toMatch(/from\s+["']@\/lib\/prisma["']|@\/generated\/prisma/);
    expect(fonte).toContain('export const SO_RESULTADO');
    expect(fonte).toContain('export const SEM_TRANSFERENCIA');
  });
});
