import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { abaInicialDaCoordenacao, abasDaCoordenacao } from "@/modules/coordenacao/nav";

describe("aba inicial da Coordenação", () => {
  it("sem IFC e sem ?3d=1 abre a Sobreposição 2D", () => {
    expect(abaInicialDaCoordenacao({ temIfcConvertido: false, pediu3d: false })).toBe("sobreposicao");
  });

  it("com IFC abre o Modelo 3D", () => {
    expect(abaInicialDaCoordenacao({ temIfcConvertido: true, pediu3d: false })).toBe("3d");
    expect(abaInicialDaCoordenacao({ temIfcConvertido: true, pediu3d: true })).toBe("3d");
  });

  it("sem IFC mas com ?3d=1 fica no Modelo 3D", () => {
    expect(abaInicialDaCoordenacao({ temIfcConvertido: false, pediu3d: true })).toBe("3d");
  });
});

describe("abas da Coordenação", () => {
  it("são duas, na ordem do desenho, e o Modelo 3D leva ?3d=1", () => {
    const abas = abasDaCoordenacao("p1");
    expect(abas.map((a) => a.id)).toEqual(["3d", "sobreposicao"]);
    expect(abas.map((a) => a.rotulo)).toEqual(["Modelo 3D (IFC)", "Sobreposição 2D"]);
    expect(abas[0].href).toBe("/projetos/p1/coordenacao?3d=1");
    expect(abas[1].href).toBe("/projetos/p1/coordenacao/sobreposicao");
  });

  it("todo href aponta para uma página que existe", () => {
    const raiz = join(__dirname, "..", "..", "app", "(dashboard)");
    for (const a of abasDaCoordenacao("[id]")) {
      const pasta = join(raiz, a.href.split("?")[0].replace(/^\//, ""));
      expect(existsSync(join(pasta, "page.tsx")), `${a.href} sem page.tsx`).toBe(true);
    }
  });
});
