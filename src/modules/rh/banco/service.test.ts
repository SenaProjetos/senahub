import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  usuariosComJornadaNoMes: vi.fn(),
  acumuladoAte: vi.fn(),
  espelhoMes: vi.fn(),
  deleteMany: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bancoHorasMensal: {
      deleteMany: (...a: unknown[]) => mocks.deleteMany(...a),
      upsert: (...a: unknown[]) => mocks.upsert(...a),
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

import { fecharBancoDoMes } from "./service";

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
