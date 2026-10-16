import { describe, expect, it } from "vitest";

import { encontrarViolacoes, type RevisaoVarrida } from "./integridade";

const agora = new Date("2026-10-20T12:00:00Z");
const r = (p: Partial<RevisaoVarrida>): RevisaoVarrida => ({
  id: "r1",
  documentoId: "d1",
  projetoId: "p1",
  documentoNome: "A-01",
  numero: 1,
  estado: "em_andamento",
  estadoEm: agora,
  controlesDePasta: [],
  qtdNaLixeira: 0,
  ...p,
});
const opts = { agora, diasAlertaPorProjeto: () => 7 };

describe("encontrarViolacoes (A7)", () => {
  it("dados íntegros: nada", () => {
    expect(encontrarViolacoes([r({ estado: "publicado", controlesDePasta: [{ id: "c1", tipo: "liberado_obra" }] })], opts)).toEqual([]);
  });

  it("I5: liberado para obra numa revisão não publicada é detectado com o id do controle a revogar", () => {
    const v = encontrarViolacoes([r({ estado: "arquivado", controlesDePasta: [{ id: "c9", tipo: "liberado_obra" }] })], opts);
    expect(v).toEqual([expect.objectContaining({ tipo: "controle_fora_de_publicada", controleId: "c9", revisaoId: "r1" })]);
  });

  it("I4: duas publicadas no mesmo documento", () => {
    const v = encontrarViolacoes([r({ id: "a", estado: "publicado" }), r({ id: "b", numero: 2, estado: "publicado" })], opts);
    expect(v.map((x) => x.tipo)).toEqual(["duas_publicadas"]);
    expect(v[0]).toMatchObject({ documentoId: "d1", revisaoIds: ["a", "b"] });
  });

  it("I6: publicada ou arquivada com arquivo na lixeira, com a contagem", () => {
    const v = encontrarViolacoes([r({ estado: "publicado", qtdNaLixeira: 2 })], opts);
    expect(v).toEqual([
      expect.objectContaining({ tipo: "publicada_com_lixeira", revisaoId: "r1", documentoId: "d1", numero: 1, estado: "publicado", qtdNaLixeira: 2 }),
    ]);
    expect(encontrarViolacoes([r({ estado: "em_andamento", qtdNaLixeira: 1 })], opts)).toEqual([]);
  });

  it("análise parada além do prazo do projeto, com data de entrada e limite", () => {
    const antiga = new Date(agora.getTime() - 10 * 24 * 60 * 60 * 1000);
    expect(encontrarViolacoes([r({ estado: "compartilhado", estadoEm: antiga })], opts)).toEqual([
      expect.objectContaining({ tipo: "analise_parada", dias: 10, limiteDias: 7, estadoEm: antiga, documentoId: "d1", numero: 1 }),
    ]);
    expect(encontrarViolacoes([r({ estado: "compartilhado", estadoEm: antiga })], { agora, diasAlertaPorProjeto: () => 15 })).toEqual([]);
  });
});
