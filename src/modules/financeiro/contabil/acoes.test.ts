import { describe, expect, it } from "vitest";
import {
  ACAO_COPIAR_CONTA,
  ACAO_ESCOLHER_CONTA,
  ACAO_LIMPAR_CONTA,
  ACAO_VER_EXTRATO,
  ACAO_VER_LANCAMENTOS,
  MOTIVO_NADA_PARA_COPIAR,
  MOTIVO_SEM_CONTA_PROPRIA,
  itensDeCategoriaContabil,
  itensDeContaBancariaContabil,
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
