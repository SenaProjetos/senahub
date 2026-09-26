import { describe, expect, it } from "vitest";
import { criaCiclo } from "./ciclo-dependencias";

const dep = (tarefaId: string, predecessoraId: string) => ({ tarefaId, predecessoraId });

describe("criaCiclo", () => {
  // a → b → c (c depende de b, b depende de a)
  const existentes = [dep("b", "a"), dep("c", "b")];

  it("sem ciclo: uma predecessora nova que não volta à linha", () => {
    expect(criaCiclo(existentes, "d", ["c"])).toBe(false);
    expect(criaCiclo(existentes, "c", ["a"])).toBe(false);
  });

  it("ciclo direto: A depende de B e B já depende de A", () => {
    expect(criaCiclo(existentes, "a", ["b"])).toBe(true);
  });

  it("ciclo indireto por uma cadeia", () => {
    expect(criaCiclo(existentes, "a", ["c"])).toBe(true);
  });

  it("uma linha não depende dela mesma", () => {
    expect(criaCiclo([], "a", ["a"])).toBe(true);
  });

  it("as predecessoras que a linha já tinha são trocadas, não somadas", () => {
    // c dependia de b; ao trocar por a, b deixa de estar na cadeia de c.
    expect(criaCiclo(existentes, "c", ["a"])).toBe(false);
    // …e trocar b→c por c→b (b passa a depender de c, que depende de b) fecha o ciclo.
    expect(criaCiclo(existentes, "b", ["c"])).toBe(true);
  });

  it("com vários vínculos novos, basta um deles fechar o ciclo", () => {
    const base = [dep("y", "x"), dep("w", "z")];
    // z passa a depender de y (livre) e de w — e w já depende de z.
    expect(criaCiclo(base, "z", ["y", "w"])).toBe(true);
    expect(criaCiclo(base, "z", ["y"])).toBe(false);
  });

  it("conjunto vazio nunca cria ciclo", () => {
    expect(criaCiclo(existentes, "a", [])).toBe(false);
  });

  it("grafo com losango (duas rotas até a mesma linha) não confunde a busca", () => {
    const losango = [dep("b", "a"), dep("c", "a"), dep("d", "b"), dep("d", "c")];
    expect(criaCiclo(losango, "e", ["d"])).toBe(false);
    expect(criaCiclo(losango, "a", ["d"])).toBe(true);
  });
});
