import { describe, expect, it } from "vitest";
import { DIAS_VALIDADE_ACEITE, expiraAceiteEm, linkAceiteEstaAtivo, linkAceitePodeResponder } from "./aceite";

const agora = new Date("2026-08-24T12:00:00.000Z");

describe("ciclo de vida do link de aceite", () => {
  it("emite links com validade de 30 dias", () => {
    expect(expiraAceiteEm(agora).toISOString()).toBe("2026-09-23T12:00:00.000Z");
    expect(DIAS_VALIDADE_ACEITE).toBe(30);
  });

  it("recusa links legados sem validade, expirados e revogados", () => {
    expect(linkAceiteEstaAtivo({ situacao: "pendente", expiraEm: null, revogadoEm: null }, agora)).toBe(false);
    expect(linkAceiteEstaAtivo({ situacao: "pendente", expiraEm: agora, revogadoEm: null }, agora)).toBe(false);
    expect(
      linkAceiteEstaAtivo(
        { situacao: "pendente", expiraEm: new Date("2026-08-25T12:00:00.000Z"), revogadoEm: agora },
        agora,
      ),
    ).toBe(false);
  });

  it("só permite resposta uma vez enquanto o link está ativo", () => {
    const ativo = { situacao: "pendente", expiraEm: new Date("2026-08-25T12:00:00.000Z"), revogadoEm: null };
    expect(linkAceitePodeResponder(ativo, agora)).toBe(true);
    expect(linkAceitePodeResponder({ ...ativo, situacao: "aceito" }, agora)).toBe(false);
  });
});
