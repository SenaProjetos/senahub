import { describe, expect, it } from "vitest";
import {
  avisoDaQuitacao,
  competenciaDaFolha,
  desfazerQuitacao,
  escolherPendenteDaFolha,
  folhaQuitaPrevisto,
  type PendenteDaFolha,
} from "@/modules/rh/folha/quitacao";
import { reais } from "@/modules/financeiro/liquidez/fixtures";

function pendente(p: Partial<PendenteDaFolha> & { id: string }): PendenteDaFolha {
  return {
    valor: reais(40_000),
    status: "previsto",
    vencimento: "2026-10-05",
    recorrenciaCompetencia: null,
    ...p,
  };
}

describe("competência da folha", () => {
  it("ano e mês viram YYYY-MM", () => {
    expect(competenciaDaFolha({ ano: 2026, mes: 1 })).toBe("2026-01");
    expect(competenciaDaFolha({ ano: 2026, mes: 10 })).toBe("2026-10");
  });
  it("só a folha mensal quita o previsto (13º tem folha própria no mesmo mês)", () => {
    expect(folhaQuitaPrevisto("mensal")).toBe(true);
    expect(folhaQuitaPrevisto("decimo_terceiro")).toBe(false);
  });
});

describe("escolherPendenteDaFolha", () => {
  it("sem nada em aberto, não quita nada", () => {
    expect(escolherPendenteDaFolha([], "2026-10")).toEqual({ escolhido: null, outros: [] });
  });

  it("o lançamento da recorrência da competência ganha de qualquer outro", () => {
    const q = escolherPendenteDaFolha(
      [
        pendente({ id: "manual", vencimento: "2026-10-01" }),
        pendente({ id: "rec", vencimento: "2026-10-05", recorrenciaCompetencia: "2026-10" }),
      ],
      "2026-10",
    );
    expect(q.escolhido?.id).toBe("rec");
    expect(q.outros.map((o) => o.id)).toEqual(["manual"]);
  });

  it("recorrência de OUTRA competência não conta como vínculo", () => {
    const q = escolherPendenteDaFolha([pendente({ id: "set", recorrenciaCompetencia: "2026-09" })], "2026-10");
    // Entrou na lista de candidatos do mês, mas sem vínculo e sozinho — ainda é quitado.
    expect(q.escolhido?.id).toBe("set");
  });

  it("um único pendente sem vínculo é quitado; dois, nenhum", () => {
    expect(escolherPendenteDaFolha([pendente({ id: "a" })], "2026-10").escolhido?.id).toBe("a");
    const dois = escolherPendenteDaFolha([pendente({ id: "a" }), pendente({ id: "b" })], "2026-10");
    expect(dois.escolhido).toBeNull();
    expect(dois.outros.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("aguardando aprovação nunca é quitado (quitar pagaria sem a aprovação)", () => {
    const q = escolherPendenteDaFolha(
      [pendente({ id: "aprov", status: "aguardando_aprovacao" }), pendente({ id: "prev" })],
      "2026-10",
    );
    expect(q.escolhido?.id).toBe("prev");
    expect(q.outros.map((o) => o.id)).toEqual(["aprov"]);

    const so = escolherPendenteDaFolha([pendente({ id: "aprov", status: "aguardando_aprovacao" })], "2026-10");
    expect(so.escolhido).toBeNull();
    expect(so.outros.map((o) => o.id)).toEqual(["aprov"]);
  });

  it("escolha não depende da ordem que o banco devolveu", () => {
    const a = pendente({ id: "a", vencimento: "2026-10-10", recorrenciaCompetencia: "2026-10" });
    const b = pendente({ id: "b", vencimento: "2026-10-05", recorrenciaCompetencia: "2026-10" });
    expect(escolherPendenteDaFolha([a, b], "2026-10").escolhido?.id).toBe("b");
    expect(escolherPendenteDaFolha([b, a], "2026-10").escolhido?.id).toBe("b");
  });
});

describe("avisoDaQuitacao", () => {
  it("sem nada em aberto, sem aviso", () => {
    expect(avisoDaQuitacao({ escolhido: null, outros: [] }, reais(40_000))).toBeNull();
  });

  it("valor igual ao previsto: só diz que quitou", () => {
    const q = escolherPendenteDaFolha([pendente({ id: "a", valor: reais(40_000) })], "2026-10");
    expect(avisoDaQuitacao(q, reais(40_000))).toBe("A conta a pagar prevista da competência foi quitada com o valor real.");
  });

  it("diferença de valor aparece com sinal", () => {
    const q = escolherPendenteDaFolha([pendente({ id: "a", valor: reais(40_000) })], "2026-10");
    expect(avisoDaQuitacao(q, reais(41_500))).toContain("diferença de R$ 1.500,00");
    expect(avisoDaQuitacao(q, reais(38_000))).toContain("diferença de −R$ 2.000,00");
  });

  it("o que fica em aberto é dito, no singular e no plural", () => {
    const um = escolherPendenteDaFolha([pendente({ id: "a" }), pendente({ id: "b" })], "2026-10");
    expect(avisoDaQuitacao(um, reais(40_000))).toContain("2 contas a pagar em aberto");
    const comVinculo = escolherPendenteDaFolha(
      [pendente({ id: "rec", recorrenciaCompetencia: "2026-10" }), pendente({ id: "b" })],
      "2026-10",
    );
    expect(avisoDaQuitacao(comVinculo, reais(40_000))).toContain("outra conta a pagar em aberto");
  });
});

describe("desfazerQuitacao (reabrir a folha)", () => {
  it("folha sem lançamento, nada a fazer", () => {
    expect(desfazerQuitacao({ lancamentoId: null, lancamentoReaproveitado: false, lancamentoValorPrevisto: null })).toEqual({ acao: "nada" });
  });
  it("lançamento criado pelo fechamento é apagado", () => {
    expect(desfazerQuitacao({ lancamentoId: "l1", lancamentoReaproveitado: false, lancamentoValorPrevisto: null })).toEqual({
      acao: "apagar",
      id: "l1",
    });
  });
  it("previsto reaproveitado volta ao previsto com o valor que tinha", () => {
    expect(desfazerQuitacao({ lancamentoId: "l1", lancamentoReaproveitado: true, lancamentoValorPrevisto: reais(39_000) })).toEqual({
      acao: "reverter",
      id: "l1",
      valor: reais(39_000),
    });
  });
});
