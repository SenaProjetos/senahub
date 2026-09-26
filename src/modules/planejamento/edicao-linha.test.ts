import { describe, expect, it } from "vitest";
import { regrasDeEdicao } from "./edicao-linha";

const atv = { tipoEap: "atv" as const, duracaoDias: 5, ehResumo: false };

describe("regrasDeEdicao", () => {
  it("atividade grava a duração informada", () => {
    expect(regrasDeEdicao(atv, { marco: false, duracaoDias: 8 })).toEqual({ ok: true, tipoEap: "atv", duracaoDias: 8, virouMarco: false });
  });

  it("sem duração no pedido, mantém a que tinha", () => {
    expect(regrasDeEdicao(atv, { marco: false })).toMatchObject({ ok: true, duracaoDias: 5 });
  });

  it("atividade vira marco com duração 0 (e avisa que virou, para conferir as horas)", () => {
    expect(regrasDeEdicao(atv, { marco: true, duracaoDias: 8 })).toEqual({ ok: true, tipoEap: "mrc", duracaoDias: 0, virouMarco: true });
  });

  it("marco volta a atividade e precisa de duração", () => {
    const marco = { tipoEap: "mrc" as const, duracaoDias: 0, ehResumo: false };
    expect(regrasDeEdicao(marco, { marco: false })).toEqual({ ok: false, motivo: "Informe a duração em dias úteis." });
    expect(regrasDeEdicao(marco, { marco: false, duracaoDias: 3 })).toMatchObject({ ok: true, tipoEap: "atv", duracaoDias: 3 });
    expect(regrasDeEdicao(marco, { marco: true })).toMatchObject({ ok: true, tipoEap: "mrc", virouMarco: false });
  });

  it("disciplina, pacote e resumo mantêm o tipo — o pedido de marco é ignorado", () => {
    for (const tipoEap of ["disc", "pct", "fas", "res"] as const) {
      const r = regrasDeEdicao({ tipoEap, duracaoDias: 10, ehResumo: false }, { marco: true, duracaoDias: 12 });
      expect(r, tipoEap).toEqual({ ok: true, tipoEap, duracaoDias: 12, virouMarco: false });
    }
  });

  it("agrupamento não grava duração (deriva das filhas) e não vira marco", () => {
    const grupo = { tipoEap: "atv" as const, duracaoDias: 1, ehResumo: true };
    expect(regrasDeEdicao(grupo, { marco: false, duracaoDias: 40 })).toEqual({ ok: true, tipoEap: "atv", duracaoDias: undefined, virouMarco: false });
    expect(regrasDeEdicao(grupo, { marco: true })).toEqual({ ok: false, motivo: "Linha com subtarefas não vira marco — ela é um agrupamento." });
  });

  it("duração zero ou negativa em atividade é recusada", () => {
    expect(regrasDeEdicao(atv, { marco: false, duracaoDias: 0 })).toMatchObject({ ok: false });
    expect(regrasDeEdicao({ ...atv, duracaoDias: 0 }, { marco: false })).toMatchObject({ ok: false });
  });
});
