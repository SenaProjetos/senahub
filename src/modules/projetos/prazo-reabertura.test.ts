import { describe, it, expect } from "vitest";
import { deveDeslocarPrazoDoProjeto } from "./prazo-reabertura";

// Datas como o banco devolve: meia-noite UTC.
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("deveDeslocarPrazoDoProjeto", () => {
  it("desloca quando o novo prazo passa do planejado", () => {
    expect(deveDeslocarPrazoDoProjeto(dia("2026-09-10"), dia("2026-09-02"))).toBe(true);
  });

  it("não desloca no mesmo dia do planejado", () => {
    expect(deveDeslocarPrazoDoProjeto(dia("2026-09-02"), dia("2026-09-02"))).toBe(false);
  });

  it("não desloca quando o novo prazo é anterior", () => {
    expect(deveDeslocarPrazoDoProjeto(dia("2026-08-20"), dia("2026-09-02"))).toBe(false);
  });

  it("não inventa prazo para projeto que não tem planejado", () => {
    expect(deveDeslocarPrazoDoProjeto(dia("2026-09-10"), null)).toBe(false);
  });

  it("não desloca sem novo prazo", () => {
    expect(deveDeslocarPrazoDoProjeto(null, dia("2026-09-02"))).toBe(false);
  });

  it("aceita as pontas em string yyyy-mm-dd (vinda do formulário)", () => {
    expect(deveDeslocarPrazoDoProjeto("2026-09-10", dia("2026-09-02"))).toBe(true);
    expect(deveDeslocarPrazoDoProjeto("2026-09-02", dia("2026-09-02"))).toBe(false);
  });
});
