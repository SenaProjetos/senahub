import { describe, expect, it } from "vitest";
import { estruturaDoDepartamento, pessoasDoCargo, type PessoaCatalogo } from "./estrutura";

const p = (id: string, nome: string, cargoId: string | null, departamentoId: string | null, ativo = true): PessoaCatalogo => ({
  id, nome, ativo, cargoId, departamentoId,
});

const cargos = [
  { id: "coord", nome: "Coordenador" },
  { id: "proj", nome: "Projetista" },
  { id: "est", nome: "Estagiário" },
];

const pessoas = [
  p("1", "Bruna", "proj", "eng"),
  p("2", "Ana", "proj", "eng"),
  p("3", "Carlos", "coord", "eng"),
  p("4", "Davi", null, "eng"),
  p("5", "Elisa", "proj", "adm"),
  p("6", "Fábio", "proj", "eng", false),
  p("7", "Gil", "cargo-arquivado-fora-da-lista", "eng"),
];

describe("pessoasDoCargo", () => {
  it("lista os ativos por nome e só conta os inativos", () => {
    const r = pessoasDoCargo(pessoas, "proj");
    expect(r.ativas.map((x) => x.nome)).toEqual(["Ana", "Bruna", "Elisa"]);
    expect(r.inativas).toBe(1);
  });

  it("cargo sem ninguém", () => {
    expect(pessoasDoCargo(pessoas, "est")).toEqual({ ativas: [], inativas: 0 });
  });
});

describe("estruturaDoDepartamento", () => {
  it("agrupa por cargo na ordem do catálogo, sem cargo por último", () => {
    const r = estruturaDoDepartamento(pessoas, "eng", cargos);
    expect(r.grupos.map((g) => [g.cargo?.nome ?? "Sem cargo", g.pessoas.map((x) => x.nome)])).toEqual([
      ["Coordenador", ["Carlos"]],
      ["Projetista", ["Ana", "Bruna"]],
      ["Sem cargo", ["Davi", "Gil"]],
    ]);
    expect(r.inativas).toBe(1);
  });

  it("não mostra cargo sem ninguém no departamento", () => {
    const r = estruturaDoDepartamento(pessoas, "adm", cargos);
    expect(r.grupos.map((g) => g.cargo?.id)).toEqual(["proj"]);
  });

  it("departamento vazio", () => {
    expect(estruturaDoDepartamento(pessoas, "nada", cargos)).toEqual({ grupos: [], inativas: 0 });
  });
});
