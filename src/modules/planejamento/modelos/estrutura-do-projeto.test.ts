import { describe, expect, it } from "vitest";
import { estruturaModeloSchema } from "./estrutura";
import { estruturaDoProjeto, type LinhaDoProjeto } from "./estrutura-do-projeto";

const linha = (id: string, parentId: string | null, ordem: number, extra: Partial<LinhaDoProjeto> = {}): LinhaDoProjeto => ({
  id,
  parentId,
  ordem,
  nome: id,
  tipoEap: "atv",
  duracaoDias: 2,
  disciplinaId: null,
  etapaId: null,
  deTerceiro: false,
  predecessoras: [],
  ...extra,
});

const base = {
  catalogoDaDisciplina: new Map([["dHid", "catHid"]]),
  nomesDasDisciplinas: new Map([["dHid", "Hidrossanitário"], ["dSemPar", "Descartável"]]),
  fasesGlobais: new Set(["bs", "ex"]),
};

describe("estruturaDoProjeto", () => {
  // Hidro (res, disciplina) › A (BS), B (BS, depois de A com 2d de atraso) ; M (marco, raiz)
  const linhas = [
    linha("H", null, 10, { nome: "Hidro", tipoEap: "disc", duracaoDias: 7, disciplinaId: "dHid", etapaId: "bs" }),
    linha("A", "H", 11, { disciplinaId: "dHid", etapaId: "bs" }),
    linha("B", "H", 12, { duracaoDias: 3, disciplinaId: "dHid", etapaId: "bs", predecessoras: [{ predecessoraId: "A", tipo: "fs", lagDias: 2 }] }),
    linha("M", null, 13, { nome: "Entrega", tipoEap: "mrc", duracaoDias: 0 }),
  ];

  it("passa no schema do modelo e preserva árvore, ordem, duração, marco e vínculo com a defasagem", () => {
    const { estrutura } = estruturaDoProjeto({ ...base, linhas });
    expect(estruturaModeloSchema.safeParse(estrutura).success).toBe(true);
    expect(estrutura.versao).toBe(1);
    expect(estrutura.linhas.map((l) => [l.id, l.parentId, l.ordem])).toEqual([
      ["H", null, 0],
      ["A", "H", 1],
      ["B", "H", 2],
      ["M", null, 3],
    ]);
    const b = estrutura.linhas.find((l) => l.id === "B")!;
    expect(b.duracaoDias).toBe(3);
    expect(b.predecessoras).toEqual([{ id: "A", tipo: "fs", lagDias: 2 }]);
    const m = estrutura.linhas.find((l) => l.id === "M")!;
    expect(m.tipoEap).toBe("mrc");
    expect(m.duracaoDias).toBe(0);
  });

  it("agrupamento tem duração 0 (o motor deriva das filhas)", () => {
    expect(estruturaDoProjeto({ ...base, linhas }).estrutura.linhas.find((l) => l.id === "H")!.duracaoDias).toBe(0);
  });

  it("vínculo para uma linha fora do conjunto some", () => {
    const { estrutura } = estruturaDoProjeto({ ...base, linhas: [linha("A", null, 0, { predecessoras: [{ predecessoraId: "fora", tipo: "fs", lagDias: 0 }] })] });
    expect(estrutura.linhas[0].predecessoras).toEqual([]);
  });

  it("tipos que o modelo não conhece viram agrupamento (com filhas) ou atividade (sem)", () => {
    const { estrutura } = estruturaDoProjeto({
      ...base,
      linhas: [linha("P", null, 0, { tipoEap: "prj" }), linha("Q", "P", 1, { tipoEap: "pct" }), linha("R", "P", 2, { tipoEap: "loc", duracaoDias: 4 })],
    });
    const tipos = Object.fromEntries(estrutura.linhas.map((l) => [l.id, l.tipoEap]));
    expect(tipos).toEqual({ P: "res", Q: "atv", R: "atv" });
  });

  it("disciplina com par no catálogo vira o id do catálogo; sem par vira nulo, com aviso e o nome na lista", () => {
    const r = estruturaDoProjeto({ ...base, linhas: [...linhas, linha("X", null, 20, { disciplinaId: "dSemPar" })] });
    expect(r.estrutura.linhas.find((l) => l.id === "A")!.disciplinaCatalogoId).toBe("catHid");
    expect(r.estrutura.linhas.find((l) => l.id === "X")!.disciplinaCatalogoId).toBeNull();
    expect(r.disciplinasSemPar).toEqual(["Descartável"]);
    expect(r.avisos.some((a) => a.includes("Descartável"))).toBe(true);
    expect(estruturaModeloSchema.safeParse(r.estrutura).success).toBe(true);
  });

  it("fase só se for do catálogo global; a do próprio projeto vira nula, com aviso", () => {
    const r = estruturaDoProjeto({ ...base, linhas: [linha("A", null, 0, { etapaId: "bs" }), linha("B", null, 1, { etapaId: "so-deste-projeto" })] });
    expect(r.estrutura.linhas.map((l) => l.etapaId)).toEqual(["bs", null]);
    expect(r.avisos.some((a) => a.includes("fase"))).toBe(true);
  });

  it("preserva a marca de etapa de terceiro", () => {
    expect(estruturaDoProjeto({ ...base, linhas: [linha("A", null, 0, { deTerceiro: true })] }).estrutura.linhas[0].deTerceiro).toBe(true);
  });

  it("mais de 1200 linhas lança com a frase do modelo; sem linha nenhuma, também", () => {
    const muitas = Array.from({ length: 1201 }, (_, i) => linha(`L${i}`, null, i));
    expect(() => estruturaDoProjeto({ ...base, linhas: muitas })).toThrow(/1200 linhas/);
    expect(() => estruturaDoProjeto({ ...base, linhas: [] })).toThrow(/ainda não tem EAP/);
  });

  it("nome muito longo é cortado nos 300 caracteres do modelo", () => {
    const { estrutura } = estruturaDoProjeto({ ...base, linhas: [linha("A", null, 0, { nome: "x".repeat(400) })] });
    expect(estrutura.linhas[0].nome).toHaveLength(300);
  });
});
