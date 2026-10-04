import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ORIGENS_FORA_DE_RECEBIDOS, ORIGENS_FORA_DOS_MODELOS, ORIGEM_MODELO_FEDERADO } from "./origens";

/**
 * Guarda: uma origem nova de Documento entra em toda consulta que filtra por exclusão. Foi assim que o modelo
 * federado quase apareceu em Recebidos, no portal e na lista de modelos da Compatibilização (spec 2026-10-04 §8).
 * Filtro por exclusão de origem passa pelas constantes de `origens.ts`, nunca por literal.
 */
const RAIZ = path.resolve(__dirname, "../..");

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) return nome === "generated" ? [] : arquivos(p);
    if (/\.test\.tsx?$/.test(p)) return [];
    return /\.tsx?$/.test(p) ? [p] : [];
  });
}

describe("origens de documento", () => {
  it("o federado fica fora de Recebidos e da lista de modelos", () => {
    expect(ORIGENS_FORA_DE_RECEBIDOS).toContain(ORIGEM_MODELO_FEDERADO);
    expect(ORIGENS_FORA_DOS_MODELOS).toContain(ORIGEM_MODELO_FEDERADO);
  });

  it("nenhuma consulta filtra origem por exclusão com literal", () => {
    const ruins = arquivos(RAIZ).flatMap((f) => {
      const src = readFileSync(f, "utf8");
      return /origem:\s*\{\s*(?:notIn:\s*\[\s*"|not:\s*")/.test(src) ? [path.relative(RAIZ, f)] : [];
    });
    expect(ruins).toEqual([]);
  });
});
