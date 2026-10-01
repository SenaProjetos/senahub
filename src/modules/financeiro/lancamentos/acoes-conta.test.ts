import { describe, expect, it } from "vitest";

import {
  ACAO_ANEXOS,
  ACAO_COPIAR_DESCRICAO,
  ACAO_DESMARCAR_CONFIRMADA,
  ACAO_EDITAR,
  ACAO_LOTE_MARCAR_CONFIRMADA,
  ACAO_LOTE_QUITAR,
  ACAO_MARCAR_CONFIRMADA,
  ACAO_QUITAR,
  MOTIVO_AGUARDANDO_APROVACAO,
  itensDeConta,
  itensDeLoteContas,
} from "./acoes-conta";

const ids = (itens: { id: string }[]) => itens.map((i) => i.id);

describe("itensDeConta", () => {
  it("quem gere recebe quitar, editar, anexos, prioridade (despesa) e copiar", () => {
    expect(ids(itensDeConta({ status: "previsto", anexos: 0 }, { tipo: "despesa", podeGerir: true }))).toEqual([
      ACAO_QUITAR,
      ACAO_EDITAR,
      ACAO_ANEXOS,
      "sub-prioridade",
      ACAO_COPIAR_DESCRICAO,
    ]);
  });

  it("prioridade: P1–P4 e 'a da categoria', marcando a gravada", () => {
    const sub = itensDeConta({ status: "previsto", anexos: 0, prioridade: null }, { tipo: "despesa", podeGerir: true }).find((i) => i.id === "sub-prioridade");
    expect(sub).toMatchObject({ tipo: "sub" });
    const filhos = (sub as { itens: { id: string; marcado?: boolean }[] }).itens;
    expect(filhos.map((f) => f.id)).toEqual(["prioridade:p1", "prioridade:p2", "prioridade:p3", "prioridade:p4", "prioridade:herdar"]);
    expect(filhos.find((f) => f.marcado)?.id).toBe("prioridade:herdar");
  });

  // D1: a receber nasce Provável; marcar como confirmada pelo cliente não recebe nada.
  it("receita: marcar como confirmada pelo cliente, ou desmarcar se já está", () => {
    expect(ids(itensDeConta({ status: "previsto", anexos: 0, confianca: null }, { tipo: "receita", podeGerir: true }))).toContain(ACAO_MARCAR_CONFIRMADA);
    const ja = ids(itensDeConta({ status: "previsto", anexos: 0, confianca: "confirmada_cliente" }, { tipo: "receita", podeGerir: true }));
    expect(ja).toContain(ACAO_DESMARCAR_CONFIRMADA);
    expect(ja).not.toContain(ACAO_MARCAR_CONFIRMADA);
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

  it("a receber, para quem gere: marcar em massa como confirmada pelo cliente", () => {
    expect(ids(itensDeLoteContas("receita", true))).toEqual([ACAO_LOTE_QUITAR, ACAO_LOTE_MARCAR_CONFIRMADA]);
    expect(ids(itensDeLoteContas("receita", false))).toEqual([ACAO_LOTE_QUITAR]);
    expect(ids(itensDeLoteContas("despesa", true))).toEqual([ACAO_LOTE_QUITAR]);
  });
});
