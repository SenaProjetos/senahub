import { describe, expect, it } from "vitest";
import {
  avisoDoFechamento,
  competenciaDaFolha,
  decidirContaDaFolha,
  folhaUsaContaDaCompetencia,
  motivoParaNaoReabrir,
  type ContaDaFolha,
} from "@/modules/rh/folha/quitacao";
import { reais } from "@/modules/financeiro/liquidez/fixtures";

/** Folha de OUTUBRO (competência 2026-10), paga até o 5º dia útil de novembro. */
const COMP = "2026-10";

function conta(p: Partial<ContaDaFolha> & { id: string }): ContaDaFolha {
  return {
    valor: reais(40_000),
    status: "previsto",
    vencimento: "2026-11-06",
    recorrenciaCompetencia: null,
    adiantamento: false,
    ...p,
  };
}

describe("competência e tipo da folha", () => {
  it("ano e mês viram YYYY-MM", () => {
    expect(competenciaDaFolha({ ano: 2026, mes: 1 })).toBe("2026-01");
    expect(competenciaDaFolha({ ano: 2026, mes: 10 })).toBe("2026-10");
  });
  it("só a folha mensal usa a conta da competência (13º tem folha própria no mesmo mês)", () => {
    expect(folhaUsaContaDaCompetencia("mensal")).toBe(true);
    expect(folhaUsaContaDaCompetencia("decimo_terceiro")).toBe(false);
  });
});

describe("decidirContaDaFolha", () => {
  it("sem conta nenhuma, nada é escolhido (nasce uma)", () => {
    expect(decidirContaDaFolha([], COMP)).toEqual({ escolhida: null, jaPaga: null, outras: [] });
  });

  it("A1: a conta da recorrência de OUTUBRO, que vence em NOVEMBRO, é a da folha de outubro", () => {
    const d = decidirContaDaFolha([conta({ id: "rec", recorrenciaCompetencia: "2026-10", vencimento: "2026-11-06" })], COMP);
    expect(d.escolhida?.id).toBe("rec");
  });

  it("adiantamento de salário da mesma competência nunca é usado (o holerite já o desconta)", () => {
    const adiant = conta({ id: "adiant", recorrenciaCompetencia: COMP, vencimento: "2026-10-20", adiantamento: true });
    const saldo = conta({ id: "saldo", recorrenciaCompetencia: COMP, vencimento: "2026-11-06" });
    const d = decidirContaDaFolha([adiant, saldo], COMP);
    expect(d.escolhida?.id).toBe("saldo");
    expect(d.outras.map((o) => o.id)).toEqual([]);
    // Só o adiantamento: nasce a conta do saldo, e o adiantamento não vira aviso.
    expect(decidirContaDaFolha([adiant], COMP)).toEqual({ escolhida: null, jaPaga: null, outras: [] });
  });

  it("conta da competência JÁ PAGA: nada nasce e ela vira `jaPaga`", () => {
    const paga = conta({ id: "paga", recorrenciaCompetencia: COMP, status: "confirmado" });
    const d = decidirContaDaFolha([paga], COMP);
    expect(d.jaPaga?.id).toBe("paga");
    expect(d.escolhida).toBeNull();
  });

  it("paga SEM vínculo não conta como a folha (pode ser outra despesa da categoria)", () => {
    const d = decidirContaDaFolha([conta({ id: "solta", status: "confirmado" })], COMP);
    expect(d).toEqual({ escolhida: null, jaPaga: null, outras: [] });
  });

  it("a vinculada ganha da manual; a manual vira aviso", () => {
    const d = decidirContaDaFolha([conta({ id: "manual", vencimento: "2026-11-03" }), conta({ id: "rec", recorrenciaCompetencia: COMP })], COMP);
    expect(d.escolhida?.id).toBe("rec");
    expect(d.outras.map((o) => o.id)).toEqual(["manual"]);
  });

  it("vínculo de OUTRA competência não conta como vínculo", () => {
    const d = decidirContaDaFolha([conta({ id: "set", recorrenciaCompetencia: "2026-09" })], COMP);
    // Entrou na janela sem ser desta competência: sozinha, ainda é a candidata.
    expect(d.escolhida?.id).toBe("set");
  });

  it("uma sem vínculo é usada; duas sem vínculo, nenhuma (não se adivinha)", () => {
    expect(decidirContaDaFolha([conta({ id: "a" })], COMP).escolhida?.id).toBe("a");
    const duas = decidirContaDaFolha([conta({ id: "a" }), conta({ id: "b" })], COMP);
    expect(duas.escolhida).toBeNull();
    expect(duas.outras.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("aguardando aprovação nunca recebe o valor (passaria por cima da aprovação)", () => {
    const d = decidirContaDaFolha([conta({ id: "aprov", status: "aguardando_aprovacao" }), conta({ id: "prev" })], COMP);
    expect(d.escolhida?.id).toBe("prev");
    expect(d.outras.map((o) => o.id)).toEqual(["aprov"]);
  });

  it("a escolha não depende da ordem que o banco devolveu", () => {
    const a = conta({ id: "a", vencimento: "2026-11-09", recorrenciaCompetencia: COMP });
    const b = conta({ id: "b", vencimento: "2026-11-06", recorrenciaCompetencia: COMP });
    expect(decidirContaDaFolha([a, b], COMP).escolhida?.id).toBe("b");
    expect(decidirContaDaFolha([b, a], COMP).escolhida?.id).toBe("b");
  });
});

describe("avisoDoFechamento", () => {
  it("nasceu a conta e nada a dizer", () => {
    expect(avisoDoFechamento({ escolhida: null, jaPaga: null, outras: [] }, reais(40_000))).toBeNull();
  });

  it("conta atualizada: diz de quanto para quanto", () => {
    const d = decidirContaDaFolha([conta({ id: "a", recorrenciaCompetencia: COMP })], COMP);
    expect(avisoDoFechamento(d, reais(40_000))).toBe("A conta a pagar da competência já tinha o valor real.");
    expect(avisoDoFechamento(d, reais(41_500))).toContain("passou de R$ 40.000,00 para R$ 41.500,00 (diferença de R$ 1.500,00)");
  });

  it("já paga: aponta a diferença a acertar", () => {
    const d = decidirContaDaFolha([conta({ id: "p", recorrenciaCompetencia: COMP, status: "confirmado" })], COMP);
    expect(avisoDoFechamento(d, reais(38_000))).toContain("diferença de −R$ 2.000,00 a acertar");
    expect(avisoDoFechamento(d, reais(40_000))).toContain("com o mesmo valor");
  });

  it("o que ficou em aberto é dito, no singular e no plural", () => {
    expect(avisoDoFechamento(decidirContaDaFolha([conta({ id: "a" }), conta({ id: "b" })], COMP), reais(1))).toContain("2 contas a pagar de folha em aberto");
    const comVinculo = decidirContaDaFolha([conta({ id: "rec", recorrenciaCompetencia: COMP }), conta({ id: "b" })], COMP);
    expect(avisoDoFechamento(comVinculo, reais(40_000))).toContain("outra conta a pagar de folha em aberto");
  });
});

describe("motivoParaNaoReabrir", () => {
  it("conta já paga impede reabrir; em aberto ou sem conta, não", () => {
    expect(motivoParaNaoReabrir({ status: "confirmado" })).toContain("estorne o pagamento");
    expect(motivoParaNaoReabrir({ status: "previsto" })).toBeNull();
    expect(motivoParaNaoReabrir(null)).toBeNull();
  });
});
