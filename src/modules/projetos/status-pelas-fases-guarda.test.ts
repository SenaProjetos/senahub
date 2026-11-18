import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda (spec 2026-11-13, seção 5): o status da disciplina vem das fases, então todo caminho que escreve
 * `DisciplinaEtapa` precisa recalcular o status da disciplina (`recalcularStatusDisciplina`). Uma escrita de
 * status de fase sem o recálculo deixaria o card com a contradição que originou a mudança ("Em revisão" na
 * disciplina, "Aguardando" na fase).
 *
 * Escrita que não mexe em status nem no conjunto de fases (prazo, percentual, pool) leva
 * `// recalculo-ok: <motivo>` na linha ou nas linhas de comentário logo acima. É uma rede, não uma prova:
 * o arquivo que chama o recálculo passa inteiro.
 */
const RAIZ = path.resolve(__dirname, "..", "..");
// Os ajudantes do próprio serviço escrevem fase e documentam que o chamador recalcula.
const PERMITIDO = path.join("modules", "projetos", "status-pelas-fases-service.ts");

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) return nome === "generated" ? [] : arquivos(p);
    if (p.endsWith(".test.ts") || p.endsWith(".test.tsx")) return [];
    return p.endsWith(".ts") || p.endsWith(".tsx") ? [p] : [];
  });
}

function temMarcador(linhas: string[], i: number): boolean {
  if (linhas[i].includes("recalculo-ok:")) return true;
  for (let j = i - 1; j >= 0 && /^\s*(\/\/|\*|\/\*)/.test(linhas[j]); j--) {
    if (linhas[j].includes("recalculo-ok:")) return true;
  }
  return false;
}

describe("escrita de DisciplinaEtapa recalcula o status da disciplina", () => {
  it("todo arquivo que escreve fase chama recalcularStatusDisciplina ou marca a escrita", () => {
    const re = /disciplinaEtapa\.(update|updateMany|create|createMany|upsert|delete|deleteMany)\b/;
    const achados: string[] = [];
    for (const f of arquivos(RAIZ)) {
      if (f.endsWith(PERMITIDO)) continue;
      const src = readFileSync(f, "utf8");
      if (!re.test(src)) continue;
      if (/recalcularStatusDisciplina\(/.test(src)) continue;
      const linhas = src.split("\n");
      linhas.forEach((l, i) => {
        if (re.test(l) && !temMarcador(linhas, i)) achados.push(`${path.relative(RAIZ, f)}:${i + 1}`);
      });
    }
    expect(achados).toEqual([]);
  });
});
