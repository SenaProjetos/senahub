import { describe, it, expect } from "vitest";
import { tarefaBloqueada, escopoTarefa, whereQuadroTarefas, concluidaRecenteOuAberta } from "./queries";
import type { TarefaItemBoard } from "./queries";

type Dep = TarefaItemBoard["dependeDe"][number];

function dep(concluido: boolean): Dep {
  return {
    dependeDe: {
      id: "id",
      titulo: "t",
      status: { concluido },
    },
  } as Dep;
}

function tarefa(dependeDe: Dep[] = []): TarefaItemBoard {
  return { dependeDe } as TarefaItemBoard;
}

describe("tarefaBloqueada", () => {
  it("não bloqueada quando não há dependências", () => {
    expect(tarefaBloqueada(tarefa())).toBe(false);
  });

  it("não bloqueada quando todas as dependências estão concluídas", () => {
    expect(tarefaBloqueada(tarefa([dep(true), dep(true)]))).toBe(false);
  });

  it("bloqueada quando pelo menos uma dependência não está concluída", () => {
    expect(tarefaBloqueada(tarefa([dep(true), dep(false)]))).toBe(true);
  });

  it("bloqueada quando a única dependência não está concluída", () => {
    expect(tarefaBloqueada(tarefa([dep(false)]))).toBe(true);
  });
});

describe("escopoTarefa", () => {
  it("quem tem tarefas:gerir_todas não tem filtro (vê todas)", () => {
    expect(escopoTarefa({ id: "u1", gereTodasTarefas: true })).toEqual({});
  });

  it("sem o par, só vê tarefas onde é responsável ou criador — qualquer que seja o papel", () => {
    expect(escopoTarefa({ id: "u9", gereTodasTarefas: false })).toEqual({
      OR: [{ responsaveis: { some: { userId: "u9" } } }, { criadorId: "u9" }],
    });
  });
});

describe("whereQuadroTarefas", () => {
  it("combina filtros de texto, vínculos e responsável com o escopo do usuário", () => {
    expect(
      whereQuadroTarefas(
        { id: "u1", gereTodasTarefas: false },
        { q: "compatibilização", projetoId: "p1", disciplinaId: "d1", responsavelId: "u2", prioridade: "alta" },
        new Date(2026, 7, 25),
      ),
    ).toEqual({
      AND: [
        { arquivada: false, status: { ativo: true } },
        { OR: [{ responsaveis: { some: { userId: "u1" } } }, { criadorId: "u1" }] },
        concluidaRecenteOuAberta(new Date(2026, 7, 25)),
        {
          OR: [
            { titulo: { contains: "compatibilização", mode: "insensitive" } },
            { descricao: { contains: "compatibilização", mode: "insensitive" } },
          ],
        },
        { projetoId: "p1" },
        { disciplinaId: "d1" },
        { responsaveis: { some: { userId: "u2" } } },
        { prioridade: "alta" },
      ],
    });
  });

  it("filtra atrasadas sem incluir tarefas concluídas", () => {
    expect(whereQuadroTarefas({ id: "u1", gereTodasTarefas: true }, { periodo: "atrasadas" }, new Date(2026, 7, 25))).toEqual({
      AND: [
        { arquivada: false, status: { ativo: true } },
        {},
        concluidaRecenteOuAberta(new Date(2026, 7, 25)),
        // Fronteira em meia-noite UTC: `Tarefa.prazo` é `@db.Date`; com meia-noite
        // local a tarefa que vence hoje entraria em "atrasadas".
        { prazo: { lt: new Date(Date.UTC(2026, 7, 25)) }, status: { concluido: false } },
      ],
    });
  });
});

describe("whereQuadroTarefas — todas as concluídas", () => {
  it("o filtro desliga a janela de 7 dias", () => {
    expect(whereQuadroTarefas({ id: "u1", gereTodasTarefas: true }, { todasConcluidas: true }, new Date(2026, 7, 25))).toEqual({
      AND: [{ arquivada: false, status: { ativo: true } }, {}, {}],
    });
  });
});

describe("concluidaRecenteOuAberta", () => {
  it("mantém aberta e concluída nos últimos 7 dias; sem concluidaEm, vale a última alteração", () => {
    const limite = new Date(2026, 7, 18);
    expect(concluidaRecenteOuAberta(new Date(2026, 7, 25))).toEqual({
      OR: [
        { status: { concluido: false } },
        { concluidaEm: { gte: limite } },
        { concluidaEm: null, updatedAt: { gte: limite } },
      ],
    });
  });
});
