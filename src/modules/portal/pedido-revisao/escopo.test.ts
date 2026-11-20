import { describe, expect, it } from "vitest";
import { whereDaFila } from "./escopo";

describe("whereDaFila: a fila usa a mesma muralha de aceitar/recusar", () => {
  const projeto = { membros: { some: { userId: "u1" } } };
  it("sem projetos:ver, nada", () => {
    expect(whereDaFila({ podeVerProjetos: false, escopoProjeto: projeto, userId: "u1", veTodas: true })).toEqual({ id: { in: [] } });
  });
  it("vê todas as disciplinas: só o escopo do projeto", () => {
    expect(whereDaFila({ podeVerProjetos: true, escopoProjeto: projeto, userId: "u1", veTodas: true })).toEqual({ projeto });
  });
  it("sem visão ampla: só pedidos das disciplinas de que é responsável", () => {
    expect(whereDaFila({ podeVerProjetos: true, escopoProjeto: projeto, userId: "u1", veTodas: false })).toEqual({
      projeto,
      documento: { disciplina: { responsaveis: { some: { userId: "u1" } } } },
    });
  });
});
