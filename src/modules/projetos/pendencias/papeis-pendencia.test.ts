import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  can: vi.fn(),
  alheia: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { disciplinaResponsavel: { findMany: mocks.findMany, findFirst: mocks.findFirst } },
}));
vi.mock("@/lib/permissions", () => ({ can: mocks.can, podeAtuarEmDisciplinaAlheia: mocks.alheia }));

import type { SessionUser } from "@/lib/session";
import { papeisPorDisciplina, papeisSobre } from "@/modules/projetos/pendencias/papeis-pendencia";

const user = { id: "u1" } as unknown as SessionUser;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.can.mockResolvedValue(true);
  mocks.alheia.mockResolvedValue(false);
});

describe("papeisPorDisciplina", () => {
  it("lista vazia → mapa vazio, sem consultar nada", async () => {
    const m = await papeisPorDisciplina([], user);
    expect(m.size).toBe(0);
    expect(mocks.alheia).not.toHaveBeenCalled();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("perfil global é responsável de todas e não consulta vínculos", async () => {
    mocks.alheia.mockResolvedValue(true);
    const m = await papeisPorDisciplina(["a", "b"], user);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(m.get("a")).toEqual({ ehValidador: true, ehResponsavel: true, ehGlobal: true });
    expect(m.get("b")).toEqual({ ehValidador: true, ehResponsavel: true, ehGlobal: true });
  });

  it("não global: responsável só onde há vínculo, numa única consulta", async () => {
    mocks.can.mockResolvedValue(false);
    mocks.findMany.mockResolvedValue([{ disciplinaId: "a" }]);
    const m = await papeisPorDisciplina(["a", "b"], user);
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(m.get("a")).toEqual({ ehValidador: false, ehResponsavel: true, ehGlobal: false });
    expect(m.get("b")).toEqual({ ehValidador: false, ehResponsavel: false, ehGlobal: false });
  });

  it("ids repetidos viram uma entrada e uma só ocorrência na consulta", async () => {
    mocks.findMany.mockResolvedValue([]);
    const m = await papeisPorDisciplina(["a", "a", "b"], user);
    expect(m.size).toBe(2);
    expect(mocks.findMany.mock.calls[0][0].where.disciplinaId.in).toEqual(["a", "b"]);
  });

  it("dá o mesmo resultado que papeisSobre para cada disciplina", async () => {
    mocks.findMany.mockResolvedValue([{ disciplinaId: "a" }]);
    mocks.findFirst.mockImplementation(({ where }: { where: { disciplinaId: string } }) =>
      Promise.resolve(where.disciplinaId === "a" ? { id: "x" } : null),
    );
    const m = await papeisPorDisciplina(["a", "b"], user);
    expect(m.get("a")).toEqual(await papeisSobre({ disciplinaId: "a" }, user));
    expect(m.get("b")).toEqual(await papeisSobre({ disciplinaId: "b" }, user));
  });

  it("equivalência também para perfil global sem uploads:validar", async () => {
    mocks.alheia.mockResolvedValue(true);
    mocks.can.mockResolvedValue(false);
    mocks.findFirst.mockResolvedValue(null);
    const m = await papeisPorDisciplina(["a", "b"], user);
    expect(m.get("a")).toEqual({ ehValidador: false, ehResponsavel: true, ehGlobal: true });
    expect(m.get("a")).toEqual(await papeisSobre({ disciplinaId: "a" }, user));
    expect(m.get("b")).toEqual(await papeisSobre({ disciplinaId: "b" }, user));
  });
});
