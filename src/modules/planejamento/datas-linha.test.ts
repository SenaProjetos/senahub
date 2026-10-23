import { describe, expect, it } from "vitest";
import { criarCalendario } from "@/lib/calendario-trabalho";
import { deslocamentoEmDiasUteis, duracaoPeloTermino, lerDataDigitada, moverRestricoes } from "./datas-linha";

const cal = criarCalendario();
const comFeriado = criarCalendario({ feriados: ["2026-10-07"] });
// 2026-10-05 é segunda; 10/10 sábado; 10/11 domingo; 10/12 segunda.

describe("lerDataDigitada", () => {
  it("aceita dd/mm/aaaa, dd/mm/aa e aaaa-mm-dd", () => {
    expect(lerDataDigitada("05/10/2026", "2026-01-01")).toEqual({ ok: true, dia: "2026-10-05" });
    expect(lerDataDigitada("5/10/26", "2026-01-01")).toEqual({ ok: true, dia: "2026-10-05" });
    expect(lerDataDigitada("2026-10-05", "2026-01-01")).toEqual({ ok: true, dia: "2026-10-05" });
    expect(lerDataDigitada("  05/10/2026  ", "2026-01-01")).toEqual({ ok: true, dia: "2026-10-05" });
  });

  it("dd/mm sem ano vale para o ano de hoje", () => {
    expect(lerDataDigitada("05/10", "2026-03-20")).toEqual({ ok: true, dia: "2026-10-05" });
    expect(lerDataDigitada("05/10", "2027-03-20")).toEqual({ ok: true, dia: "2027-10-05" });
  });

  it("recusa o que não é data de verdade, com a frase", () => {
    for (const ruim of ["", "abc", "31/02/2026", "32/01/2026", "00/10/2026", "05/13/2026", "2026-02-30"]) {
      expect(lerDataDigitada(ruim, "2026-01-01")).toEqual({ ok: false, erro: "Data inválida. Use dd/mm/aaaa." });
    }
  });
});

describe("duracaoPeloTermino", () => {
  it("conta os dias úteis do início ao término, inclusive", () => {
    expect(duracaoPeloTermino({ inicio: "2026-10-05", fim: "2026-10-09", cal })).toEqual({ ok: true, dias: 5 });
    expect(duracaoPeloTermino({ inicio: "2026-10-05", fim: "2026-10-12", cal })).toEqual({ ok: true, dias: 6 });
    expect(duracaoPeloTermino({ inicio: "2026-10-05", fim: "2026-10-05", cal })).toEqual({ ok: true, dias: 1 });
  });

  it("término em fim de semana não conta o sábado nem o domingo", () => {
    expect(duracaoPeloTermino({ inicio: "2026-10-05", fim: "2026-10-10", cal })).toEqual({ ok: true, dias: 5 });
  });

  it("feriado no meio não conta", () => {
    expect(duracaoPeloTermino({ inicio: "2026-10-05", fim: "2026-10-09", cal: comFeriado })).toEqual({ ok: true, dias: 4 });
  });

  it("término muito distante é recusado (a duração do módulo vai até 9999 dias úteis)", () => {
    expect(duracaoPeloTermino({ inicio: "2026-10-05", fim: "2999-01-01", cal })).toEqual({ ok: false, motivo: "Duração grande demais — divida a atividade." });
  });

  it("término antes do início é recusado com a data do início", () => {
    expect(duracaoPeloTermino({ inicio: "2026-10-05", fim: "2026-10-02", cal })).toEqual({
      ok: false,
      motivo: "O término não pode ser antes do início (05/10/2026).",
    });
  });

  it("término sem nenhum dia útil depois do início manda digitar 0 para marco", () => {
    expect(duracaoPeloTermino({ inicio: "2026-10-10", fim: "2026-10-11", cal })).toEqual({
      ok: false,
      motivo: "Esse término não tem dia útil depois do início. Para um marco, digite 0 na duração.",
    });
  });
});

describe("deslocamentoEmDiasUteis", () => {
  it("é o número de dias úteis entre as duas datas, com sinal", () => {
    expect(deslocamentoEmDiasUteis("2026-10-05", "2026-10-12", cal)).toBe(5);
    expect(deslocamentoEmDiasUteis("2026-10-05", "2026-10-05", cal)).toBe(0);
    expect(deslocamentoEmDiasUteis("2026-10-12", "2026-10-05", cal)).toBe(-5);
  });

  it("fim de semana normaliza para o dia útil seguinte; feriado no caminho conta menos", () => {
    expect(deslocamentoEmDiasUteis("2026-10-05", "2026-10-10", cal)).toBe(5);
    expect(deslocamentoEmDiasUteis("2026-10-05", "2026-10-12", comFeriado)).toBe(4);
  });
});

describe("moverRestricoes", () => {
  const linhas = [
    { id: "a", restricaoData: "2026-10-08" },
    { id: "b", restricaoData: null },
    { id: "c", restricaoData: "2026-10-10" }, // sábado
  ];

  it("anda cada data pelos mesmos dias úteis do deslocamento e ignora quem não tem data", () => {
    expect(moverRestricoes(linhas, "2026-10-05", "2026-10-12", cal)).toEqual([
      { id: "a", restricaoData: "2026-10-15" },
      // sábado normaliza para a segunda 12 e anda 5 dias úteis
      { id: "c", restricaoData: "2026-10-19" },
    ]);
  });

  it("para trás também: a mesma conta com sinal negativo", () => {
    expect(moverRestricoes([{ id: "a", restricaoData: "2026-10-15" }], "2026-10-12", "2026-10-05", cal)).toEqual([{ id: "a", restricaoData: "2026-10-08" }]);
  });

  it("deslocamento zero não mexe em nada", () => {
    expect(moverRestricoes(linhas, "2026-10-05", "2026-10-05", cal)).toEqual([]);
    expect(moverRestricoes(linhas, "2026-10-05", "2026-10-06", cal)).toHaveLength(2); // 1 dia útil
  });
});
