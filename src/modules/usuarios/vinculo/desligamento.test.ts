import { describe, expect, it } from "vitest";
import { acessoBloqueado, diaEncerrado, validarDesligamento } from "./desligamento";

// Coluna `@db.Date` chega do banco como meia-noite UTC.
const dia = (s: string) => new Date(`${s}T00:00:00Z`);
// Instantes LOCAIS (o servidor roda em America/Sao_Paulo; o teste vale em qualquer fuso,
// porque monta o instante pelos componentes locais, como `new Date()` faria).
const local = (a: number, m: number, d: number, h = 12, min = 0) => new Date(a, m - 1, d, h, min);

describe("diaEncerrado", () => {
  it("o próprio dia ainda vale (inclusivo)", () => {
    expect(diaEncerrado(dia("2026-09-21"), local(2026, 9, 21, 0, 1))).toBe(false);
    expect(diaEncerrado(dia("2026-09-21"), local(2026, 9, 21, 23, 59))).toBe(false);
  });

  it("encerra à meia-noite do dia seguinte", () => {
    expect(diaEncerrado(dia("2026-09-21"), local(2026, 9, 22, 0, 0))).toBe(true);
  });

  it("21h no último dia não conta como dia seguinte (armadilha do UTC)", () => {
    expect(diaEncerrado(dia("2026-09-21"), local(2026, 9, 21, 21, 30))).toBe(false);
  });

  it("sem data nunca encerra", () => {
    expect(diaEncerrado(null, local(2030, 1, 1))).toBe(false);
    expect(diaEncerrado(undefined, local(2030, 1, 1))).toBe(false);
  });
});

describe("acessoBloqueado", () => {
  const agora = local(2026, 9, 21);

  it("usuário ativo sem corte agendado entra", () => {
    expect(acessoBloqueado({ ativo: true, acessoAte: null }, agora)).toBe(false);
  });

  it("corte futuro ou de hoje ainda deixa entrar", () => {
    expect(acessoBloqueado({ ativo: true, acessoAte: dia("2026-09-21") }, agora)).toBe(false);
    expect(acessoBloqueado({ ativo: true, acessoAte: dia("2026-10-01") }, agora)).toBe(false);
  });

  it("corte vencido bloqueia mesmo antes da rotina gravar ativo=false", () => {
    expect(acessoBloqueado({ ativo: true, acessoAte: dia("2026-09-20") }, agora)).toBe(true);
  });

  it("desativado é bloqueado, com ou sem data", () => {
    expect(acessoBloqueado({ ativo: false, acessoAte: null }, agora)).toBe(true);
    expect(acessoBloqueado({ ativo: false, acessoAte: dia("2027-01-01") }, agora)).toBe(true);
  });
});

describe("validarDesligamento", () => {
  it("saída no mesmo dia do início é válida", () => {
    expect(validarDesligamento({ dataInicioVinculo: dia("2026-09-01"), dataFim: dia("2026-09-01") })).toBeNull();
  });

  it("saída antes do início do vínculo é recusada", () => {
    expect(validarDesligamento({ dataInicioVinculo: dia("2026-09-01"), dataFim: dia("2026-08-31") })).toMatch(
      /anterior ao início/,
    );
  });
});
