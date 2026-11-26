import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CORES_PROJETO, FUNDO_COR_PROJETO, NOME_COR_PROJETO, corAutomatica, corDoProjeto, ehCorProjeto } from "./cor-projeto";

describe("cor do projeto", () => {
  it("a automática é estável e sempre da paleta", () => {
    for (const id of ["cmwusod8y00002sr5wo8uy1pp", "a", "", "cmr5skcfy002tg8r5upti73bv"]) {
      expect(corAutomatica(id)).toBe(corAutomatica(id));
      expect(ehCorProjeto(corAutomatica(id))).toBe(true);
    }
  });

  it("projetos diferentes se espalham pela paleta", () => {
    const usadas = new Set(Array.from({ length: 200 }, (_, i) => corAutomatica(`projeto-${i}`)));
    expect(usadas.size).toBe(CORES_PROJETO.length);
  });

  it("a escolhida vence; valor fora da paleta (ou hex antigo) cai na automática", () => {
    expect(corDoProjeto({ id: "x", cor: "projeto-5" })).toBe("projeto-5");
    expect(corDoProjeto({ id: "x", cor: "#ff0000" })).toBe(corAutomatica("x"));
    expect(corDoProjeto({ id: "x", cor: null })).toBe(corAutomatica("x"));
  });

  it("toda cor tem nome, classe e o token claro e escuro em globals.css", () => {
    const css = readFileSync(path.resolve(__dirname, "../../app/globals.css"), "utf8");
    for (const c of CORES_PROJETO) {
      expect(NOME_COR_PROJETO[c]).toBeTruthy();
      expect(FUNDO_COR_PROJETO[c]).toBe(`bg-${c}`);
      expect(css).toContain(`--color-${c}: var(--${c});`);
      expect(css.match(new RegExp(`--${c}: #[0-9a-f]{6};`, "g"))?.length).toBe(2);
    }
  });
});
