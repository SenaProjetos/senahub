import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do Prisma antes de importar o módulo sob teste.
const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { permissao: { findMany: (...a: unknown[]) => findMany(...a) } },
}));

import { can, invalidatePermissions } from "@/lib/permissions";

describe("permissions.can", () => {
  beforeEach(() => {
    findMany.mockReset();
    invalidatePermissions();
  });

  it("admin tem bypass total sem consultar o banco", async () => {
    expect(await can("admin", "qualquer", "coisa")).toBe(true);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("perfil sem registro é negado por padrão", async () => {
    findMany.mockResolvedValue([]);
    expect(await can("freelancer", "financeiro", "lancar")).toBe(false);
  });

  it("respeita permitido=true/false da tabela", async () => {
    findMany.mockResolvedValue([
      { recurso: "financeiro", acao: "ver", permitido: true },
      { recurso: "financeiro", acao: "lancar", permitido: false },
    ]);
    expect(await can("administrativo", "financeiro", "ver")).toBe(true);
    expect(await can("administrativo", "financeiro", "lancar")).toBe(false);
  });

  it("usa cache — não reconsulta o banco no segundo acesso", async () => {
    findMany.mockResolvedValue([{ recurso: "rh", acao: "ver", permitido: true }]);
    await can("supervisor", "rh", "ver");
    await can("supervisor", "rh", "ver");
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("invalida cache de um perfil", async () => {
    findMany.mockResolvedValue([{ recurso: "rh", acao: "ver", permitido: true }]);
    await can("supervisor", "rh", "ver");
    invalidatePermissions("supervisor");
    await can("supervisor", "rh", "ver");
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
