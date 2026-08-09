import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do Prisma antes de importar o módulo sob teste.
const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { permissao: { findMany: (...a: unknown[]) => findMany(...a) } },
}));

import { canRole, invalidatePermissions } from "@/lib/permissions";

describe("permissions.can", () => {
  beforeEach(() => {
    findMany.mockReset();
    invalidatePermissions();
  });

  it("admin tem bypass total sem consultar o banco", async () => {
    expect(await canRole("admin", "qualquer", "coisa")).toBe(true);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("perfil sem registro é negado por padrão", async () => {
    findMany.mockResolvedValue([]);
    expect(await canRole("freelancer", "financeiro", "lancar")).toBe(false);
  });

  it("respeita permitido=true/false da tabela", async () => {
    findMany.mockResolvedValue([
      { recurso: "financeiro", acao: "ver", permitido: true },
      { recurso: "financeiro", acao: "lancar", permitido: false },
    ]);
    expect(await canRole("administrativo", "financeiro", "ver")).toBe(true);
    expect(await canRole("administrativo", "financeiro", "lancar")).toBe(false);
  });

  it("usa cache — não reconsulta o banco no segundo acesso", async () => {
    findMany.mockResolvedValue([{ recurso: "rh", acao: "ver", permitido: true }]);
    await canRole("supervisor", "rh", "ver");
    await canRole("supervisor", "rh", "ver");
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("invalida cache de um perfil", async () => {
    findMany.mockResolvedValue([{ recurso: "rh", acao: "ver", permitido: true }]);
    await canRole("supervisor", "rh", "ver");
    invalidatePermissions("supervisor");
    await canRole("supervisor", "rh", "ver");
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
