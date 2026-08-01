import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  vinculoFindMany: vi.fn(),
  batidaGroupBy: vi.fn(),
  sessaoGroupBy: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: (...a: unknown[]) => mocks.userFindMany(...a) },
    vinculo: { findMany: (...a: unknown[]) => mocks.vinculoFindMany(...a) },
    batida: { groupBy: (...a: unknown[]) => mocks.batidaGroupBy(...a) },
    sessaoTrabalho: { groupBy: (...a: unknown[]) => mocks.sessaoGroupBy(...a) },
  },
}));

import { contextoApuracao } from "./apuracao";

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Usuário mínimo; `vinculos` = quantos vínculos existem (cobrindo o mês ou não). */
function usuario(over: Partial<{ role: string; dataAdmissao: Date | null; vinculos: number }> = {}) {
  return {
    id: "u1",
    role: over.role ?? "clt",
    dataAdmissao: over.dataAdmissao ?? null,
    _count: { vinculos: over.vinculos ?? 1 },
  };
}

beforeEach(() => {
  mocks.userFindMany.mockResolvedValue([usuario()]);
  mocks.vinculoFindMany.mockResolvedValue([]);
  mocks.batidaGroupBy.mockResolvedValue([]);
  mocks.sessaoGroupBy.mockResolvedValue([]);
});

describe("contextoApuracao", () => {
  it("vínculo CLT vigente: controla jornada, piso na data de início", async () => {
    mocks.vinculoFindMany.mockResolvedValue([
      { userId: "u1", contratacao: "clt", dataInicio: dia("2026-06-15"), dataFim: null },
    ]);
    expect(await contextoApuracao("u1", 2026, 6)).toEqual({
      controlaJornada: true,
      piso: "2026-06-15",
      teto: null,
    });
  });

  it("desligamento no meio do mês vira TETO da apuração", async () => {
    mocks.vinculoFindMany.mockResolvedValue([
      { userId: "u1", contratacao: "clt", dataInicio: dia("2025-01-02"), dataFim: dia("2026-06-10") },
    ]);
    const ctx = await contextoApuracao("u1", 2026, 6);
    expect(ctx.teto).toBe("2026-06-10");
    expect(ctx.controlaJornada).toBe(true);
  });

  it("contratação PJ não controla jornada", async () => {
    mocks.vinculoFindMany.mockResolvedValue([
      { userId: "u1", contratacao: "pj", dataInicio: dia("2025-01-02"), dataFim: null },
    ]);
    expect((await contextoApuracao("u1", 2026, 6)).controlaJornada).toBe(false);
  });

  it("autônomo e pró-labore também ficam de fora", async () => {
    for (const contratacao of ["autonomo_rpa", "pro_labore"]) {
      mocks.vinculoFindMany.mockResolvedValue([
        { userId: "u1", contratacao, dataInicio: dia("2025-01-02"), dataFim: null },
      ]);
      expect((await contextoApuracao("u1", 2026, 6)).controlaJornada).toBe(false);
    }
  });

  it("estágio até junho + CLT a partir de julho: junho usa o vínculo de ESTÁGIO", async () => {
    // O bug que `vinculoAtivo` causaria: em junho ele apontaria para o vínculo
    // CLT iniciado em julho, zerando o esperado de um mês efetivamente trabalhado.
    mocks.vinculoFindMany.mockResolvedValue([
      { userId: "u1", contratacao: "estagio", dataInicio: dia("2026-01-05"), dataFim: dia("2026-06-30") },
    ]);
    const ctx = await contextoApuracao("u1", 2026, 6);
    expect(ctx.controlaJornada).toBe(true);
    expect(ctx.teto).toBe("2026-06-30");
  });

  it("tem vínculos, mas nenhum cobre o mês → sem jornada a apurar", async () => {
    // Vínculo começa em jul/2026; jun/2026 não pode gerar falta nenhuma.
    mocks.userFindMany.mockResolvedValue([usuario({ vinculos: 1 })]);
    mocks.vinculoFindMany.mockResolvedValue([]);
    expect(await contextoApuracao("u1", 2026, 6)).toEqual({
      controlaJornada: false,
      piso: null,
      teto: null,
    });
  });

  it("piso é o MAIOR entre início do vínculo e primeiro registro de ponto", async () => {
    mocks.vinculoFindMany.mockResolvedValue([
      { userId: "u1", contratacao: "clt", dataInicio: dia("2020-03-01"), dataFim: null },
    ]);
    mocks.batidaGroupBy.mockResolvedValue([{ userId: "u1", _min: { dia: dia("2026-07-04") } }]);
    expect((await contextoApuracao("u1", 2026, 7)).piso).toBe("2026-07-04");
  });

  it("sessão legada anterior à primeira batida vira o primeiro registro", async () => {
    mocks.vinculoFindMany.mockResolvedValue([
      { userId: "u1", contratacao: "clt", dataInicio: dia("2020-03-01"), dataFim: null },
    ]);
    mocks.batidaGroupBy.mockResolvedValue([{ userId: "u1", _min: { dia: dia("2026-07-04") } }]);
    mocks.sessaoGroupBy.mockResolvedValue([
      { userId: "u1", _min: { inicio: new Date("2026-02-10T12:00:00.000Z") } },
    ]);
    expect((await contextoApuracao("u1", 2026, 7)).piso).toBe("2026-02-10");
  });

  describe("usuário sem vínculo cadastrado (backfill não rodado)", () => {
    it("cai no role antigo e usa dataAdmissao como piso", async () => {
      mocks.userFindMany.mockResolvedValue([
        usuario({ role: "clt", vinculos: 0, dataAdmissao: dia("2026-06-15") }),
      ]);
      expect(await contextoApuracao("u1", 2026, 6)).toEqual({
        controlaJornada: true,
        piso: "2026-06-15",
        teto: null,
      });
    });

    it("role fora de CLT/estagiário não controla jornada", async () => {
      mocks.userFindMany.mockResolvedValue([usuario({ role: "projetista_pj", vinculos: 0 })]);
      expect((await contextoApuracao("u1", 2026, 6)).controlaJornada).toBe(false);
    });
  });

  it("usuário inexistente não vira jornada controlada por acidente", async () => {
    mocks.userFindMany.mockResolvedValue([]);
    expect(await contextoApuracao("fantasma", 2026, 6)).toEqual({
      controlaJornada: false,
      piso: null,
      teto: null,
    });
  });
});
