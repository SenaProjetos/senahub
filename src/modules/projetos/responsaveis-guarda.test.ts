import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda (R5 do rateio, decisão 13): toda troca de responsável de disciplina passa por
 * `substituirResponsaveis` (responsaveis-service.ts), que também grava o HISTÓRICO com datas. Um
 * `disciplinaResponsavel.create/delete…` solto em outro arquivo trocaria o responsável sem deixar
 * registro, e a correção de ponto de um dia antigo pegaria a disciplina errada.
 */
const RAIZ = path.resolve(__dirname, "..", "..");
const PERMITIDO = path.join("modules", "projetos", "responsaveis-service.ts");

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) return nome === "generated" ? [] : arquivos(p);
    if (p.endsWith(".test.ts") || p.endsWith(".test.tsx")) return [];
    return p.endsWith(".ts") || p.endsWith(".tsx") ? [p] : [];
  });
}

describe("escrita de DisciplinaResponsavel só pelo serviço", () => {
  it("nenhum outro arquivo cria ou apaga responsável de disciplina", () => {
    const re = /disciplinaResponsavel\.(create|createMany|delete|deleteMany|upsert|update|updateMany)\b/g;
    const achados: string[] = [];
    for (const f of arquivos(RAIZ)) {
      if (f.endsWith(PERMITIDO)) continue;
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(re)) achados.push(`${path.relative(RAIZ, f)}:${src.slice(0, m.index).split("\n").length}`);
    }
    expect(achados).toEqual([]);
  });
});
