import { describe, expect, it } from "vitest";
import {
  MOTIVO_ATA_ANTES_DO_DIA,
  MOTIVO_DIA_PASSADO,
  MOTIVO_JA_TEM_ATA,
  MOTIVO_REUNIAO_CANCELADA,
  MOTIVO_REUNIAO_PASSADA,
  linkValido,
  motivoParaNaoEditar,
  motivoParaNaoImportarAta,
  mudouDiaOuHora,
  situacaoDaReuniao,
  validarReuniao,
  type CamposReuniao,
} from "./reunioes";

const HOJE = "2026-11-23";

const campos = (extra: Partial<CamposReuniao> = {}): CamposReuniao => ({
  titulo: "Reunião de alinhamento",
  dia: "2026-12-12",
  horaInicio: "14:00",
  duracaoMinutos: 60,
  link: "https://meet.google.com/abc-defg-hij",
  local: null,
  pauta: null,
  ...extra,
});

const erroDe = (c: CamposReuniao) => {
  const r = validarReuniao(c, HOJE);
  return r.ok ? null : r.erro;
};

describe("reunião agendada — link", () => {
  it("aceita só https sem credenciais", () => {
    expect(linkValido("https://meet.google.com/abc-defg-hij")).toBe(true);
    for (const ruim of [
      "http://x.com",
      "javascript:alert(1)",
      "data:text/html,x",
      "https://user:pw@x.com",
      "meet.google.com/abc",
      "https://" + "a".repeat(500),
    ]) {
      expect(linkValido(ruim)).toBe(false);
    }
  });
});

describe("reunião agendada — validação", () => {
  it("aceita uma reunião completa e aparece aparada", () => {
    const r = validarReuniao(campos({ titulo: "  Alinhamento  ", local: "  Sala 2 ", pauta: "  " }), HOJE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.titulo).toBe("Alinhamento");
      expect(r.valor.local).toBe("Sala 2");
      expect(r.valor.pauta).toBeNull();
    }
  });

  it("título de 1 a 120 depois do trim", () => {
    expect(erroDe(campos({ titulo: "   " }))).not.toBeNull();
    expect(erroDe(campos({ titulo: "a".repeat(121) }))).not.toBeNull();
    expect(erroDe(campos({ titulo: "a".repeat(120) }))).toBeNull();
  });

  it("hora HH:mm de 00:00 a 23:59", () => {
    for (const ruim of ["24:00", "9:5", "09:60", "9:30", "0930", ""]) {
      expect(erroDe(campos({ horaInicio: ruim }))).not.toBeNull();
    }
    for (const boa of ["00:00", "23:59", "09:05"]) expect(erroDe(campos({ horaInicio: boa }))).toBeNull();
  });

  it("dia real, de hoje em diante", () => {
    expect(erroDe(campos({ dia: "2026-11-22" }))).toBe(MOTIVO_DIA_PASSADO);
    expect(erroDe(campos({ dia: "2026-02-30" }))).not.toBeNull();
    expect(erroDe(campos({ dia: "amanhã" }))).not.toBeNull();
    expect(erroDe(campos({ dia: HOJE }))).toBeNull();
  });

  it("duração de 5 a 600 minutos, ou vazia", () => {
    expect(erroDe(campos({ duracaoMinutos: 4 }))).not.toBeNull();
    expect(erroDe(campos({ duracaoMinutos: 601 }))).not.toBeNull();
    expect(erroDe(campos({ duracaoMinutos: 30.5 }))).not.toBeNull();
    for (const ok of [5, 600, null]) expect(erroDe(campos({ duracaoMinutos: ok }))).toBeNull();
  });

  it("link só https; local até 200; pauta até 1.000", () => {
    expect(erroDe(campos({ link: "http://x.com" }))).not.toBeNull();
    expect(erroDe(campos({ local: "a".repeat(201) }))).not.toBeNull();
    expect(erroDe(campos({ local: "a".repeat(200) }))).toBeNull();
    expect(erroDe(campos({ pauta: "a".repeat(1001) }))).not.toBeNull();
    expect(erroDe(campos({ pauta: "a".repeat(1000) }))).toBeNull();
  });

  it("link vazio vira nulo", () => {
    const r = validarReuniao(campos({ link: "   " }), HOJE);
    expect(r.ok && r.valor.link).toBeNull();
  });
});

describe("reunião agendada — situação e recusas", () => {
  const base = { estado: "agendada" as const, dia: "2026-12-12", diaAnterior: null, horaAnterior: null };

  it("cancelada vence tudo; passada vira realizada; anterior gravado vira remarcada", () => {
    expect(situacaoDaReuniao({ ...base, estado: "cancelada", dia: "2026-11-01" }, HOJE)).toBe("cancelada");
    expect(situacaoDaReuniao({ ...base, dia: "2026-11-22", diaAnterior: "2026-11-10", horaAnterior: "14:00" }, HOJE)).toBe("realizada");
    expect(situacaoDaReuniao({ ...base, diaAnterior: "2026-12-10", horaAnterior: "14:00" }, HOJE)).toBe("remarcada");
    expect(situacaoDaReuniao(base, HOJE)).toBe("agendada");
    expect(situacaoDaReuniao({ ...base, dia: HOJE }, HOJE)).toBe("agendada");
  });

  it("não edita reunião cancelada nem de dia passado", () => {
    expect(motivoParaNaoEditar({ ...base, estado: "cancelada" }, HOJE)).toBe(MOTIVO_REUNIAO_CANCELADA);
    expect(motivoParaNaoEditar({ ...base, dia: "2026-11-22" }, HOJE)).toBe(MOTIVO_REUNIAO_PASSADA);
    expect(motivoParaNaoEditar(base, HOJE)).toBeNull();
    expect(motivoParaNaoEditar({ ...base, dia: HOJE }, HOJE)).toBeNull();
  });

  it("importar ata: só a partir do dia, sem cancelada e sem ata já ligada", () => {
    const r = { ...base, reuniaoId: null as string | null };
    expect(motivoParaNaoImportarAta({ ...r, estado: "cancelada" }, HOJE)).toBe(MOTIVO_REUNIAO_CANCELADA);
    expect(motivoParaNaoImportarAta({ ...r, reuniaoId: "r1", dia: "2026-11-01" }, HOJE)).toBe(MOTIVO_JA_TEM_ATA);
    expect(motivoParaNaoImportarAta(r, HOJE)).toBe(MOTIVO_ATA_ANTES_DO_DIA);
    expect(motivoParaNaoImportarAta({ ...r, dia: HOJE }, HOJE)).toBeNull();
    expect(motivoParaNaoImportarAta({ ...r, dia: "2026-11-01" }, HOJE)).toBeNull();
  });

  it("mudouDiaOuHora olha só dia e hora", () => {
    const a = { dia: "2026-12-12", horaInicio: "14:00" };
    expect(mudouDiaOuHora(a, { ...a })).toBe(false);
    expect(mudouDiaOuHora(a, { ...a, horaInicio: "15:00" })).toBe(true);
    expect(mudouDiaOuHora(a, { ...a, dia: "2026-12-13" })).toBe(true);
  });
});
