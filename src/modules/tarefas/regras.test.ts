import { describe, expect, it } from "vitest";

import { camposDoCronogramaAlterados, motivoCampoDoCronograma, podeEditarTarefa, podeMoverTarefa } from "./regras";

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

describe("camposDoCronogramaAlterados (card que veio da EAP)", () => {
  const atual = { titulo: "Modelagem", prazo: "2026-10-09", projetoId: "p", disciplinaId: "d", responsaveisIds: ["a", "b"] };

  it("reenviar tudo igual não é mudança — o formulário manda todos os campos sempre", () => {
    expect(camposDoCronogramaAlterados(atual, { ...atual, responsaveisIds: ["b", "a"] })).toEqual([]);
  });

  it("vazio do formulário equivale a nulo", () => {
    const semPrazo = { ...atual, prazo: null, disciplinaId: null };
    expect(camposDoCronogramaAlterados(semPrazo, { ...semPrazo, prazo: "", disciplinaId: "" } as never)).toEqual([]);
  });

  it("aponta cada campo que mudou", () => {
    expect(
      camposDoCronogramaAlterados(atual, { ...atual, titulo: "Outro", prazo: "2026-10-12", responsaveisIds: ["a"] }),
    ).toEqual(["título", "prazo", "responsáveis"]);
  });

  it("a recusa diz o que não pode e onde mudar", () => {
    expect(motivoCampoDoCronograma(["prazo"])).toBe("Este card vem do cronograma: prazo se muda na EAP do projeto, não aqui.");
    expect(motivoCampoDoCronograma(["título", "prazo"])).toContain("título e prazo se mudam");
  });
});
