import { describe, expect, it } from "vitest";
import { GUIA_DOS_TIPOS, guiaDaPendencia } from "./guia-pendencia";

describe("guiaDaPendencia", () => {
  it("lixeira de revisão publicada: é o arquivo vigente e manda restaurar ou republicar", () => {
    const g = guiaDaPendencia({ tipo: "publicada_com_lixeira", estado: "publicado" });
    expect(g.resumo).toMatch(/vigente/);
    expect(g.passos.join(" ")).toMatch(/Restaure/);
    expect(g.passos.join(" ")).toMatch(/nova revisão/);
  });

  it("lixeira de revisão arquivada: costuma ser limpeza", () => {
    const g = guiaDaPendencia({ tipo: "publicada_com_lixeira", estado: "arquivado" });
    expect(g.resumo).toMatch(/antiga/);
    expect(g.passos.join(" ")).toMatch(/Dispense/);
  });

  it("duas publicadas: manda não dispensar", () => {
    expect(guiaDaPendencia({ tipo: "duas_publicadas", estado: null }).passos.join(" ")).toMatch(/Não dispense/);
  });

  it("corrigida: nada a fazer", () => {
    expect(guiaDaPendencia({ tipo: "corrigida", estado: null }).resumo).toMatch(/Nada a fazer/);
  });

  it("o painel cobre os quatro tipos", () => {
    expect(GUIA_DOS_TIPOS.map((g) => g.tipo)).toEqual(["publicada_com_lixeira", "analise_parada", "duas_publicadas", "corrigida"]);
  });
});

describe("texto para quem usa", () => {
  it("nenhum passo fala de banco ou índice", () => {
    const tipos = ["publicada_com_lixeira", "analise_parada", "duas_publicadas", "corrigida"] as const;
    for (const tipo of tipos) {
      const g = guiaDaPendencia({ tipo, estado: "publicado" });
      expect([g.resumo, ...g.passos].join(" ")).not.toMatch(/banco|índice/i);
    }
    for (const g of GUIA_DOS_TIPOS) expect(g.texto).not.toMatch(/banco|índice/i);
  });
});
