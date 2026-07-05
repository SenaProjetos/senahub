import { describe, expect, it } from "vitest";
import { enviaveis, proximoNumero, rotuloItemPendencia } from "@/modules/projetos/pendencias/helpers";

describe("rotuloItemPendencia", () => {
  it("formata número, página e texto", () => {
    expect(rotuloItemPendencia({ numero: 3, pagina: 2, texto: "Cota ausente" })).toBe(
      "#3 (pág. 2) — Cota ausente",
    );
  });
});

describe("proximoNumero", () => {
  it("começa em 1 quando não há pendências", () => {
    expect(proximoNumero([])).toBe(1);
  });
  it("é max+1, ignorando ordem/lacunas", () => {
    expect(proximoNumero([1, 2, 5])).toBe(6);
    expect(proximoNumero([3, 1, 2])).toBe(4);
  });
});

describe("enviaveis", () => {
  const base = { status: "aberta", tarefaId: null as string | null };
  it("inclui só abertas sem tarefa", () => {
    const lista = [
      { ...base },
      { status: "aberta", tarefaId: "t1" },
      { status: "resolvida", tarefaId: null },
      { status: "fechada", tarefaId: null },
    ];
    expect(enviaveis(lista)).toHaveLength(1);
  });
  it("vazio quando nada é enviável", () => {
    expect(enviaveis([{ status: "fechada", tarefaId: null }])).toHaveLength(0);
  });
});
