import { describe, it, expect } from "vitest";
import {
  propostaExpirada,
  diasAteVencer,
  dataCivilRecife,
  validadeParaISO,
  isoParaDataValidade,
  TZ_REFERENCIA,
} from "@/modules/comercial/validade";

/**
 * Recife é UTC−3 o ano inteiro (sem horário de verão desde 2019). Logo:
 *   23h do dia 30 em Recife  =  02h do dia 1º em UTC
 * É esse par de instantes que separa o comportamento certo do bug — e é por isso que os
 * literais abaixo são todos em `Z`: descrevem o INSTANTE sem ambiguidade, independente do
 * fuso em que a suíte estiver rodando.
 */
const VALIDADE = "2026-09-30";
const AS_23H_DO_DIA_30_EM_RECIFE = new Date("2026-10-01T02:00:00.000Z");
const AS_00H30_DO_DIA_1_EM_RECIFE = new Date("2026-10-01T03:30:00.000Z");

describe("propostaExpirada — o bug que a F5.6 corrige", () => {
  it("às 23h do dia da validade, em Recife, NÃO está expirada (embora já seja dia seguinte em UTC)", () => {
    // A comparação ingênua (`new Date(validade) < agora`) responderia `true` aqui.
    expect(new Date(VALIDADE) < AS_23H_DO_DIA_30_EM_RECIFE).toBe(true); // o bug, documentado
    expect(propostaExpirada(VALIDADE, AS_23H_DO_DIA_30_EM_RECIFE)).toBe(false); // o correto
  });

  it("passa a expirada quando vira o dia em Recife", () => {
    expect(propostaExpirada(VALIDADE, AS_00H30_DO_DIA_1_EM_RECIFE)).toBe(true);
  });

  it("no meio do dia da validade, não está expirada", () => {
    expect(propostaExpirada(VALIDADE, new Date("2026-09-30T15:00:00.000Z"))).toBe(false);
  });

  it("na virada exata da meia-noite de Recife já conta como expirada", () => {
    // 00:00 do dia 1º em Recife = 03:00Z.
    expect(propostaExpirada(VALIDADE, new Date("2026-10-01T03:00:00.000Z"))).toBe(true);
    // Um minuto antes ainda é dia 30 ali.
    expect(propostaExpirada(VALIDADE, new Date("2026-10-01T02:59:00.000Z"))).toBe(false);
  });

  it("dias antes, não está expirada", () => {
    expect(propostaExpirada(VALIDADE, new Date("2026-09-01T12:00:00.000Z"))).toBe(false);
  });

  it("sem validade, NUNCA expira — o campo é opcional e ausência não é prazo zero", () => {
    expect(propostaExpirada(null, AS_00H30_DO_DIA_1_EM_RECIFE)).toBe(false);
    expect(propostaExpirada(undefined, AS_00H30_DO_DIA_1_EM_RECIFE)).toBe(false);
    expect(propostaExpirada("", AS_00H30_DO_DIA_1_EM_RECIFE)).toBe(false);
  });

  it("aceita a validade como Date vinda do Prisma (@db.Date = meia-noite UTC)", () => {
    const doPrisma = new Date("2026-09-30T00:00:00.000Z");
    expect(propostaExpirada(doPrisma, AS_23H_DO_DIA_30_EM_RECIFE)).toBe(false);
    expect(propostaExpirada(doPrisma, AS_00H30_DO_DIA_1_EM_RECIFE)).toBe(true);
  });
});

describe("dataCivilRecife — separa instante de dia do calendário", () => {
  it("02h UTC ainda é o dia anterior em Recife", () => {
    expect(dataCivilRecife(new Date("2026-10-01T02:00:00.000Z"))).toBe("2026-09-30");
  });

  it("03h UTC já é o dia novo em Recife", () => {
    expect(dataCivilRecife(new Date("2026-10-01T03:00:00.000Z"))).toBe("2026-10-01");
  });

  it("devolve sempre no formato AAAA-MM-DD, com zero à esquerda", () => {
    expect(dataCivilRecife(new Date("2026-01-05T15:00:00.000Z"))).toBe("2026-01-05");
  });

  it("o fuso de referência é America/Recife, não Sao_Paulo (T5)", () => {
    expect(TZ_REFERENCIA).toBe("America/Recife");
  });
});

describe("validadeParaISO — lê @db.Date em UTC, não em local", () => {
  it("Date do Prisma vira o MESMO dia, sem recuar um", () => {
    expect(validadeParaISO(new Date("2026-09-30T00:00:00.000Z"))).toBe("2026-09-30");
  });

  it("string já no formato passa direto", () => {
    expect(validadeParaISO("2026-09-30")).toBe("2026-09-30");
  });

  it("string em outro formato é recusada (null), em vez de virar data errada", () => {
    expect(validadeParaISO("30/09/2026")).toBeNull();
    expect(validadeParaISO("2026-9-3")).toBeNull();
  });

  it("Date inválida vira null", () => {
    expect(validadeParaISO(new Date("banana"))).toBeNull();
  });

  it("null/undefined/vazio viram null", () => {
    expect(validadeParaISO(null)).toBeNull();
    expect(validadeParaISO(undefined)).toBeNull();
    expect(validadeParaISO("")).toBeNull();
  });
});

describe("isoParaDataValidade — grava meia-noite UTC explicitamente", () => {
  it("produz exatamente meia-noite UTC do dia informado", () => {
    expect(isoParaDataValidade("2026-09-30")?.toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });

  it("ida e volta preserva o dia", () => {
    expect(validadeParaISO(isoParaDataValidade("2026-09-30"))).toBe("2026-09-30");
  });

  it("formato inválido devolve null em vez de Invalid Date", () => {
    expect(isoParaDataValidade("30/09/2026")).toBeNull();
    expect(isoParaDataValidade(null)).toBeNull();
  });
});

describe("diasAteVencer — em dias civis de Recife", () => {
  it("vence hoje devolve 0, mesmo às 23h (quando UTC já virou)", () => {
    expect(diasAteVencer(VALIDADE, AS_23H_DO_DIA_30_EM_RECIFE)).toBe(0);
  });

  it("ontem devolve -1", () => {
    expect(diasAteVencer(VALIDADE, AS_00H30_DO_DIA_1_EM_RECIFE)).toBe(-1);
  });

  it("daqui a 7 dias devolve 7", () => {
    expect(diasAteVencer("2026-10-07", new Date("2026-09-30T15:00:00.000Z"))).toBe(7);
  });

  it("sem validade devolve null, não zero", () => {
    expect(diasAteVencer(null, new Date())).toBeNull();
  });

  it("atravessar mês e ano continua correto", () => {
    expect(diasAteVencer("2027-01-01", new Date("2026-12-30T15:00:00.000Z"))).toBe(2);
  });
});
