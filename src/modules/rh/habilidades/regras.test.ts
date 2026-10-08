import { describe, expect, it } from "vitest";
import { aptidao, candidatosParaNecessidade, MOTIVO_NAO_VALIDA_PROPRIO, MOTIVO_SEM_NIVEL, motivoParaNaoValidar, nivelValido } from "./regras";

describe("aptidao", () => {
  it("sem nível nunca é apto", () => {
    expect(aptidao({ nivel: null, validadoEm: null }, 1)).toBe("sem_nivel");
    expect(aptidao(null, 1)).toBe("sem_nivel");
  });
  it("abaixo do mínimo", () => {
    expect(aptidao({ nivel: 2, validadoEm: "2026-10-01" }, 3)).toBe("abaixo");
  });
  it("declarado × validado", () => {
    expect(aptidao({ nivel: 3, validadoEm: null }, 3)).toBe("apto_declarado");
    expect(aptidao({ nivel: 4, validadoEm: "2026-10-01" }, 3)).toBe("apto_validado");
  });
});

describe("candidatosParaNecessidade", () => {
  const p = (userId: string, nivel: number | null, validado: boolean, folga: number) => ({
    userId,
    nome: userId,
    nivel,
    validadoEm: validado ? "2026-10-01" : null,
    folga,
    diasAusente: 0,
  });
  it("só aptos COM folga; validado antes de declarado; depois nível e folga", () => {
    const r = candidatosParaNecessidade(
      [p("sem-folga", 5, true, 0), p("declarado", 5, false, 50), p("validado", 3, true, 10), p("abaixo", 2, true, 90), p("sem-nivel", null, false, 90), p("validado-4", 4, true, 5)],
      3,
    );
    expect(r.map((c) => c.userId)).toEqual(["validado-4", "validado", "declarado"]);
  });
});

describe("validar", () => {
  it("ninguém valida o próprio nível; sem nível não valida", () => {
    expect(motivoParaNaoValidar("ana", "ana", 3)).toBe(MOTIVO_NAO_VALIDA_PROPRIO);
    expect(motivoParaNaoValidar("ana", "rh", null)).toBe(MOTIVO_SEM_NIVEL);
    expect(motivoParaNaoValidar("ana", "rh", 3)).toBeNull();
  });
  it("nível 1 a 5, inteiro", () => {
    expect([0, 1, 5, 6, 2.5].map(nivelValido)).toEqual([false, true, true, false, false]);
  });
});
