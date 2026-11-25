import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda das telas do portal (spec 2026-11-25): cada página decide no TOPO se a pessoa é conta de obra e, se for, renderiza o
 * componente de obra — antes de qualquer leitura do cliente. Assim um cartão novo da página do cliente nunca aparece para a obra.
 */
const APP = path.resolve(__dirname, "..", "..", "..", "app", "(dashboard)", "portal");

const PAGINAS: [string, string][] = [
  ["page.tsx", "clienteDoUsuario("],
  [path.join("[projetoId]", "page.tsx"), "clienteDoUsuario("],
  [path.join("[projetoId]", "prancha", "[uploadId]", "page.tsx"), "pranchaParaPortal("],
  [path.join("[projetoId]", "modelo", "page.tsx"), "clienteDoUsuario("],
];

describe("telas do portal decidem a conta de obra antes do cliente", () => {
  for (const [arquivo, leituraDoCliente] of PAGINAS) {
    it(arquivo, () => {
      const src = readFileSync(path.join(APP, arquivo), "utf8");
      const obra = src.indexOf("ehContaObra(");
      const cliente = src.indexOf(leituraDoCliente);
      expect(obra).toBeGreaterThan(-1);
      expect(cliente).toBeGreaterThan(-1);
      expect(obra).toBeLessThan(cliente);
    });
  }
});
