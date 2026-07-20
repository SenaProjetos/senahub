import { describe, it, expect } from "vitest";
import { validarInicioFeriasClt } from "./ferias-clt";

// Calendário-base (2026): 06/jul = segunda … 12/jul = domingo.
describe("validarInicioFeriasClt", () => {
  it("bloqueia início no sábado (1 dia antes do domingo)", () => {
    const r = validarInicioFeriasClt("2026-07-11"); // sábado
    expect(r.valido).toBe(false);
    expect(r.motivo).toContain("art. 134");
  });

  it("bloqueia início na sexta (2 dias antes do domingo)", () => {
    const r = validarInicioFeriasClt("2026-07-10"); // sexta
    expect(r.valido).toBe(false);
  });

  it("permite início na segunda", () => {
    expect(validarInicioFeriasClt("2026-07-06").valido).toBe(true); // segunda
  });

  it("permite início na quinta (2 dias antes = sábado, não é RSR/feriado)", () => {
    expect(validarInicioFeriasClt("2026-07-09").valido).toBe(true); // quinta
  });

  it("permite início no próprio domingo (§3 só veda os dois dias ANTES)", () => {
    expect(validarInicioFeriasClt("2026-07-12").valido).toBe(true); // domingo
  });

  it("bloqueia início 2 dias antes de um feriado", () => {
    // Feriado numa quarta (08/jul). Início na segunda (06) → +2 = feriado.
    const feriados = new Set(["2026-07-08"]);
    expect(validarInicioFeriasClt("2026-07-06", feriados).valido).toBe(false);
  });

  it("bloqueia início 1 dia antes de um feriado", () => {
    const feriados = new Set(["2026-07-08"]);
    expect(validarInicioFeriasClt("2026-07-07", feriados).valido).toBe(false); // terça
  });

  it("aceita ISO completo, usando só a data", () => {
    expect(validarInicioFeriasClt("2026-07-06T12:34:56.000Z").valido).toBe(true);
  });
});
