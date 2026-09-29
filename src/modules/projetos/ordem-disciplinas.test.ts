import { describe, expect, it } from "vitest";
import { contarPorStatus, filtrarDisciplinas, ordenarDisciplinas, statusDoFiltro } from "./ordem-disciplinas";

const D = (nome: string, status: Parameters<typeof statusDoFiltro>[0] & string, prazo: string | null, responsaveis: string[] = []) => ({
  nome,
  status: status as "aguardando",
  prazo,
  catalogoNome: null,
  responsaveis: responsaveis.map((name) => ({ name })),
});

describe("ordenarDisciplinas", () => {
  it("status na ordem de ação e, dentro de cada um, o prazo mais próximo; sem prazo no fim do grupo", () => {
    const lista = [
      D("Hidro", "aprovado", "2026-09-26"),
      D("Estrutural", "entregue", "2026-10-01"),
      D("Elétrico", "aguardando", "2026-09-21"),
      D("Arquitetura", "em_revisao", "2026-10-05"),
      D("Clima", "em_andamento", "2026-10-15"),
      D("Paisagismo", "em_andamento", null),
      D("Fundações", "em_andamento", "2026-10-12"),
      D("Incêndio", "aguardando", "2026-09-18"),
    ];
    expect(ordenarDisciplinas(lista).map((d) => d.nome)).toEqual([
      "Incêndio",
      "Elétrico",
      "Arquitetura",
      "Fundações",
      "Clima",
      "Paisagismo",
      "Estrutural",
      "Hidro",
    ]);
  });

  it("empate de status e prazo desfaz pelo nome, sem mexer na lista original", () => {
    const lista = [D("B", "aguardando", null), D("A", "aguardando", null)];
    expect(ordenarDisciplinas(lista).map((d) => d.nome)).toEqual(["A", "B"]);
    expect(lista.map((d) => d.nome)).toEqual(["B", "A"]);
  });
});

describe("filtrarDisciplinas", () => {
  const lista = [D("Estrutural", "entregue", null, ["Ana Silva"]), D("Elétrico", "aguardando", null, ["Elis Rocha"])];

  it("por status", () => {
    expect(filtrarDisciplinas(lista, { status: "aguardando", q: "" }).map((d) => d.nome)).toEqual(["Elétrico"]);
  });

  it("por nome ou responsável, sem acento e sem caixa", () => {
    expect(filtrarDisciplinas(lista, { status: null, q: "eletrico" }).map((d) => d.nome)).toEqual(["Elétrico"]);
    expect(filtrarDisciplinas(lista, { status: null, q: "ANA" }).map((d) => d.nome)).toEqual(["Estrutural"]);
  });
});

describe("statusDoFiltro e contarPorStatus", () => {
  it("aceita só status conhecido", () => {
    expect(statusDoFiltro("entregue")).toBe("entregue");
    expect(statusDoFiltro("qualquer")).toBeNull();
    expect(statusDoFiltro(undefined)).toBeNull();
  });

  it("conta cada status, com zero nos que não aparecem", () => {
    expect(contarPorStatus([{ status: "entregue" }, { status: "entregue" }, { status: "aprovado" }])).toEqual({
      aguardando: 0,
      em_revisao: 0,
      em_andamento: 0,
      entregue: 2,
      aprovado: 1,
    });
  });
});
