// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tela do rateio (R3.5): os reais saem NULOS daqui para quem não vê custo (decisão 26), mês fechado lê
 * o congelado e mês fechado no cálculo antigo só acusa alteração por horas.
 */
const mocks = vi.hoisted(() => ({
  fechamentoFindMany: vi.fn(),
  fechamentoFindUnique: vi.fn(),
  rateioGroupBy: vi.fn(),
  rateioFindMany: vi.fn(),
  projetoFindMany: vi.fn(),
  disciplinaFindMany: vi.fn(),
  eventoFindMany: vi.fn(),
  calcular: vi.fn(),
  corte: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fechamentoRateio: { findMany: mocks.fechamentoFindMany, findUnique: mocks.fechamentoFindUnique },
    rateioHora: { groupBy: mocks.rateioGroupBy, findMany: mocks.rateioFindMany },
    projeto: { findMany: mocks.projetoFindMany },
    disciplina: { findMany: mocks.disciplinaFindMany },
    fechamentoRateioEvento: { findMany: mocks.eventoFindMany },
  },
}));
vi.mock("@/modules/rh/rateio/queries", () => ({ calcularRateioDoMes: mocks.calcular, corteCalculoNovo: mocks.corte }));

const { situacaoDosMeses, detalheDoMes } = await import("./queries");

const linha = (minutos: number, custoCent: number) => ({ userId: "u", projetoId: "p1", natureza: "projeto", disciplinaId: null, contratacao: "clt", minutos, custoCent });
const AGORA = new Date("2026-11-10T15:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.corte.mockResolvedValue("2026-10");
  // Outubro fechado no cálculo novo (congelado: 10h, R$ 500); agosto fechado no antigo (10h, R$ 400).
  mocks.fechamentoFindMany.mockResolvedValue([
    { ano: 2026, mes: 10, calculo: "v2", custoTotal: 500, fechadoEm: new Date("2026-11-01T12:00:00Z"), fechadoPor: { name: "RH" } },
    { ano: 2026, mes: 8, calculo: "legado", custoTotal: 400, fechadoEm: new Date("2026-09-01T12:00:00Z"), fechadoPor: null },
  ]);
  mocks.rateioGroupBy.mockResolvedValue([
    { ano: 2026, mes: 10, _sum: { minutos: 600 } },
    { ano: 2026, mes: 8, _sum: { minutos: 600 } },
  ]);
  // Ao vivo: outubro com 1h a mais e R$ 50 a mais; agosto com as MESMAS horas e custo diferente.
  mocks.calcular.mockImplementation(async (ano: number, mes: number) => {
    if (ano === 2026 && mes === 10) return { calculo: "v2", linhas: [linha(660, 55000)], avisos: [] };
    if (ano === 2026 && mes === 8) return { calculo: "legado", linhas: [linha(600, 30000)], avisos: [] };
    return { calculo: "v2", linhas: [linha(60, 7000)], avisos: [] };
  });
});

describe("situacaoDosMeses", () => {
  it("quem vê custo: congelado no fechado, divergência em horas e reais", async () => {
    const meses = await situacaoDosMeses({ podeVerCusto: true, agora: AGORA });
    const out = meses.find((m) => m.ano === 2026 && m.mes === 10)!;
    expect(out).toMatchObject({ fechado: true, calculo: "v2", minutos: 600, custoCent: 50000 });
    expect(out.divergencia).toEqual({ alterado: true, diferencaMin: 60, diferencaCent: 5000 });
    const nov = meses.find((m) => m.ano === 2026 && m.mes === 11)!;
    expect(nov).toMatchObject({ emCurso: true, fechado: false, minutos: 60, custoCent: 7000, divergencia: null });
  });

  it("mês fechado no cálculo antigo: custo refeito hoje não conta como alteração", async () => {
    const meses = await situacaoDosMeses({ podeVerCusto: true, agora: AGORA });
    const ago = meses.find((m) => m.ano === 2026 && m.mes === 8)!;
    expect(ago.divergencia).toEqual({ alterado: false, diferencaMin: 0, diferencaCent: null });
  });

  it("quem não vê custo: nenhum real sai, nem na divergência", async () => {
    const meses = await situacaoDosMeses({ podeVerCusto: false, agora: AGORA });
    expect(meses.length).toBeGreaterThan(0);
    for (const m of meses) {
      expect(m.custoCent).toBeNull();
      expect(m.divergencia?.diferencaCent ?? null).toBeNull();
    }
    expect(meses.find((m) => m.mes === 10 && m.ano === 2026)!.divergencia!.alterado).toBe(true);
  });
});

describe("detalheDoMes", () => {
  beforeEach(() => {
    mocks.fechamentoFindUnique.mockResolvedValue({ id: "f" });
    mocks.rateioFindMany.mockResolvedValue([{ projetoId: "p1", disciplinaId: "d1", natureza: "projeto", minutos: 120, custo: 100 }]);
    mocks.projetoFindMany.mockResolvedValue([{ id: "p1", codigo: "260001", nome: "Casa" }]);
    mocks.disciplinaFindMany.mockResolvedValue([{ id: "d1", disciplinaTextoLegado: "Estrutural", catalogo: null }]);
    mocks.eventoFindMany.mockResolvedValue([
      { tipo: "fechou", motivo: null, calculo: "v2", custoTotal: 100, criadoEm: new Date("2026-11-01T12:00:00Z"), autor: { name: "RH" } },
    ]);
  });

  it("sem permissão de custo: grupos e eventos sem reais", async () => {
    const d = await detalheDoMes(2026, 10, false);
    expect(d.grupos).toEqual([{ projeto: "260001 · Casa", disciplina: "Estrutural", natureza: "projeto", minutos: 120, custoCent: null }]);
    expect(d.eventos[0].custoCent).toBeNull();
  });

  it("com permissão: os reais do congelado", async () => {
    const d = await detalheDoMes(2026, 10, true);
    expect(d.grupos[0].custoCent).toBe(10000);
    expect(d.eventos[0].custoCent).toBe(10000);
  });
});
