import { describe, expect, it } from "vitest";
import { listarParcelasAFaturar, type ContratoParaLista } from "./parcelas-a-faturar";

type Parcela = ContratoParaLista["parcelas"][number];

const parcela = (id: string, o: Partial<Parcela> = {}): Parcela => ({
  id,
  descricao: `parcela ${id}`,
  percentual: 50,
  ordem: 0,
  naAssinatura: false,
  marco: { nome: "Entrega do básico", status: "and" },
  lancamento: null,
  ...o,
});

const contrato = (o: Partial<ContratoParaLista> = {}): ContratoParaLista => ({
  id: "c1",
  titulo: "Contrato Alfa",
  valor: 10000,
  cliente: "Cliente Alfa",
  projeto: { id: "p1", codigo: "260001", nome: "Casa Alfa" },
  parcelas: [parcela("a", { ordem: 0 }), parcela("b", { ordem: 1 })],
  ...o,
});

const previsao = (vencimento: string) => ({ status: "previsao", vencimento, excluidoEm: null });

describe("listarParcelasAFaturar", () => {
  it("traz as parcelas sem linha ou só com previsão, com valor calculado, número e total", () => {
    const r = listarParcelasAFaturar([
      contrato({ parcelas: [parcela("a", { ordem: 0, lancamento: previsao("2026-11-10") }), parcela("b", { ordem: 1 })] }),
    ]);
    expect(r.map((p) => [p.parcelaId, p.numero, p.total, p.valor, p.previsao])).toEqual([
      ["a", 1, 2, 5000, "2026-11-10"],
      ["b", 2, 2, 5000, null],
    ]);
  });

  it("parcela já faturada (previsto, confirmado…) fica de fora; cancelada ou excluída volta", () => {
    const r = listarParcelasAFaturar([
      contrato({
        valor: 4000,
        parcelas: [
          parcela("a", { ordem: 0, percentual: 25, lancamento: { status: "previsto", vencimento: "2026-11-10", excluidoEm: null } }),
          parcela("b", { ordem: 1, percentual: 25, lancamento: { status: "cancelado", vencimento: null, excluidoEm: null } }),
          parcela("c", { ordem: 2, percentual: 25, lancamento: { status: "confirmado", vencimento: null, excluidoEm: null } }),
          parcela("d", { ordem: 3, percentual: 25, lancamento: { status: "previsto", vencimento: null, excluidoEm: "2026-10-01T00:00:00Z" } }),
        ],
      }),
    ]);
    expect(r.map((p) => p.parcelaId).sort()).toEqual(["b", "d"]);
  });

  it("classifica a situação e ordena: marco concluído, assinatura, sem marco, aguardando marco", () => {
    const r = listarParcelasAFaturar([
      contrato({
        parcelas: [
          parcela("aguarda", { ordem: 0, percentual: 25 }),
          parcela("sem", { ordem: 1, percentual: 25, marco: null }),
          parcela("ass", { ordem: 2, percentual: 25, naAssinatura: true, marco: null }),
          parcela("ok", { ordem: 3, percentual: 25, marco: { nome: "Executivo", status: "con" } }),
        ],
      }),
    ]);
    expect(r.map((p) => [p.parcelaId, p.situacao])).toEqual([
      ["ok", "marco_concluido"],
      ["ass", "na_assinatura"],
      ["sem", "sem_marco"],
      ["aguarda", "aguardando_marco"],
    ]);
  });

  it("dentro da mesma situação, a previsão mais próxima vem primeiro; sem previsão por último", () => {
    const r = listarParcelasAFaturar([
      contrato({
        valor: 3000,
        parcelas: [
          parcela("tarde", { ordem: 0, percentual: 33.33, lancamento: previsao("2026-12-01") }),
          parcela("sem", { ordem: 1, percentual: 33.33 }),
          parcela("cedo", { ordem: 2, percentual: 33.34, lancamento: previsao("2026-11-01") }),
        ],
      }),
    ]);
    expect(r.map((p) => p.parcelaId)).toEqual(["cedo", "tarde", "sem"]);
  });

  it("plano que não fecha 100% ou contrato sem valor: valor nulo, com o motivo — nunca zero", () => {
    const naoFecha = listarParcelasAFaturar([
      contrato({ parcelas: [parcela("a", { percentual: 40 }), parcela("b", { ordem: 1, percentual: 40 })] }),
    ]);
    expect(naoFecha.every((p) => p.valor === null && !!p.motivoSemValor)).toBe(true);
    const semValor = listarParcelasAFaturar([contrato({ valor: null })]);
    expect(semValor.every((p) => p.valor === null && p.motivoSemValor === "Contrato sem valor.")).toBe(true);
  });

  it("vários contratos: cada um calcula os seus valores", () => {
    const r = listarParcelasAFaturar([
      contrato({ id: "c1", titulo: "A", valor: 1000, parcelas: [parcela("a1", { percentual: 100 })] }),
      contrato({ id: "c2", titulo: "B", valor: 2000, cliente: "Zeta", parcelas: [parcela("b1", { percentual: 100, marco: { nome: "M", status: "con" } })] }),
    ]);
    expect(r.map((p) => [p.parcelaId, p.valor, p.contratoId])).toEqual([
      ["b1", 2000, "c2"],
      ["a1", 1000, "c1"],
    ]);
  });
});
