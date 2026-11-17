import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  usuariosComJornadaNoMes: vi.fn(),
  acumuladoAte: vi.fn(),
  espelhoMes: vi.fn(),
  deleteMany: vi.fn(),
  upsert: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bancoHorasMensal: {
      deleteMany: (...a: unknown[]) => mocks.deleteMany(...a),
      upsert: (...a: unknown[]) => mocks.upsert(...a),
      findMany: (...a: unknown[]) => mocks.findMany(...a),
    },
  },
}));
vi.mock("@/modules/ponto/queries", () => ({
  espelhoMes: (...a: unknown[]) => mocks.espelhoMes(...a),
}));
vi.mock("@/modules/rh/banco/queries", () => ({
  usuariosComJornadaNoMes: (...a: unknown[]) => mocks.usuariosComJornadaNoMes(...a),
  acumuladoAte: (...a: unknown[]) => mocks.acumuladoAte(...a),
}));

import { fecharBancoDoMes, recalcularBancoDaPessoa } from "./service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.usuariosComJornadaNoMes.mockResolvedValue([]);
  mocks.acumuladoAte.mockResolvedValue(null);
  mocks.espelhoMes.mockResolvedValue({ saldoMinutos: 0 });
  mocks.deleteMany.mockResolvedValue({ count: 0 });
  mocks.upsert.mockResolvedValue({});
});

describe("fecharBancoDoMes", () => {
  it("apaga o fechamento do mês de quem não tinha vínculo nele", async () => {
    // Contratada em julho: não entra em junho, mas um fechamento antigo gravou -176h.
    mocks.usuariosComJornadaNoMes.mockResolvedValue([{ id: "antiga" }]);

    await fecharBancoDoMes(2026, 6);

    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { ano: 2026, mes: 6, userId: { notIn: ["antiga"] } },
    });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][0].where.userId_ano_mes.userId).toBe("antiga");
  });

  it("mês sem ninguém elegível apaga todas as linhas do mês", async () => {
    await fecharBancoDoMes(2026, 6);

    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { ano: 2026, mes: 6, userId: { notIn: [] } },
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("limpa antes de gravar, e o acumulado parte do fechamento anterior", async () => {
    mocks.usuariosComJornadaNoMes.mockResolvedValue([{ id: "u1" }]);
    mocks.acumuladoAte.mockResolvedValue({ ano: 2026, mes: 6, acumuladoMinutos: -60 });
    mocks.espelhoMes.mockResolvedValue({ saldoMinutos: 140 });

    const n = await fecharBancoDoMes(2026, 7);

    expect(n).toBe(1);
    expect(mocks.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.upsert.mock.invocationCallOrder[0],
    );
    expect(mocks.upsert.mock.calls[0][0].create).toMatchObject({
      saldoMinutos: 140,
      acumuladoMinutos: 80,
    });
  });
});

describe("recalcularBancoDaPessoa", () => {
  it("refaz só os meses já fechados da pessoa, do mês da ausência em diante e em ordem", async () => {
    mocks.findMany.mockResolvedValue([
      { ano: 2026, mes: 10 },
      { ano: 2026, mes: 11 },
    ]);
    mocks.espelhoMes.mockResolvedValue({ saldoMinutos: 30 });

    const n = await recalcularBancoDaPessoa("u1", new Date("2026-10-20T00:00:00Z"));

    expect(n).toBe(2);
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({
      userId: "u1",
      OR: [{ ano: { gt: 2026 } }, { ano: 2026, mes: { gte: 10 } }],
    });
    expect(mocks.findMany.mock.calls[0][0].orderBy).toEqual([{ ano: "asc" }, { mes: "asc" }]);
    // Só a pessoa — nunca apaga linha de ninguém (isso é do fechamento da equipe).
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.upsert.mock.calls.map((c) => c[0].where.userId_ano_mes)).toEqual([
      { userId: "u1", ano: 2026, mes: 10 },
      { userId: "u1", ano: 2026, mes: 11 },
    ]);
  });

  it("nenhum mês fechado no período: não grava nada", async () => {
    mocks.findMany.mockResolvedValue([]);
    expect(await recalcularBancoDaPessoa("u1", new Date("2026-12-01T00:00:00Z"))).toBe(0);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
