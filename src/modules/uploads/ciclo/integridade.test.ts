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
  arquivoNaLixeira: false,
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
  });

  it("I6: publicada ou arquivada com arquivo na lixeira", () => {
    expect(encontrarViolacoes([r({ estado: "publicado", arquivoNaLixeira: true })], opts).map((x) => x.tipo)).toEqual(["publicada_com_lixeira"]);
    expect(encontrarViolacoes([r({ estado: "em_andamento", arquivoNaLixeira: true })], opts)).toEqual([]);
  });

  it("análise parada além do prazo do projeto", () => {
    const antiga = new Date(agora.getTime() - 10 * 24 * 60 * 60 * 1000);
    expect(encontrarViolacoes([r({ estado: "compartilhado", estadoEm: antiga })], opts)).toEqual([
      expect.objectContaining({ tipo: "analise_parada", dias: 10 }),
    ]);
    expect(encontrarViolacoes([r({ estado: "compartilhado", estadoEm: antiga })], { agora, diasAlertaPorProjeto: () => 15 })).toEqual([]);
  });
});
