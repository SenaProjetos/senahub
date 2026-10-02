import { describe, expect, it } from "vitest";
import {
  ACAO_ABRIR,
  ACAO_APROVAR,
  ACAO_REJEITAR,
  itensDeAprovacao,
  MOTIVO_PROPRIA_DESPESA,
  MOTIVO_SEM_ALCADA,
} from "@/modules/financeiro/aprovacao/acoes";

const ids = (itens: ReturnType<typeof itensDeAprovacao>) => itens.map((i) => i.id);

describe("itensDeAprovacao", () => {
  it("quem aprova e tem alçada vê aprovar, rejeitar e o atalho", () => {
    const itens = itensDeAprovacao({ id: "l1", bloqueio: null }, { podeAprovar: true });
    expect(ids(itens)).toEqual([ACAO_APROVAR, ACAO_REJEITAR, "sep", ACAO_ABRIR]);
    expect(itens.every((i) => i.tipo !== "acao" || !i.desabilitado)).toBe(true);
  });

  it("quem NÃO aprova só vê o atalho", () => {
    expect(ids(itensDeAprovacao({ id: "l1", bloqueio: null }, { podeAprovar: false }))).toEqual([ACAO_ABRIR]);
  });

  it("sem alçada para o valor, as duas decisões ficam desabilitadas com a frase do servidor", () => {
    const itens = itensDeAprovacao({ id: "l1", bloqueio: MOTIVO_SEM_ALCADA }, { podeAprovar: true });
    for (const id of [ACAO_APROVAR, ACAO_REJEITAR]) {
      const i = itens.find((x) => x.id === id);
      expect(i?.tipo === "acao" && i.desabilitado).toBe(MOTIVO_SEM_ALCADA);
    }
  });

  it("quem lançou: a frase do servidor desabilita as duas decisões", () => {
    const itens = itensDeAprovacao({ id: "l1", bloqueio: MOTIVO_PROPRIA_DESPESA }, { podeAprovar: true });
    const i = itens.find((x) => x.id === ACAO_APROVAR);
    expect(i?.tipo === "acao" && i.desabilitado).toBe(MOTIVO_PROPRIA_DESPESA);
  });

  it("rejeitar é destrutivo; o atalho é link de verdade para o lançamento", () => {
    const itens = itensDeAprovacao({ id: "l9", bloqueio: null }, { podeAprovar: true });
    const rejeitar = itens.find((i) => i.id === ACAO_REJEITAR);
    expect(rejeitar?.tipo === "acao" && rejeitar.variant).toBe("destructive");
    const abrir = itens.find((i) => i.id === ACAO_ABRIR);
    expect(abrir?.tipo === "link" && abrir.href).toBe("/financeiro/lancamentos?lancamento=l9");
  });
});
