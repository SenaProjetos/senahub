import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { sanitize } from "@/lib/audit";
import { aplicarExecucao, fotoDaExecucao, registrarExecucaoSchema, statusAoDesbloquear, type LinhaParaExecucao } from "./execucao";

const HOJE = "2026-10-20";
const atv = (extra: Partial<LinhaParaExecucao> = {}): LinhaParaExecucao => ({
  tipoEap: "atv",
  ehResumo: false,
  status: "nin",
  progresso: 30,
  ...extra,
});
const marco = (extra: Partial<LinhaParaExecucao> = {}) => atv({ tipoEap: "mrc", progresso: 0, ...extra });

describe("aplicarExecucao — atividade", () => {
  it("início real: não iniciada passa a em andamento, % intocado", () => {
    expect(aplicarExecucao(atv(), { inicioReal: "2026-10-01", fimReal: null }, HOJE)).toEqual({
      ok: true,
      inicioReal: "2026-10-01",
      fimReal: null,
      status: "and",
      progresso: 30,
      concluiu: false,
    });
  });

  it("término real conclui: status concluída e 100% (o que o verificador cobra)", () => {
    const r = aplicarExecucao(atv({ status: "and" }), { inicioReal: "2026-10-01", fimReal: "2026-10-15" }, HOJE);
    expect(r).toMatchObject({ ok: true, status: "con", progresso: 100, concluiu: true });
  });

  it("apagar o término reabre (em andamento) com o % que a coordenação informa; sem ele, recusa", () => {
    const r = aplicarExecucao(atv({ status: "con", progresso: 100 }), { inicioReal: "2026-10-01", fimReal: null, progresso: 80 }, HOJE);
    expect(r).toMatchObject({ ok: true, status: "and", progresso: 80, concluiu: false });
    expect(aplicarExecucao(atv({ status: "con", progresso: 100 }), { inicioReal: "2026-10-01", fimReal: null }, HOJE)).toEqual({
      ok: false,
      motivo: "Ao reabrir, informe o % concluído (até 99%).",
    });
  });

  it("apagar as duas datas volta a não iniciada", () => {
    expect(aplicarExecucao(atv({ status: "and" }), { inicioReal: null, fimReal: null }, HOJE)).toMatchObject({ status: "nin" });
  });

  it("status de fluxo (em revisão) não é desfeito por informar o início", () => {
    expect(aplicarExecucao(atv({ status: "rev" }), { inicioReal: "2026-10-01", fimReal: null }, HOJE)).toMatchObject({ status: "rev" });
  });

  it("recusas: futuro, término sem início, término antes do início, data inválida", () => {
    expect(aplicarExecucao(atv(), { inicioReal: "2026-10-21", fimReal: null }, HOJE)).toMatchObject({ ok: false, motivo: expect.stringMatching(/futuro/) });
    expect(aplicarExecucao(atv(), { inicioReal: null, fimReal: "2026-10-10" }, HOJE)).toMatchObject({ ok: false, motivo: expect.stringMatching(/início real antes/) });
    expect(aplicarExecucao(atv(), { inicioReal: "2026-10-10", fimReal: "2026-10-09" }, HOJE)).toMatchObject({ ok: false });
    expect(aplicarExecucao(atv(), { inicioReal: "2026-02-30", fimReal: null }, HOJE)).toMatchObject({ ok: false, motivo: "Data inválida." });
  });

  it("bloqueada: registra o início sem sair do bloqueio, mas não conclui", () => {
    expect(aplicarExecucao(atv({ status: "blq" }), { inicioReal: "2026-10-01", fimReal: null }, HOJE)).toMatchObject({ ok: true, status: "blq" });
    expect(aplicarExecucao(atv({ status: "blq" }), { inicioReal: "2026-10-01", fimReal: "2026-10-02" }, HOJE)).toMatchObject({
      ok: false,
      motivo: expect.stringMatching(/Desbloqueie/),
    });
  });

  it("agrupamento e linha encerrada (suspensa/cancelada/arquivada) não recebem datas reais", () => {
    expect(aplicarExecucao(atv({ ehResumo: true }), { inicioReal: "2026-10-01", fimReal: null }, HOJE).ok).toBe(false);
    for (const status of ["sus", "can", "arq"] as const) {
      expect(aplicarExecucao(atv({ status }), { inicioReal: "2026-10-01", fimReal: null }, HOJE).ok).toBe(false);
    }
  });
});

describe("aplicarExecucao — marco", () => {
  it("uma data só: concluir põe início = término, 100% e 'concluiu'", () => {
    expect(aplicarExecucao(marco(), { inicioReal: "2026-09-01", fimReal: "2026-10-18" }, HOJE)).toEqual({
      ok: true,
      inicioReal: "2026-10-18",
      fimReal: "2026-10-18",
      status: "con",
      progresso: 100,
      concluiu: true,
    });
  });

  it("marco já concluído, mudando só a data: não conclui de novo (não re-oferece a fase)", () => {
    expect(aplicarExecucao(marco({ status: "con", progresso: 100 }), { inicioReal: null, fimReal: "2026-10-17" }, HOJE)).toMatchObject({
      status: "con",
      concluiu: false,
    });
  });

  it("desfazer o marco volta a não iniciado e 0%", () => {
    expect(aplicarExecucao(marco({ status: "con", progresso: 100 }), { inicioReal: null, fimReal: null }, HOJE)).toMatchObject({
      status: "nin",
      progresso: 0,
      inicioReal: null,
    });
  });
});

