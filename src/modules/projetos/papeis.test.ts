import { describe, expect, it } from "vitest";
import { ehCoordenador, PAPEIS_PROJETO, rotuloPapel } from "./papeis";

describe("papel do membro do projeto (decisão 25)", () => {
  it("lista fixa", () => {
    expect(PAPEIS_PROJETO).toEqual(["coordenador", "projetista", "apoio", "estagiario", "consultor_externo"]);
  });
  it("rótulos em português; nulo ou fora da lista vira 'Sem papel'", () => {
    expect(rotuloPapel("consultor_externo")).toBe("Consultor externo");
    expect(rotuloPapel("estagiario")).toBe("Estagiário");
    expect(rotuloPapel(null)).toBe("Sem papel");
    expect(rotuloPapel("xyz")).toBe("Sem papel");
  });
  it("coordenador = papel no projeto OU perfil de acesso coordenador (decisão 18)", () => {
    expect(ehCoordenador({ papelNoProjeto: "coordenador", perfilChave: null })).toBe(true);
    expect(ehCoordenador({ papelNoProjeto: null, perfilChave: "coordenador" })).toBe(true);
    expect(ehCoordenador({ papelNoProjeto: "projetista", perfilChave: "projetista" })).toBe(false);
    expect(ehCoordenador({ papelNoProjeto: null, perfilChave: null })).toBe(false);
  });
});
