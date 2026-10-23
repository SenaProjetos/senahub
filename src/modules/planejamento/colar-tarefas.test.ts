import { describe, expect, it } from "vitest";
import { MAX_LINHAS_LOTE } from "./arvore-lote";
import { lerTarefasColadas } from "./colar-tarefas";

describe("lerTarefasColadas", () => {
  it("uma tarefa por linha, sem duração (o servidor usa 1 dia útil)", () => {
    expect(lerTarefasColadas("Levantamento\nProjeto básico")).toEqual({
      ok: true,
      tarefas: [
        { nome: "Levantamento", marco: false, duracaoDias: null },
        { nome: "Projeto básico", marco: false, duracaoDias: null },
      ],
    });
  });

  it("nome e duração separados por tab, como vem do Excel; 0 e 'marco' viram marco", () => {
    expect(lerTarefasColadas("Projeto\t5\nVistoria\t0\nEntrega\tmarco")).toEqual({
      ok: true,
      tarefas: [
        { nome: "Projeto", marco: false, duracaoDias: 5 },
        { nome: "Vistoria", marco: true, duracaoDias: null },
        { nome: "Entrega", marco: true, duracaoDias: null },
      ],
    });
  });

  it("aceita a duração como na célula do cronograma: 5d, 5 dias, meio dia", () => {
    const r = lerTarefasColadas("A\t5d\nB\t3 dias\nC\t2,5");
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.tarefas.map((t) => t.duracaoDias)).toEqual([5, 3, 2.5]);
  });

  it("ignora linha em branco e espaço sobrando (inclusive quebra do Windows)", () => {
    const r = lerTarefasColadas("  A  \r\n\r\n   \r\nB\t 2 \r\n");
    expect(r).toEqual({
      ok: true,
      tarefas: [
        { nome: "A", marco: false, duracaoDias: null },
        { nome: "B", marco: false, duracaoDias: 2 },
      ],
    });
  });

  it("nome vazio aponta a linha (contada no texto colado, em branco incluídas)", () => {
    expect(lerTarefasColadas("A\n\n\t5")).toEqual({ ok: false, erro: "Informe o nome da tarefa.", linha: 3 });
  });

  it("duração inválida aponta a linha com a frase da célula", () => {
    const r = lerTarefasColadas("A\nB\tx");
    expect(r).toMatchObject({ ok: false, linha: 2 });
    expect(!r.ok && r.erro).toBe("Informe a duração em dias úteis, como 5 ou 5d — ou 0 para virar marco.");
  });

  it("texto vazio ou só de espaços não cria nada", () => {
    expect(lerTarefasColadas("")).toEqual({ ok: false, erro: "Cole ao menos uma tarefa.", linha: 0 });
    expect(lerTarefasColadas("  \n \n")).toEqual({ ok: false, erro: "Cole ao menos uma tarefa.", linha: 0 });
  });

  it("recusa acima do teto do lote, apontando a primeira que passou", () => {
    const texto = Array.from({ length: MAX_LINHAS_LOTE + 1 }, (_, i) => `T${i}`).join("\n");
    expect(lerTarefasColadas(texto)).toEqual({ ok: false, erro: `Cole no máximo ${MAX_LINHAS_LOTE} tarefas de uma vez.`, linha: MAX_LINHAS_LOTE + 1 });
    expect(lerTarefasColadas(texto.split("\n").slice(0, MAX_LINHAS_LOTE).join("\n"))).toMatchObject({ ok: true });
  });

  it("nome grande demais é recusado", () => {
    const r = lerTarefasColadas(`${"x".repeat(301)}\t2`);
    expect(r).toMatchObject({ ok: false, linha: 1 });
  });
});
