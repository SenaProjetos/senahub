import { describe, it, expect } from "vitest";
import { tarefaBloqueada, escopoTarefa } from "./queries";
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
  it("admin e supervisor não têm filtro (veem todas)", () => {
    expect(escopoTarefa({ id: "u1", role: "admin" })).toEqual({});
    expect(escopoTarefa({ id: "u1", role: "supervisor" })).toEqual({});
  });

  it("demais perfis só veem tarefas onde são responsáveis ou criadores", () => {
    expect(escopoTarefa({ id: "u9", role: "projetista_pj" })).toEqual({
      OR: [{ responsaveis: { some: { userId: "u9" } } }, { criadorId: "u9" }],
    });
  });

  it("clt/estagiário/freelancer/ti também são escopados", () => {
    for (const role of ["clt", "estagiario", "freelancer", "ti"] as const) {
      expect(escopoTarefa({ id: "x", role }).OR).toBeDefined();
    }
  });
});
