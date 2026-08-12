import { describe, it, expect } from "vitest";
import { validarAgendamentoAviso, statusAviso } from "./agendamento";

const agora = new Date("2026-08-12T12:00:00.000Z");

describe("validarAgendamentoAviso", () => {
  it("aceita 10 minutos no futuro", () => {
    const r = validarAgendamentoAviso("2026-08-12T12:10:00.000Z", agora);
    expect(r).toEqual({ ok: true, date: new Date("2026-08-12T12:10:00.000Z") });
  });

  it("rejeita data inválida", () => {
    expect(validarAgendamentoAviso("não-é-data", agora)).toEqual({ ok: false, erro: "Data inválida." });
  });

  it("rejeita passado e a janela de menos de 1 minuto", () => {
    expect(validarAgendamentoAviso("2026-08-12T11:00:00.000Z", agora).ok).toBe(false);
    expect(validarAgendamentoAviso("2026-08-12T12:00:30.000Z", agora).ok).toBe(false);
  });

  it("rejeita além de 90 dias", () => {
    expect(validarAgendamentoAviso("2026-12-31T12:00:00.000Z", agora).ok).toBe(false);
  });
});

describe("statusAviso", () => {
  it("enviado quando tem enviadoEm", () => {
    expect(statusAviso({ enviadoEm: agora, canceladoEm: null })).toBe("enviado");
  });
  it("cancelado quando cancelado antes do disparo", () => {
    expect(statusAviso({ enviadoEm: null, canceladoEm: agora })).toBe("cancelado");
  });
  it("agendado quando nada aconteceu ainda", () => {
    expect(statusAviso({ enviadoEm: null, canceladoEm: null })).toBe("agendado");
  });
  it("enviado vence cancelado (corrida perdida pelo cancelamento)", () => {
    expect(statusAviso({ enviadoEm: agora, canceladoEm: agora })).toBe("enviado");
  });
});
