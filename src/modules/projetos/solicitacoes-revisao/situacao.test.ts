import { describe, expect, it } from "vitest";
import { contarApontamentos, emAbertoPorDisciplina, situacaoSolicitacao } from "./situacao";

describe("contarApontamentos", () => {
  it("em aberto = aberta ou em correção; adiado, resolvida e encerrados não contam", () => {
    expect(contarApontamentos(["aberta", "em_correcao", "adiado", "resolvida", "fechada", "descartada"])).toEqual({
      total: 6,
      abertos: 2,
    });
  });
});

describe("situacaoSolicitacao", () => {
  it("em aberto enquanto sobrar apontamento aberto na rodada", () => {
    expect(situacaoSolicitacao({ total: 5, abertos: 1 })).toBe("em_aberto");
  });

  it("atendida quando nenhum apontamento da rodada está aberto", () => {
    expect(situacaoSolicitacao({ total: 5, abertos: 0 })).toBe("atendida");
  });

  it("sem apontamento vinculado não tem situação", () => {
    expect(situacaoSolicitacao({ total: 0, abertos: 0 })).toBeNull();
  });
});

describe("emAbertoPorDisciplina", () => {
  it("conta só as em aberto, por disciplina", () => {
    const mapa = emAbertoPorDisciplina([
      { disciplinaId: "arq", situacao: "em_aberto" },
      { disciplinaId: "arq", situacao: "em_aberto" },
      { disciplinaId: "arq", situacao: "atendida" },
      { disciplinaId: "est", situacao: "atendida" },
      { disciplinaId: "ele", situacao: null },
    ]);
    expect(Object.fromEntries(mapa)).toEqual({ arq: 2 });
  });
});