describe("statusAoDesbloquear", () => {
  it("volta ao que as datas reais dizem, não sempre 'em andamento'", () => {
    expect(statusAoDesbloquear({ inicioReal: null, fimReal: null })).toBe("nin");
    expect(statusAoDesbloquear({ inicioReal: "2026-10-01", fimReal: null })).toBe("and");
  });
});

describe("aplicarExecucao — percentual", () => {
  const hoje = "2026-11-01";
  const zero = atv({ progresso: 0 });

  it("% parcial sem datas grava o % e não muda o status", () => {
    expect(aplicarExecucao(zero, { inicioReal: null, fimReal: null, progresso: 40 }, hoje)).toMatchObject({
      ok: true,
      progresso: 40,
      status: "nin",
    });
  });

  it("% parcial com início real deixa em andamento", () => {
    expect(aplicarExecucao(zero, { inicioReal: "2026-10-20", fimReal: null, progresso: 40 }, hoje)).toMatchObject({
      ok: true,
      progresso: 40,
      status: "and",
    });
  });

  it("término real ignora o % digitado", () => {
    expect(aplicarExecucao(zero, { inicioReal: "2026-10-20", fimReal: "2026-10-30", progresso: 40 }, hoje)).toMatchObject({
      ok: true,
      progresso: 100,
      status: "con",
    });
  });

  it("100 sem término real é recusado", () => {
    expect(aplicarExecucao(zero, { inicioReal: null, fimReal: null, progresso: 100 }, hoje)).toEqual({
      ok: false,
      motivo: "Para marcar 100%, informe o término real.",
    });
  });

  it("percentual fora de 0–100 ou fracionado é recusado", () => {
    for (const progresso of [-1, 101, 12.5]) {
      expect(aplicarExecucao(zero, { inicioReal: null, fimReal: null, progresso }, hoje)).toEqual({
        ok: false,
        motivo: "Percentual inválido.",
      });
    }
  });

  it("sem progresso o % fica como estava", () => {
    expect(
      aplicarExecucao(atv({ status: "and", progresso: 40 }), { inicioReal: "2026-10-20", fimReal: null }, hoje),
    ).toMatchObject({ ok: true, progresso: 40, status: "and" });
  });

  it("bloqueada aceita o % sem sair do bloqueio", () => {
    expect(aplicarExecucao(atv({ status: "blq", progresso: 0 }), { inicioReal: null, fimReal: null, progresso: 25 }, hoje)).toMatchObject({
      ok: true,
      progresso: 25,
      status: "blq",
    });
  });

  it("marco não aceita percentual", () => {
    expect(aplicarExecucao(marco(), { inicioReal: null, fimReal: null, progresso: 50 }, hoje)).toEqual({
      ok: false,
      motivo: "Marco não tem percentual: informe a data em que aconteceu.",
    });
  });
});

describe("fotoDaExecucao (o 'antes' da auditoria)", () => {
  it("valor do terceiro e datas reais chegam legíveis depois do sanitize", () => {
    const foto = fotoDaExecucao({
      status: "and",
      progresso: 40,
      inicioReal: new Date("2026-10-20T00:00:00.000Z"),
      fimReal: null,
      custoRealTerceiro: new Prisma.Decimal("1250.50"),
    });
    expect(sanitize(foto)).toEqual({ status: "and", progresso: 40, inicioReal: "2026-10-20", fimReal: null, custoRealTerceiro: 1250.5 });
  });
});

describe("registrarExecucaoSchema", () => {
  const base = { id: "l1", inicioReal: null, fimReal: null };
  const msg = (x: unknown) => {
    const r = registrarExecucaoSchema.safeParse(x);
    return r.success ? null : r.error.issues[0].message;
  };
  it("valor do terceiro: mensagens em português", () => {
    expect(msg({ ...base, custoRealTerceiro: -1 })).toBe("O valor não pode ser negativo.");
    expect(msg({ ...base, custoRealTerceiro: 10_000_000_000 })).toBe("Valor alto demais.");
    expect(msg({ ...base, custoRealTerceiro: "x" })).toBe("Valor inválido.");
  });
  it("percentual que não é número: mensagem em português", () => {
    expect(msg({ ...base, progresso: "x" })).toBe("Percentual inválido.");
  });
  it("campos novos são opcionais (chamadas antigas continuam valendo)", () => {
    expect(registrarExecucaoSchema.safeParse(base).success).toBe(true);
    expect(registrarExecucaoSchema.safeParse({ ...base, custoRealTerceiro: null }).success).toBe(true);
  });
});
