import { describe, expect, it } from "vitest";
import { ErroParcelamento, descricaoParcela, gerarParcelas } from "./parcelamento";

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const soma = (ps: { valor: number }[]) => Math.round(ps.reduce((s, p) => s + p.valor, 0) * 100) / 100;

describe("gerarParcelas", () => {
  it("divisão exata", () => {
    const ps = gerarParcelas(12345, 3, dia("2026-09-10"));
    expect(ps.map((p) => p.valor)).toEqual([4115, 4115, 4115]);
    expect(soma(ps)).toBe(12345);
  });

  it("divisão inexata: o resíduo vai na PRIMEIRA parcela e a soma fecha", () => {
    // 10000/3 = 3333,333… Arredondar cada uma daria 9999,99 — um centavo somindo do contrato.
    const ps = gerarParcelas(10000, 3, dia("2026-09-10"));
    expect(ps.map((p) => p.valor)).toEqual([3333.34, 3333.33, 3333.33]);
    expect(soma(ps)).toBe(10000);
  });

  it("a soma fecha para qualquer valor e qualquer número de parcelas", () => {
    // É a propriedade que justifica o módulo existir; vale a pena varrer em vez de um caso só.
    for (const valor of [0.03, 1, 99.99, 1234.56, 10000, 48000, 7777.77]) {
      for (const n of [1, 2, 3, 4, 5, 6, 7, 12, 24]) {
        if (Math.round(valor * 100) < n) continue;
        const ps = gerarParcelas(valor, n, dia("2026-01-31"));
        expect(soma(ps), `valor=${valor} n=${n}`).toBe(valor);
        expect(ps).toHaveLength(n);
      }
    }
  });

  it("uma parcela é o valor inteiro", () => {
    expect(gerarParcelas(4999.99, 1, dia("2026-09-10"))[0]!.valor).toBe(4999.99);
  });

  it("vencimentos são mensais a partir do primeiro", () => {
    const ps = gerarParcelas(300, 3, dia("2026-09-10"));
    expect(ps.map((p) => p.vencimento)).toEqual([dia("2026-09-10"), dia("2026-10-10"), dia("2026-11-10")]);
  });

  it("preserva o fim de mês em vez de transbordar", () => {
    // 31/01 + 1 mês tem que ser 28/02, não 01/03. Este teste PEGOU um bug real: usar `addMonths`
    // do date-fns aqui produzia 01/03, porque ele soma em hora local e `primeiroVencimento` é
    // `@db.Date` (meia-noite UTC) — em UTC-3 a conta atravessa o mês. Ver `somarMesesUtc`.
    const ps = gerarParcelas(300, 3, dia("2026-01-31"));
    expect(ps.map((p) => p.vencimento)).toEqual([dia("2026-01-31"), dia("2026-02-28"), dia("2026-03-31")]);
  });

  it("todo vencimento cai à meia-noite UTC, como o campo `@db.Date` exige", () => {
    // Se algum passo escorregar para hora local, isto deixa de ser 0 e a data grava um dia antes.
    for (const p of gerarParcelas(300, 6, dia("2026-01-31"))) {
      expect(p.vencimento.getUTCHours()).toBe(0);
      expect(p.vencimento.getUTCMinutes()).toBe(0);
    }
  });

  it("atravessa a virada de ano", () => {
    const ps = gerarParcelas(200, 2, dia("2026-12-15"));
    expect(ps[1]!.vencimento).toEqual(dia("2027-01-15"));
  });

  it("numera 1-based para exibir '1/3'", () => {
    expect(gerarParcelas(300, 3, dia("2026-09-10")).map((p) => p.numero)).toEqual([1, 2, 3]);
  });

  it("recusa entrada inválida com mensagem de negócio", () => {
    expect(() => gerarParcelas(1000, 0, dia("2026-09-10"))).toThrow(ErroParcelamento);
    expect(() => gerarParcelas(1000, -1, dia("2026-09-10"))).toThrow(ErroParcelamento);
    expect(() => gerarParcelas(1000, 2.5, dia("2026-09-10"))).toThrow(ErroParcelamento);
    expect(() => gerarParcelas(0, 3, dia("2026-09-10"))).toThrow(ErroParcelamento);
  });

  it("recusa parcela que daria zero em vez de emitir cobrança de nada", () => {
    expect(() => gerarParcelas(0.03, 4, dia("2026-09-10"))).toThrow(ErroParcelamento);
  });
});

describe("descricaoParcela", () => {
  it("identifica o contrato e a posição", () => {
    expect(descricaoParcela("Contrato — PR-260001", 2, 5)).toBe("Contrato — PR-260001 — parcela 2/5");
  });
});
