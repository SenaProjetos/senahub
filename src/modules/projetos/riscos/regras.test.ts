import { describe, expect, it } from "vitest";
import { nivelRisco, ordenarRiscos } from "./regras";

describe("nivelRisco", () => {
  it("classifica pelo produto probabilidade × impacto", () => {
    expect(nivelRisco(1, 1)).toBe("baixo");
    expect(nivelRisco(1, 2)).toBe("baixo");
    expect(nivelRisco(1, 3)).toBe("medio");
    expect(nivelRisco(2, 2)).toBe("medio");
    expect(nivelRisco(2, 3)).toBe("alto");
    expect(nivelRisco(3, 3)).toBe("alto");
  });
});

describe("ordenarRiscos", () => {
  const r = (id: string, status: string, probabilidade: number, impacto: number) => ({ id, status, probabilidade, impacto });

  it("abertos antes dos mitigados/aceitos, mesmo que estes sejam mais graves", () => {
    const ordem = ordenarRiscos([r("mitigado-grave", "mitigado", 3, 3), r("aberto-leve", "aberto", 1, 1)]);
    expect(ordem.map((x) => x.id)).toEqual(["aberto-leve", "mitigado-grave"]);
  });

  it("dentro do grupo, o mais grave primeiro; empate mantém a ordem recebida", () => {
    const ordem = ordenarRiscos([
      r("a", "aberto", 1, 2),
      r("b", "aberto", 3, 3),
      r("c", "aberto", 2, 1),
      r("d", "aceito", 2, 2),
      r("e", "aceito", 3, 2),
    ]);
    expect(ordem.map((x) => x.id)).toEqual(["b", "a", "c", "e", "d"]);
  });

  it("não altera o array recebido", () => {
    const entrada = [r("a", "aceito", 1, 1), r("b", "aberto", 1, 1)];
    ordenarRiscos(entrada);
    expect(entrada.map((x) => x.id)).toEqual(["a", "b"]);
  });
});
