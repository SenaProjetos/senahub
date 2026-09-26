import { describe, expect, it } from "vitest";
import { aplicarExecucao, statusAoDesbloquear, type LinhaParaExecucao } from "./execucao";

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

  it("apagar o término reabre (em andamento); o % não é inventado de volta", () => {
    const r = aplicarExecucao(atv({ status: "con", progresso: 100 }), { inicioReal: "2026-10-01", fimReal: null }, HOJE);
    expect(r).toMatchObject({ ok: true, status: "and", progresso: 100, concluiu: false });
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
