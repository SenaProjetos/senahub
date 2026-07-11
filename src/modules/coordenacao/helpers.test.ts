import { describe, it, expect } from "vitest";
import { rotuloItemApontamento, proximoNumero, enviaveis } from "@/modules/coordenacao/helpers";

describe("rotuloItemApontamento", () => {
  it("formata número e título", () => {
    expect(rotuloItemApontamento({ numero: 3, titulo: "Viga cruza duto" })).toBe(
      "#3 — Viga cruza duto",
    );
  });
});

describe("proximoNumero", () => {
  it("retorna 1 para lista vazia", () => {
    expect(proximoNumero([])).toBe(1);
  });
  it("retorna maior + 1", () => {
    expect(proximoNumero([1, 5, 3])).toBe(6);
  });
});

describe("enviaveis", () => {
  it("filtra só abertos sem tarefa", () => {
    const itens = [
      { status: "aberta", tarefaId: null },
      { status: "aberta", tarefaId: "t1" },
      { status: "resolvida", tarefaId: null },
      { status: "aberta", tarefaId: null },
    ];
    expect(enviaveis(itens)).toHaveLength(2);
  });
});
