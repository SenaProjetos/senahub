import { describe, it, expect } from "vitest";
import { validarAgendamento } from "./agendamento";

const agora = new Date("2026-07-15T12:00:00.000Z");

describe("validarAgendamento", () => {
  it("aceita 10 minutos no futuro", () => {
    const r = validarAgendamento("2026-07-15T12:10:00.000Z", agora);
    expect(r.ok).toBe(true);
  });

  it("rejeita data inválida", () => {
    const r = validarAgendamento("não-é-data", agora);
    expect(r).toEqual({ ok: false, erro: "Data inválida." });
  });

  it("rejeita passado / muito próximo (< 1 min)", () => {
    expect(validarAgendamento("2026-07-15T11:59:00.000Z", agora).ok).toBe(false);
    expect(validarAgendamento("2026-07-15T12:00:30.000Z", agora).ok).toBe(false);
  });

  it("rejeita além de 90 dias", () => {
    const r = validarAgendamento("2026-11-01T12:00:00.000Z", agora);
    expect(r.ok).toBe(false);
  });
});
