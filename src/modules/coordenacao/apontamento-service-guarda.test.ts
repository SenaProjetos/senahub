import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda: todo apontamento 3D novo nasce por `criarApontamentoCoordenacaoNoTx` (apontamento-service.ts), que numera
 * pelo projeto sob trava. Um `apontamentoCoordenacao.create` solto leria o máximo sem trava e repetiria número quando
 * dois apontamentos nascem ao mesmo tempo (a tela, o BCF e o aceite do pedido do cliente).
 */
const RAIZ = path.resolve(__dirname, "..", "..");
const PERMITIDO = path.join("modules", "coordenacao", "apontamento-service.ts");

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) return nome === "generated" ? [] : arquivos(p);
    if (p.endsWith(".test.ts") || p.endsWith(".test.tsx")) return [];
    return p.endsWith(".ts") || p.endsWith(".tsx") ? [p] : [];
  });
}

describe("criação de ApontamentoCoordenacao só pelo serviço", () => {
  it("nenhum outro arquivo cria apontamento 3D", () => {
    const re = /apontamentoCoordenacao\.(create|createMany|createManyAndReturn|upsert)\b/g;
    const achados: string[] = [];
    for (const f of arquivos(RAIZ)) {
      if (f.endsWith(PERMITIDO)) continue;
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(re)) achados.push(`${path.relative(RAIZ, f)}:${src.slice(0, m.index).split("\n").length}`);
    }
    expect(achados).toEqual([]);
  });
});
