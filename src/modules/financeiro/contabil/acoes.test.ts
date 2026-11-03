import { describe, expect, it } from "vitest";
import {
  ACAO_COPIAR_CONTA,
  ACAO_ESCOLHER_CONTA,
  ACAO_LIMPAR_CONTA,
  ACAO_VER_EXTRATO,
  ACAO_VER_IMPOSTOS,
  ACAO_VER_LANCAMENTOS,
  MOTIVO_NADA_PARA_COPIAR,
  MOTIVO_SEM_CONTA_PROPRIA,
  itensDeCategoriaContabil,
  itensDeContaBancariaContabil,
  itensDeImpostoContabil,
} from "@/modules/financeiro/contabil/acoes";

const resumo = (itens: ReturnType<typeof itensDeCategoriaContabil>) =>
  itens.map((i) => (i.tipo === "acao" ? [i.id, i.desabilitado ?? null] : i.tipo === "link" ? [i.id, i.href] : [i.tipo]));

describe("itensDeCategoriaContabil", () => {
  it("as quatro ações do mock, com o mês no rótulo", () => {
    const itens = itensDeCategoriaContabil({ temLinhaPropria: true, temDeOndeCopiar: true }, "setembro");
    expect(resumo(itens)).toEqual([[ACAO_ESCOLHER_CONTA, null], [ACAO_COPIAR_CONTA, null], [ACAO_VER_LANCAMENTOS, null], ["separador"], [ACAO_LIMPAR_CONTA, null]]);
    expect(itens[2]).toMatchObject({ rotulo: "Ver lançamentos de setembro" });
  });

  it("sem conta própria, Limpar fica desabilitado com o motivo do mock; sem de onde copiar, Copiar também", () => {
    const itens = itensDeCategoriaContabil({ temLinhaPropria: false, temDeOndeCopiar: false }, "setembro");
    expect(resumo(itens)).toContainEqual([ACAO_LIMPAR_CONTA, MOTIVO_SEM_CONTA_PROPRIA]);
    expect(resumo(itens)).toContainEqual([ACAO_COPIAR_CONTA, MOTIVO_NADA_PARA_COPIAR]);
    expect(MOTIVO_SEM_CONTA_PROPRIA).toBe("Ainda não tem conta contábil.");
  });
});

describe("itensDeContaBancariaContabil", () => {
  it("leva ao extrato da conta no mês", () => {
    const itens = itensDeContaBancariaContabil({ temConta: false, contaId: "c1", mes: "2026-09", rotuloMes: "setembro" });
    expect(resumo(itens)).toEqual([[ACAO_ESCOLHER_CONTA, null], [ACAO_VER_EXTRATO, "/financeiro/extrato?conta=c1&mes=2026-09"], ["separador"], [ACAO_LIMPAR_CONTA, MOTIVO_SEM_CONTA_PROPRIA]]);
  });
});

describe("itensDeImpostoContabil (C4)", () => {
  it("a recolher: escolher, ver as contas do imposto e limpar (desabilitado sem conta)", () => {
    const itens = itensDeImpostoContabil({ temConta: false, rotulo: "ISS retido", aRecolher: true });
    expect(itens.map((i) => i.id)).toEqual([ACAO_ESCOLHER_CONTA, ACAO_VER_IMPOSTOS, "sep", ACAO_LIMPAR_CONTA]);
    expect(itens.find((i) => i.id === ACAO_VER_IMPOSTOS)).toMatchObject({ rotulo: "Ver as contas de impostos retidos", href: "/financeiro/contas?tab=impostos" });
    expect(itens.find((i) => i.id === ACAO_LIMPAR_CONTA)).toMatchObject({ desabilitado: MOTIVO_SEM_CONTA_PROPRIA });
  });
  it("a compensar não tem conta a pagar para listar", () => {
    expect(itensDeImpostoContabil({ temConta: true, rotulo: "ISS retido pelo cliente", aRecolher: false }).map((i) => i.id)).toEqual([ACAO_ESCOLHER_CONTA, "sep", ACAO_LIMPAR_CONTA]);
  });
});
