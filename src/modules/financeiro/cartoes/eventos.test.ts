import { describe, expect, it } from "vitest";
import { agregarFaturas, MOTIVO_DATA_DA_FATURA, type FaturaDoEvento } from "@/modules/financeiro/cartoes/eventos";
import type { EventoCaixa } from "@/modules/financeiro/liquidez/tipos";

const ev = (id: string, valor: number, p: Partial<EventoCaixa> = {}): EventoCaixa => ({
  id,
  origem: "lancamento",
  tipo: "despesa",
  natureza: "resultado",
  valor,
  data: "2026-11-05",
  vencido: false,
  descricao: `compra ${id}`,
  favorecido: null,
  projeto: null,
  categoriaNome: "2.06 Administrativas",
  status: "previsto",
  prioridade: "p3",
  confianca: null,
  caixinhaId: null,
  naoProgramavel: null,
  transferencia: null,
  ...p,
});

const fatura: FaturaDoEvento = { faturaId: "f1", competencia: "2026-10", cartaoNome: "Visa Empresarial", tipoCartao: "empresa", socioNome: null };
const mapa = new Map([["a", fatura], ["b", fatura], ["c", fatura]]);

describe("fatura no planejador", () => {
  it("junta as compras da fatura num evento só, com a soma e a data do vencimento", () => {
    const r = agregarFaturas([ev("a", 1000), ev("b", 2000), ev("c", 3420)], mapa);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("fatura:f1");
    expect(r[0].origem).toBe("fatura");
    expect(r[0].valor).toBe(6420);
    expect(r[0].data).toBe("2026-11-05");
    expect(r[0].descricao).toBe("Fatura Visa Empresarial — outubro/2026");
    expect(r[0].categoriaNome).toBe("3 compras");
  });
  it("a fatura não se reprograma item a item: a data é do cartão", () => {
    expect(agregarFaturas([ev("a", 1000)], mapa)[0].naoProgramavel).toBe(MOTIVO_DATA_DA_FATURA);
  });
  it("a prioridade mais urgente das compras manda", () => {
    const r = agregarFaturas([ev("a", 1000, { prioridade: "p3" }), ev("b", 2000, { prioridade: "p1" })], mapa);
    expect(r[0].prioridade).toBe("p1");
  });
  it("o que não é compra de cartão passa intacto e na ordem", () => {
    const outro = ev("x", 500, { descricao: "aluguel" });
    const r = agregarFaturas([outro, ev("a", 1000), ev("b", 1000)], mapa);
    expect(r.map((e) => e.id)).toEqual(["x", "fatura:f1"]);
  });
  it("compra fora do resultado não se soma à de resultado", () => {
    const r = agregarFaturas([ev("a", 1000), ev("b", 2000, { natureza: "fora_do_resultado" })], mapa);
    expect(r.map((e) => [e.id, e.valor])).toEqual([["fatura:f1", 1000], ["fatura:f1:fora_do_resultado", 2000]]);
  });
  it("no cartão pessoal o evento fala em reembolso ao sócio", () => {
    const p = new Map([["a", { ...fatura, tipoCartao: "pessoal" as const, socioNome: "Lúcio" }]]);
    const r = agregarFaturas([ev("a", 1250)], p);
    expect(r[0].descricao).toBe("Reembolso a Lúcio — outubro/2026");
    expect(r[0].favorecido).toBe("Lúcio");
  });
});
