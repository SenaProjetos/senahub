import { describe, expect, it } from "vitest";

import {
  ACAO_ANEXOS,
  ACAO_COPIAR_DESCRICAO,
  ACAO_EDITAR,
  ACAO_LOTE_QUITAR,
  ACAO_QUITAR,
  MOTIVO_AGUARDANDO_APROVACAO,
  itensDeConta,
  itensDeLoteContas,
} from "./acoes-conta";

const ids = (itens: { id: string }[]) => itens.map((i) => i.id);

describe("itensDeConta", () => {
  it("quem gere recebe quitar, editar, anexos e copiar", () => {
    expect(ids(itensDeConta({ status: "previsto", anexos: 0 }, { tipo: "despesa", podeGerir: true }))).toEqual([
      ACAO_QUITAR,
      ACAO_EDITAR,
      ACAO_ANEXOS,
      ACAO_COPIAR_DESCRICAO,
    ]);
  });

  // Regra 5 da ADR-0002: o que o PERFIL não permite some.
  it("quem só vê não recebe editar nem anexos", () => {
    expect(ids(itensDeConta({ status: "previsto", anexos: 0 }, { tipo: "despesa", podeGerir: false }))).toEqual([
      ACAO_QUITAR,
      ACAO_COPIAR_DESCRICAO,
    ]);
  });

  it("o verbo segue a aba: despesa paga, receita recebe", () => {
    const despesa = itensDeConta({ status: "previsto", anexos: 0 }, { tipo: "despesa", podeGerir: false });
    const receita = itensDeConta({ status: "previsto", anexos: 0 }, { tipo: "receita", podeGerir: false });
    expect(despesa[0]).toMatchObject({ rotulo: "Pagar" });
    expect(receita[0]).toMatchObject({ rotulo: "Receber" });
  });

  // Regra 5: o que o ESTADO impede fica desabilitado, com o motivo — o mesmo texto do aviso antigo.
  it("aguardando aprovação: quitar desabilitado com o motivo, não escondido", () => {
    const itens = itensDeConta({ status: "aguardando_aprovacao", anexos: 0 }, { tipo: "despesa", podeGerir: true });
    expect(itens[0]).toMatchObject({ id: ACAO_QUITAR, desabilitado: MOTIVO_AGUARDANDO_APROVACAO });
  });

  it("mostra a contagem de anexos", () => {
    const itens = itensDeConta({ status: "previsto", anexos: 2 }, { tipo: "despesa", podeGerir: true });
    expect(itens.find((i) => i.id === ACAO_ANEXOS)).toMatchObject({ rotulo: "Anexos (2)" });
  });
});

describe("itensDeLoteContas", () => {
  it("um item só, que segue o verbo da aba", () => {
    expect(ids(itensDeLoteContas("despesa"))).toEqual([ACAO_LOTE_QUITAR]);
    expect(itensDeLoteContas("receita")[0]).toMatchObject({ rotulo: "Receber" });
  });
});
