import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Teste-guarda: o motor de liquidez roda no navegador para recalcular a simulação na hora e não pode
 * tocar o banco — é isso que garante que simular nunca altera o real (spec §10). Só `queries.ts`
 * (server-only) lê o banco.
 */
const PASTA = __dirname;
const PROIBIDO = /from\s+["'](@\/lib\/prisma|server-only|next\/[^"']*|@\/generated\/prisma[^"']*|@\/lib\/session|@\/lib\/with-action)["']|import\s+["']server-only["']/;

describe("liquidez é pura", () => {
  const arquivos = readdirSync(PASTA).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "queries.ts");

  it("existe o que conferir", () => {
    expect(arquivos).toEqual(expect.arrayContaining(["motor.ts", "eventos.ts", "caixinhas.ts", "saldo-base.ts"]));
  });

  for (const f of arquivos) {
    it(`${f} não importa banco, sessão nem Next`, () => {
      expect(readFileSync(join(PASTA, f), "utf8")).not.toMatch(PROIBIDO);
    });
  }

  it("natureza.ts (usada pelo motor e pelos relatórios) também é pura", () => {
    expect(readFileSync(join(PASTA, "..", "natureza.ts"), "utf8")).not.toMatch(PROIBIDO);
  });
});
