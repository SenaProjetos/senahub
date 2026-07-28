import { describe, it, expect, vi, beforeEach } from "vitest";

const permissaoPerfilFindMany = vi.fn();
const permissaoUsuarioFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    permissaoPerfil: { findMany: (...a: unknown[]) => permissaoPerfilFindMany(...a) },
    permissaoUsuario: { findUnique: (...a: unknown[]) => permissaoUsuarioFindUnique(...a) },
  },
}));

import { permissaoEfetiva, invalidatePerfil, type SubjectPermissao } from "@/lib/permissao-efetiva";

function subject(over: Partial<SubjectPermissao> = {}): SubjectPermissao {
  return { id: "u1", ativo: true, superUsuario: false, perfilId: "perfil-1", ...over };
}

describe("permissaoEfetiva", () => {
  beforeEach(() => {
    permissaoPerfilFindMany.mockReset();
    permissaoUsuarioFindUnique.mockReset();
    permissaoUsuarioFindUnique.mockResolvedValue(null);
    invalidatePerfil();
  });

  it("usuário inativo é sempre negado, mesmo superUsuario", async () => {
    expect(await permissaoEfetiva(subject({ ativo: false, superUsuario: true }), "financeiro", "ver")).toBe(false);
    expect(permissaoPerfilFindMany).not.toHaveBeenCalled();
    expect(permissaoUsuarioFindUnique).not.toHaveBeenCalled();
  });

  it("superUsuario tem bypass total sem consultar perfil nem override", async () => {
    expect(await permissaoEfetiva(subject({ superUsuario: true }), "qualquer", "coisa")).toBe(true);
    expect(permissaoPerfilFindMany).not.toHaveBeenCalled();
    expect(permissaoUsuarioFindUnique).not.toHaveBeenCalled();
  });

  it("sem perfil e sem override, nega por padrão", async () => {
    expect(await permissaoEfetiva(subject({ perfilId: null }), "financeiro", "ver")).toBe(false);
    expect(permissaoPerfilFindMany).not.toHaveBeenCalled();
  });

  it("usa a permissão do perfil quando não há override", async () => {
    permissaoPerfilFindMany.mockResolvedValue([
      { recurso: "financeiro", acao: "ver", permitido: true },
      { recurso: "financeiro", acao: "gerir", permitido: false },
    ]);
    expect(await permissaoEfetiva(subject(), "financeiro", "ver")).toBe(true);
    expect(await permissaoEfetiva(subject(), "financeiro", "gerir")).toBe(false);
  });

  it("perfil sem linha para o par é negado por padrão", async () => {
    permissaoPerfilFindMany.mockResolvedValue([]);
    expect(await permissaoEfetiva(subject(), "financeiro", "ver")).toBe(false);
  });

  it("override concede o que o perfil nega", async () => {
    permissaoPerfilFindMany.mockResolvedValue([{ recurso: "financeiro", acao: "gerir", permitido: false }]);
    permissaoUsuarioFindUnique.mockResolvedValue({ permitido: true, expiraEm: null });
    expect(await permissaoEfetiva(subject(), "financeiro", "gerir")).toBe(true);
  });

  it("override REVOGA o que o perfil concede — explícito vence, inclusive negando", async () => {
    permissaoPerfilFindMany.mockResolvedValue([{ recurso: "financeiro", acao: "ver", permitido: true }]);
    permissaoUsuarioFindUnique.mockResolvedValue({ permitido: false, expiraEm: null });
    expect(await permissaoEfetiva(subject(), "financeiro", "ver")).toBe(false);
  });

  it("override expirado é ignorado — cai de volta no perfil", async () => {
    permissaoPerfilFindMany.mockResolvedValue([{ recurso: "financeiro", acao: "ver", permitido: false }]);
    permissaoUsuarioFindUnique.mockResolvedValue({
      permitido: true,
      expiraEm: new Date(Date.now() - 1000),
    });
    expect(await permissaoEfetiva(subject(), "financeiro", "ver")).toBe(false);
  });

  it("override sem expiração vale indefinidamente", async () => {
    permissaoPerfilFindMany.mockResolvedValue([]);
    permissaoUsuarioFindUnique.mockResolvedValue({
      permitido: true,
      expiraEm: new Date(Date.now() + 86_400_000),
    });
    expect(await permissaoEfetiva(subject(), "financeiro", "ver")).toBe(true);
  });

  it("cache de perfil evita reconsultar o banco no segundo acesso", async () => {
    permissaoPerfilFindMany.mockResolvedValue([{ recurso: "rh", acao: "ver", permitido: true }]);
    await permissaoEfetiva(subject(), "rh", "ver");
    await permissaoEfetiva(subject(), "rh", "ver");
    expect(permissaoPerfilFindMany).toHaveBeenCalledTimes(1);
  });

  it("invalida o cache de um perfil específico", async () => {
    permissaoPerfilFindMany.mockResolvedValue([{ recurso: "rh", acao: "ver", permitido: true }]);
    await permissaoEfetiva(subject(), "rh", "ver");
    invalidatePerfil("perfil-1");
    await permissaoEfetiva(subject(), "rh", "ver");
    expect(permissaoPerfilFindMany).toHaveBeenCalledTimes(2);
  });

  it("override NUNCA é cacheado — reconsulta a cada chamada", async () => {
    permissaoPerfilFindMany.mockResolvedValue([]);
    permissaoUsuarioFindUnique.mockResolvedValue({ permitido: true, expiraEm: null });
    await permissaoEfetiva(subject(), "financeiro", "ver");
    await permissaoEfetiva(subject(), "financeiro", "ver");
    expect(permissaoUsuarioFindUnique).toHaveBeenCalledTimes(2);
  });

  it("dois perfis distintos não compartilham cache", async () => {
    permissaoPerfilFindMany
      .mockResolvedValueOnce([{ recurso: "rh", acao: "ver", permitido: true }])
      .mockResolvedValueOnce([{ recurso: "rh", acao: "ver", permitido: false }]);
    expect(await permissaoEfetiva(subject({ perfilId: "perfil-A" }), "rh", "ver")).toBe(true);
    expect(await permissaoEfetiva(subject({ perfilId: "perfil-B" }), "rh", "ver")).toBe(false);
  });
});
