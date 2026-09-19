import { describe, expect, it } from "vitest";

import { podeEditarTarefa, podeMoverTarefa } from "./regras";

const tarefa = { criadorId: "criador", responsaveis: [{ id: "resp" }] };

describe("podeMoverTarefa", () => {
  it("deixa quem criou", () => {
    expect(podeMoverTarefa(tarefa, "criador", false)).toBe(true);
  });

  it("deixa quem é responsável", () => {
    expect(podeMoverTarefa(tarefa, "resp", false)).toBe(true);
  });

  it("deixa quem gere as tarefas de todos, mesmo sem vínculo", () => {
    expect(podeMoverTarefa(tarefa, "estranho", true)).toBe(true);
  });

  it("barra quem não tem vínculo nem a capacidade", () => {
    expect(podeMoverTarefa(tarefa, "estranho", false)).toBe(false);
  });

  it("barra quem não tem vínculo quando a tarefa não tem responsáveis", () => {
    expect(podeMoverTarefa({ criadorId: "criador", responsaveis: [] }, "estranho", false)).toBe(false);
  });
});

describe("podeEditarTarefa", () => {
  it("deixa quem criou", () => {
    expect(podeEditarTarefa(tarefa, "criador", false)).toBe(true);
  });

  it("deixa quem gere as tarefas de todos", () => {
    expect(podeEditarTarefa(tarefa, "estranho", true)).toBe(true);
  });

  // A diferença que justifica as duas funções: mover é mais largo que editar.
  it("barra o responsável — responsável move, mas não edita", () => {
    expect(podeMoverTarefa(tarefa, "resp", false)).toBe(true);
    expect(podeEditarTarefa(tarefa, "resp", false)).toBe(false);
  });
});
