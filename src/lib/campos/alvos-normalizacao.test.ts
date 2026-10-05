import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALVOS, SO_RELATORIO } from "../../../scripts/normalizar-campos-alvos";

const schema = readFileSync(path.resolve(__dirname, "../../../prisma/schema.prisma"), "utf8");

function bloco(modelo: string): string {
  const m = new RegExp(`^model ${modelo} \\{([\\s\\S]*?)^\\}`, "m").exec(schema);
  return m?.[1] ?? "";
}

describe("alvos do normalizar-campos existem no schema", () => {
  for (const [i, a] of [...ALVOS, ...SO_RELATORIO].entries()) {
    it(`${a.modelo} (${Object.keys(a.colunas).join(", ")}) #${i}`, () => {
      const b = bloco(a.modelo);
      expect(b, `model ${a.modelo} não existe`).not.toBe("");
      for (const col of Object.keys(a.colunas)) {
        expect(b, `${a.modelo}.${col}`).toMatch(new RegExp(`^\\s+${col}\\s+String`, "m"));
      }
      if (Object.values(a.colunas).includes("pix")) {
        expect(b, `${a.modelo}.pixTipo`).toMatch(/^\s+pixTipo\s+TipoPix/m);
      }
      for (const col of a.unicas ?? []) {
        expect(b, `${a.modelo}.${col} @unique`).toMatch(new RegExp(`^\\s+${col}\\s+String.*@unique`, "m"));
      }
      if (a.lixeira) {
        expect(b, `${a.modelo}.excluidoEm`).toMatch(/^\s+excluidoEm\s+DateTime\?/m);
      }
    });
  }

  it("o documento do cliente é só relatório (gravado só com dígitos)", () => {
    expect(ALVOS.some((a) => a.modelo === "Cliente" && "documento" in a.colunas)).toBe(false);
    expect(SO_RELATORIO.some((a) => a.modelo === "Cliente" && a.colunas.documento === "cpfCnpj")).toBe(true);
  });
});
