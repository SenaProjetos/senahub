import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Teste-guarda: as regras do estudo rodam também no navegador (o editor importa `calculo` e `form`) e não podem
 * tocar o banco, a sessão nem o Next. Só `queries.ts`, `service.ts`, `actions.ts` e `memoria.ts` leem o banco.
 */
const PASTA = __dirname;
const PUROS = ["conteudo.ts", "calculo.ts", "form.ts", "acesso.ts", "acoes.ts"];
const PROIBIDO =
  /from\s+["'](@\/lib\/prisma|server-only|next\/[^"']*|@\/generated\/prisma[^"']*|@\/lib\/session|@\/lib\/with-action|node:[^"']*)["']|import\s+["']server-only["']/;

describe("regras do estudo são puras", () => {
  for (const f of PUROS) {
    it(`${f} não importa banco, sessão, Next nem node:`, () => {
      expect(readFileSync(join(PASTA, f), "utf8")).not.toMatch(PROIBIDO);
    });
  }
});
