import { describe, expect, it } from "vitest";
import {
  motivoNaoFatura,
  planejarPrevisoes,
  type ContratoParaPrevisao,
  type ParcelaEntregaEstado,
} from "./parcelas-entrega";

const contrato = (extra: Partial<ContratoParaPrevisao> = {}): ContratoParaPrevisao => ({
  titulo: "Contrato X",
  formaCobranca: "por_entrega",
  statusContrato: "assinado",
  valor: 10000,
  assinadoEm: "2026-10-01",
  ...extra,
});

const parcela = (id: string, percentual: number, ordem: number, extra: Partial<ParcelaEntregaEstado> = {}): ParcelaEntregaEstado => ({
  id,
  descricao: `Parcela ${id}`,
  percentual,
  ordem,
  marcoId: `m-${id}`,
  lancamento: null,
  ...extra,
});

const datas = new Map([
  ["m-b", "2026-11-10"],
  ["m-c", "2026-12-15"],
]);

// 30% na assinatura (sem marco), 40% no básico, 30% no executivo.
const plano = () => [parcela("a", 30, 0, { marcoId: null }), parcela("b", 40, 1), parcela("c", 30, 2)];

describe("planejarPrevisoes", () => {
  it("cronograma aprovado: cada parcela com a sua data — a do marco, ou a da assinatura", () => {
    const r = planejarPrevisoes({ contrato: contrato(), cronogramaAprovado: true, parcelas: plano(), dataDoMarco: datas });
    expect(r.motivo).toBeNull();
    expect(r.criar).toEqual([
      { parcelaId: "a", valor: 3000, vencimento: "2026-10-01", descricao: "Contrato X — parcela 1/3 (Parcela a)" },
      { parcelaId: "b", valor: 4000, vencimento: "2026-11-10", descricao: "Contrato X — parcela 2/3 (Parcela b)" },
      { parcelaId: "c", valor: 3000, vencimento: "2026-12-15", descricao: "Contrato X — parcela 3/3 (Parcela c)" },
    ]);
  });

  it("dinheiro no centavo pela regra da proposta: a última absorve", () => {
    const ps = [parcela("b", 33.33, 0), parcela("c", 33.33, 1), parcela("d", 33.34, 2, { marcoId: "m-b" })];
    const r = planejarPrevisoes({ contrato: contrato({ valor: 1000.01 }), cronogramaAprovado: true, parcelas: ps, dataDoMarco: datas });
    expect(r.criar.map((c) => c.valor)).toEqual([333.3, 333.3, 333.41]);
  });

  it("marco andou: atualiza a MESMA linha de previsão", () => {
    const ps = plano();
    ps[1].lancamento = { id: "l-b", status: "previsao", valor: 4000, vencimento: "2026-11-01", descricao: "Contrato X — parcela 2/3 (Parcela b)" };
    const r = planejarPrevisoes({ contrato: contrato(), cronogramaAprovado: true, parcelas: ps, dataDoMarco: datas });
    expect(r.atualizar).toEqual([expect.objectContaining({ lancamentoId: "l-b", vencimento: "2026-11-10" })]);
    expect(r.criar.map((c) => c.parcelaId)).toEqual(["a", "c"]);
  });

  it("parcela já faturada não é tocada, mesmo com o marco andando", () => {
    const ps = plano();
    ps[1].lancamento = { id: "l-b", status: "previsto", valor: 4000, vencimento: "2026-10-01", descricao: "faturada" };
    const r = planejarPrevisoes({ contrato: contrato(), cronogramaAprovado: true, parcelas: ps, dataDoMarco: datas });
    expect(r.atualizar).toEqual([]);
    expect(r.remover).toEqual([]);
    expect(r.criar.map((c) => c.parcelaId)).toEqual(["a", "c"]);
  });

  it("cronograma de volta ao rascunho ou contrato por data: previsões saem, faturadas ficam", () => {
    const ps = plano();
    ps[1].lancamento = { id: "l-b", status: "previsao", valor: 4000, vencimento: "2026-11-10", descricao: "x" };
    ps[2].lancamento = { id: "l-c", status: "confirmado", valor: 3000, vencimento: "2026-12-15", descricao: "y" };
    const rascunho = planejarPrevisoes({ contrato: contrato(), cronogramaAprovado: false, parcelas: ps, dataDoMarco: datas });
    expect(rascunho.remover).toEqual([{ parcelaId: "b", lancamentoId: "l-b" }]);
    expect(rascunho.motivo).toMatch(/rascunho/);
    // A da assinatura não depende do cronograma.
    expect(rascunho.criar.map((c) => c.parcelaId)).toEqual(["a"]);
    const porData = planejarPrevisoes({ contrato: contrato({ formaCobranca: "por_data" }), cronogramaAprovado: true, parcelas: ps, dataDoMarco: datas });
    expect(porData.remover).toEqual([{ parcelaId: "b", lancamentoId: "l-b" }]);
  });

  it("plano que não fecha 100%: nenhuma previsão, e as que havia saem (data velha não fica no caixa)", () => {
    const ps = [parcela("b", 40, 0), parcela("c", 50, 1)];
    ps[0].lancamento = { id: "l-b", status: "previsao", valor: 4000, vencimento: "2026-11-10", descricao: "x" };
    const r = planejarPrevisoes({ contrato: contrato(), cronogramaAprovado: true, parcelas: ps, dataDoMarco: datas });
    expect(r.criar).toEqual([]);
    expect(r.remover).toEqual([{ parcelaId: "b", lancamentoId: "l-b" }]);
    expect(r.motivo).toMatch(/somam 90%/);
  });

  it("contrato não assinado: sem previsão", () => {
    const r = planejarPrevisoes({ contrato: contrato({ statusContrato: "rascunho" }), cronogramaAprovado: true, parcelas: plano(), dataDoMarco: datas });
    expect(r.criar).toEqual([]);
    expect(r.motivo).toMatch(/assinado/);
  });

  it("marco fora do cronograma: a parcela fica sem previsão, e a tela é avisada", () => {
    const ps = [parcela("b", 50, 0), parcela("x", 50, 1)];
    const r = planejarPrevisoes({ contrato: contrato(), cronogramaAprovado: true, parcelas: ps, dataDoMarco: datas });
    expect(r.criar.map((c) => c.parcelaId)).toEqual(["b"]);
    expect(r.motivo).toMatch(/1 parcela/);
  });
});

describe("motivoNaoFatura", () => {
  it("previsão ou nada: pode; já faturada: não", () => {
    expect(motivoNaoFatura({ lancamento: null })).toBeNull();
    expect(motivoNaoFatura({ lancamento: { status: "previsao" } })).toBeNull();
    expect(motivoNaoFatura({ lancamento: { status: "previsto" } })).toMatch(/já foi faturada/);
    expect(motivoNaoFatura({ lancamento: { status: "confirmado" } })).toMatch(/já foi faturada/);
  });
});
