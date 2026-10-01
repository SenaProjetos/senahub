import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda da spec 2026-09-30 (A5): `/configuracoes/disciplinas` e `/configuracoes/lista-mestre` só
 * redirecionam para a tela única — nenhum link, `revalidatePath` ou `router.push` do código aponta
 * para elas. As duas páginas de redirecionamento montam o destino sem citar a rota antiga.
 */

const RAIZ = path.resolve(__dirname, "../../../../..");
const ROTA_ANTIGA = /["'`]\/configuracoes\/(?:disciplinas|lista-mestre)(?![\w-])/;

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

describe("rotas antigas do catálogo (A5)", () => {
  it("o detector pega a rota entre aspas e ignora import e prefixo parecido", () => {
    expect(ROTA_ANTIGA.test('href="/configuracoes/disciplinas"')).toBe(true);
    expect(ROTA_ANTIGA.test("revalidatePath('/configuracoes/lista-mestre')")).toBe(true);
    expect(ROTA_ANTIGA.test("`/configuracoes/disciplinas?x=1`")).toBe(true);
    expect(ROTA_ANTIGA.test('from "@/components/configuracoes/disciplinas-catalogo-view"')).toBe(false);
    expect(ROTA_ANTIGA.test('"/configuracoes/disciplinas-novas"')).toBe(false);
  });

  it("nenhum arquivo de src cita as rotas antigas", () => {
    const achados: string[] = [];
    for (const arquivo of arquivosDeCodigo(path.join(RAIZ, "src"))) {
      const linhas = semComentarios(readFileSync(arquivo, "utf8")).split("\n");
      linhas.forEach((l, i) => {
        if (ROTA_ANTIGA.test(l)) achados.push(`${path.relative(RAIZ, arquivo)}:${i + 1}`);
      });
    }
    expect(achados).toEqual([]);
  });
});
