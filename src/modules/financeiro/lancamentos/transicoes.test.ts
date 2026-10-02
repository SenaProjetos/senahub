import { describe, expect, it } from "vitest";
import {
  estadoDoLancamento,
  motivoParaNao,
  situacaoDepois,
  MOTIVO_ART,
  MOTIVO_CANCELADO_REABRA,
  MOTIVO_CONCILIADO,
  MOTIVO_EM_APROVACAO,
  MOTIVO_EXCLUIDO,
  MOTIVO_JA_PAGO,
  MOTIVO_PAGO_ESTORNE,
  MOTIVO_PREVISAO_CRONOGRAMA,
  MOTIVO_PROJETISTA,
  MOTIVO_SO_CANCELADO_REABRE,
  MOTIVO_SO_PAGO_ESTORNA,
  type EstadoDoLancamento,
  type Operacao,
} from "@/modules/financeiro/lancamentos/transicoes";

function e(p: Partial<EstadoDoLancamento> = {}): EstadoDoLancamento {
  return { status: "previsto", excluido: false, conciliado: false, distribuido: false, origem: "manual", rejeitado: false, ...p };
}

const TODAS: Operacao[] = ["baixar", "conciliar", "estornar", "cancelar", "reabrir", "excluir", "editar", "aprovar", "rejeitar"];

describe("motivoParaNao — barreiras gerais", () => {
  it("A12: lançamento excluído recusa tudo", () => {
    for (const op of TODAS) expect(motivoParaNao(op, e({ excluido: true }))).toBe(MOTIVO_EXCLUIDO);
  });
  it("previsão do cronograma não muda por aqui", () => {
    for (const op of TODAS) expect(motivoParaNao(op, e({ status: "previsao" }))).toBe(MOTIVO_PREVISAO_CRONOGRAMA);
  });
});

describe("A2: caminhos impossíveis", () => {
  it("cancelado não vira pago (nem por baixa nem por conciliação)", () => {
    expect(motivoParaNao("baixar", e({ status: "cancelado" }))).toBe(MOTIVO_CANCELADO_REABRA);
    expect(motivoParaNao("conciliar", e({ status: "cancelado" }))).toBe(MOTIVO_CANCELADO_REABRA);
  });
  it("despesa em aprovação não é paga nem conciliada", () => {
    expect(motivoParaNao("baixar", e({ status: "aguardando_aprovacao" }))).toBe(MOTIVO_EM_APROVACAO);
    expect(motivoParaNao("conciliar", e({ status: "aguardando_aprovacao" }))).toBe(MOTIVO_EM_APROVACAO);
  });
  it("pago não é cancelado (estorna antes); conciliado nem isso", () => {
    expect(motivoParaNao("cancelar", e({ status: "confirmado" }))).toBe(MOTIVO_PAGO_ESTORNE);
    expect(motivoParaNao("cancelar", e({ status: "confirmado", conciliado: true }))).toBe(MOTIVO_CONCILIADO);
  });
  it("conciliado não é excluído nem estornado", () => {
    expect(motivoParaNao("excluir", e({ status: "confirmado", conciliado: true }))).toBe(MOTIVO_CONCILIADO);
    expect(motivoParaNao("estornar", e({ status: "confirmado", conciliado: true }))).toBe(MOTIVO_CONCILIADO);
  });
  it("já pago não é baixado de novo", () => {
    expect(motivoParaNao("baixar", e({ status: "confirmado" }))).toBe(MOTIVO_JA_PAGO);
  });
  it("já pago pode ser conciliado (G1c), mas não duas vezes", () => {
    expect(motivoParaNao("conciliar", e({ status: "confirmado" }))).toBeNull();
    expect(motivoParaNao("conciliar", e({ status: "confirmado", conciliado: true }))).toContain("outra transação");
  });
});

