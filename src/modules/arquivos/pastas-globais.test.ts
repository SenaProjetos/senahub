import { describe, expect, it } from "vitest";
import { hrefDaPasta } from "@/modules/uploads/pastas-da-lista";
import { destinoGlobal, hrefGlobal, pastasGlobais, trilhaGlobal, type AnoDoDiretorio } from "./pastas-globais";

const ANOS: AnoDoDiretorio[] = [
  {
    ano: 2026,
    total: 13,
    projetos: [
      { projetoId: "p1", codigo: "260001", nome: "Residencial", total: 6 },
      { projetoId: "p4", codigo: "260004", nome: "Galpão", total: 7 },
    ],
  },
  { ano: 2025, total: 2, projetos: [{ projetoId: "p9", codigo: "250009", nome: "Escola", total: 2 }] },
];

describe("pastasGlobais", () => {
  it("na raiz lista os anos, sem .zip", () => {
    const pastas = pastasGlobais(null, ANOS);
    expect(pastas.map((p) => [p.tipo, p.rotulo, p.total])).toEqual([
      ["ano", "2026", 13],
      ["ano", "2025", 2],
    ]);
    expect(pastas[0].destino).toEqual(destinoGlobal("2026", null));
    expect(pastas.every((p) => p.zip === null)).toBe(true);
  });

  it("no ano lista os projetos dele, com código e nome", () => {
    const pastas = pastasGlobais("2026", ANOS);
    expect(pastas.map((p) => [p.tipo, p.rotulo, p.total])).toEqual([
      ["projeto", "260001 · Residencial", 6],
      ["projeto", "260004 · Galpão", 7],
    ]);
    expect(pastas[1].destino).toEqual({ ano: "2026", projetoId: "p4", disciplinaId: null, fase: null, ext: null, area: null, situacao: null, pasta: null });
  });

  it("ano que não existe não lista nada", () => {
    expect(pastasGlobais("1999", ANOS)).toEqual([]);
  });
});

describe("destinoGlobal + hrefDaPasta", () => {
  it("entrar num projeto zera a pasta aberta de outro projeto", () => {
    const href = hrefDaPasta("/arquivos", "ano=2026&projetoId=p1&disciplinaId=d1&fase=f&ext=pdf&sort=nome", destinoGlobal("2026", "p4"));
    expect(href).toBe("/arquivos?ano=2026&projetoId=p4&sort=nome");
  });

  it("pasta de dentro do projeto preserva ano e projeto da URL", () => {
    const href = hrefDaPasta("/arquivos", "ano=2026&projetoId=p4", { disciplinaId: "d1", fase: null, ext: null, area: null });
    expect(href).toBe("/arquivos?ano=2026&projetoId=p4&disciplinaId=d1");
  });
});

describe("trilhaGlobal", () => {
  it("na raiz não há trilha; no ano, volta a todos; no projeto, também ao ano", () => {
    expect(trilhaGlobal(null, null)).toEqual([]);
    expect(trilhaGlobal("2026", null)).toEqual([{ rotulo: "Todos os projetos", href: "/arquivos" }]);
    expect(trilhaGlobal("2026", { projetoId: "p4" })).toEqual([
      { rotulo: "Todos os projetos", href: "/arquivos" },
      { rotulo: "2026", href: "/arquivos?ano=2026" },
    ]);
  });

  it("hrefGlobal monta só ano e projeto", () => {
    expect(hrefGlobal("2026", "p4")).toBe("/arquivos?ano=2026&projetoId=p4");
  });
});
