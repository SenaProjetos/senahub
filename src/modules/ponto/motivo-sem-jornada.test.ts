import { describe, expect, it } from "vitest";
import { motivoSemJornada, type EntradaMotivoSemJornada } from "./motivo-sem-jornada";

const base: EntradaMotivoSemJornada = {
  dia: "2026-07-16",
  temBatidas: true,
  controlaJornada: true,
  devidasMin: 0,
  piso: null,
  teto: null,
  feriado: false,
  ferias: false,
  abonoInteiro: false,
  gradeAtiva: true,
};

describe("motivoSemJornada", () => {
  it("dia com horas devidas não tem motivo", () => {
    expect(motivoSemJornada({ ...base, devidasMin: 360, feriado: true })).toBeNull();
  });

  it("dia sem batidas já se explica pelo status", () => {
    expect(motivoSemJornada({ ...base, temBatidas: false, feriado: true })).toBeNull();
  });

  it("sem jornada controlada não há devidas nem extras para explicar", () => {
    expect(motivoSemJornada({ ...base, controlaJornada: false, feriado: true })).toBeNull();
  });

  it("trabalhou antes do início do vínculo", () => {
    expect(motivoSemJornada({ ...base, dia: "2026-07-01", piso: "2026-07-03" })).toBe("antes_vinculo");
  });

  it("trabalhou depois do fim do vínculo", () => {
    expect(motivoSemJornada({ ...base, dia: "2026-07-20", teto: "2026-07-18" })).toBe("depois_vinculo");
  });

  it("feriado", () => {
    expect(motivoSemJornada({ ...base, feriado: true })).toBe("feriado");
  });

  it("férias e abono de dia inteiro", () => {
    expect(motivoSemJornada({ ...base, ferias: true })).toBe("ferias");
    expect(motivoSemJornada({ ...base, abonoInteiro: true })).toBe("abonado");
  });

  it("dia fora da escala", () => {
    expect(motivoSemJornada({ ...base, gradeAtiva: false })).toBe("folga");
  });

  it("vínculo vem antes do feriado (mesma ordem do cálculo do esperado)", () => {
    expect(motivoSemJornada({ ...base, piso: "2026-07-20", feriado: true })).toBe("antes_vinculo");
  });
});