describe("estorno e reabertura", () => {
  it("estorna só pago, sem conciliação e fora da Produção", () => {
    expect(motivoParaNao("estornar", e({ status: "confirmado" }))).toBeNull();
    expect(motivoParaNao("estornar", e({ status: "previsto" }))).toBe(MOTIVO_SO_PAGO_ESTORNA);
    expect(motivoParaNao("estornar", e({ status: "confirmado", origem: "projetista" }))).toBe(MOTIVO_PROJETISTA);
  });
  it("receita distribuída estorna (a distribuição sai junto), mas não é excluída", () => {
    expect(motivoParaNao("estornar", e({ status: "confirmado", distribuido: true }))).toBeNull();
    expect(motivoParaNao("excluir", e({ status: "confirmado", distribuido: true }))).toContain("estorne antes");
  });
  it("reabre só cancelado; produção e ART pela origem", () => {
    expect(motivoParaNao("reabrir", e({ status: "cancelado" }))).toBeNull();
    expect(motivoParaNao("reabrir", e({ status: "previsto" }))).toBe(MOTIVO_SO_CANCELADO_REABRE);
    expect(motivoParaNao("reabrir", e({ status: "cancelado", origem: "projetista" }))).toBe(MOTIVO_PROJETISTA);
    expect(motivoParaNao("reabrir", e({ status: "cancelado", origem: "art" }))).toBe(MOTIVO_ART);
  });
  it("rejeitada reabre para a aprovação; cancelada comum, para o previsto", () => {
    expect(situacaoDepois("reabrir", e({ status: "cancelado", rejeitado: true }))).toBe("aguardando_aprovacao");
    expect(situacaoDepois("reabrir", e({ status: "cancelado" }))).toBe("previsto");
  });
});

describe("situacaoDepois", () => {
  it("cada operação leva ao seu destino", () => {
    expect(situacaoDepois("baixar", e())).toBe("confirmado");
    expect(situacaoDepois("conciliar", e())).toBe("confirmado");
    expect(situacaoDepois("estornar", e({ status: "confirmado" }))).toBe("previsto");
    expect(situacaoDepois("cancelar", e())).toBe("cancelado");
    expect(situacaoDepois("rejeitar", e({ status: "aguardando_aprovacao" }))).toBe("cancelado");
    expect(situacaoDepois("aprovar", e({ status: "aguardando_aprovacao" }))).toBe("previsto");
    expect(situacaoDepois("editar", e({ status: "confirmado" }))).toBe("confirmado");
  });
});

describe("aprovação", () => {
  it("só o que aguarda", () => {
    expect(motivoParaNao("aprovar", e({ status: "aguardando_aprovacao" }))).toBeNull();
    expect(motivoParaNao("rejeitar", e())).toContain("não está aguardando");
  });
  it("cancelar em aprovação é permitido (quem lançou desiste)", () => {
    expect(motivoParaNao("cancelar", e({ status: "aguardando_aprovacao" }))).toBeNull();
  });
});

describe("estadoDoLancamento", () => {
  const base = { status: "previsto", excluidoEm: null, transacao: null, distribuicao: null, pagamentoProjetistaId: null, ehDeArt: false, motivoRejeicao: null };
  it("lê origem, conciliação, distribuição e rejeição das colunas", () => {
    expect(estadoDoLancamento(base)).toEqual(e());
    expect(estadoDoLancamento({ ...base, pagamentoProjetistaId: "p" }).origem).toBe("projetista");
    expect(estadoDoLancamento({ ...base, ehDeArt: true }).origem).toBe("art");
    expect(estadoDoLancamento({ ...base, status: "previsao" }).origem).toBe("previsao");
    expect(estadoDoLancamento({ ...base, transacao: { id: "t" }, distribuicao: { id: "d" }, motivoRejeicao: "x", excluidoEm: new Date() })).toMatchObject({
      conciliado: true,
      distribuido: true,
      rejeitado: true,
      excluido: true,
    });
  });
});
