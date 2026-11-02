import { describe, expect, it } from "vitest";
import {
  pessoasQuePassam,
  projetosSemCronogramaPorPessoa,
  semanasDaJanela,
  sobrecarregadosNaCargaReal,
  sobrecarregadosNaJanela,
  type PessoaFiltravel,
} from "./recursos-filtros";

const pessoas: PessoaFiltravel[] = [
  { userId: "u1", nome: "João Silva", disciplinas: ["Elétrica"], projetoIds: ["p1", "p2"] },
  { userId: "u2", nome: "Maria Souza", disciplinas: ["Estrutura", "Elétrica"], projetoIds: ["p2"] },
  { userId: "u3", nome: "Ana Lima", disciplinas: [], projetoIds: [] },
];
const livre = { busca: "", projetoId: null, disciplina: null };

describe("pessoasQuePassam", () => {
  it("sem critério passa todo mundo", () => {
    expect([...pessoasQuePassam(pessoas, livre)].sort()).toEqual(["u1", "u2", "u3"]);
  });

  it("busca ignora acento, caixa e espaços sobrando", () => {
    expect([...pessoasQuePassam(pessoas, { ...livre, busca: "  joao " })]).toEqual(["u1"]);
    expect([...pessoasQuePassam(pessoas, { ...livre, busca: "SOUZA" })]).toEqual(["u2"]);
  });

  it("projeto e disciplina combinam por E", () => {
    expect([...pessoasQuePassam(pessoas, { ...livre, projetoId: "p2", disciplina: "Estrutura" })]).toEqual(["u2"]);
    expect([...pessoasQuePassam(pessoas, { ...livre, projetoId: "p2" })].sort()).toEqual(["u1", "u2"]);
  });

  it("disciplina que ninguém tem não passa ninguém", () => {
    expect(pessoasQuePassam(pessoas, { ...livre, disciplina: "Hidráulica" }).size).toBe(0);
  });
});

describe("semanasDaJanela", () => {
  it("devolve as semanas ISO distintas que a janela toca", () => {
    expect(semanasDaJanela("2026-11-02", "2026-11-16")).toEqual(["2026-W45", "2026-W46", "2026-W47"]);
    expect(semanasDaJanela("2026-12-21", "2026-12-28")).toEqual(["2026-W52", "2026-W53"]);
  });

  it("janela invertida ou vazia não tem semanas", () => {
    expect(semanasDaJanela("2026-11-10", "2026-11-01")).toEqual([]);
    expect(semanasDaJanela("", "2026-11-01")).toEqual([]);
  });
});

describe("sobrecarregadosNaJanela", () => {
  const sobrecargas = [
    { userId: "u1", semana: "2026-W45" },
    { userId: "u2", semana: "2026-W50" },
  ];
  it("só conta a sobrecarga de semana dentro da janela", () => {
    expect([...sobrecarregadosNaJanela(sobrecargas, ["2026-W44", "2026-W45"])]).toEqual(["u1"]);
    expect(sobrecarregadosNaJanela(sobrecargas, []).size).toBe(0);
  });
});

describe("sobrecarregadosNaCargaReal", () => {
  const linha = (userId: string, h: number, cap: number) => ({
    userId,
    porSemana: { "2026-W45": h },
    capacidadePorSemana: { "2026-W45": cap },
  });
  it("acima da capacidade entra; igual não; capacidade zero com horas entra", () => {
    const r = sobrecarregadosNaCargaReal([linha("a", 41, 40), linha("b", 40, 40), linha("c", 2, 0), linha("d", 0, 0)]);
    expect([...r].sort()).toEqual(["a", "c"]);
  });
});

describe("projetosSemCronogramaPorPessoa", () => {
  it("não repete projeto para a mesma pessoa e ordena por código", () => {
    const m = projetosSemCronogramaPorPessoa([
      { id: "p2", codigo: "260002", nome: "B", userIds: ["u1", "u1", "u2"] },
      { id: "p1", codigo: "260001", nome: "A", userIds: ["u1"] },
    ]);
    expect(m.get("u1")?.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(m.get("u2")?.map((p) => p.id)).toEqual(["p2"]);
    expect(m.get("u3")).toBeUndefined();
  });
});
