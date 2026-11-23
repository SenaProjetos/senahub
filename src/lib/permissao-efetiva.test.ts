import { describe, it, expect, vi, beforeEach } from "vitest";

const permissaoPerfilFindMany = vi.fn();
const permissaoUsuarioFindUnique = vi.fn();
const permissaoUsuarioFindMany = vi.fn();
const userFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    permissaoPerfil: { findMany: (...a: unknown[]) => permissaoPerfilFindMany(...a) },
    permissaoUsuario: {
      findUnique: (...a: unknown[]) => permissaoUsuarioFindUnique(...a),
      findMany: (...a: unknown[]) => permissaoUsuarioFindMany(...a),
    },
  },
}));

import {
  permissaoEfetiva,
  permissoesEfetivas,
  invalidatePerfil,
  type SubjectPermissao,
} from "@/lib/permissao-efetiva";

function subject(over: Partial<SubjectPermissao> = {}): SubjectPermissao {
  return { id: "u1", ativo: true, superUsuario: false, perfilId: "perfil-1", tipo: "interno", ...over };
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

/**
 * O carregamento em lote existe para o menu: filtrar 41 itens chamando `permissaoEfetiva` item a
 * item seriam 41 consultas por render. Estes testes garantem que o atalho resolve IGUAL ao
 * caminho unitário — um lote que discorda do motor é pior do que N consultas.
 */
describe("permissoesEfetivas em lote", () => {
  beforeEach(() => {
    permissaoPerfilFindMany.mockReset();
    permissaoUsuarioFindMany.mockReset();
    permissaoUsuarioFindMany.mockResolvedValue([]);
    permissaoPerfilFindMany.mockResolvedValue([]);
    invalidatePerfil();
  });

  it("usuário inativo não recebe nada", async () => {
    expect(await permissoesEfetivas(subject({ ativo: false, superUsuario: true }))).toEqual([]);
  });

  it("superUsuario recebe o catálogo inteiro, sem consultar override", async () => {
    const todas = await permissoesEfetivas(subject({ superUsuario: true, perfilId: null }));
    expect(todas).toContain("financeiro:ver");
    expect(todas).toContain("escopo:global");
    expect(permissaoUsuarioFindMany).not.toHaveBeenCalled();
  });

  it("sem perfil e sem override, não recebe nada", async () => {
    expect(await permissoesEfetivas(subject({ perfilId: null }))).toEqual([]);
  });

  it("soma o perfil e deixa o override vencer, inclusive negando", async () => {
    permissaoPerfilFindMany.mockResolvedValue([
      { recurso: "financeiro", acao: "ver", permitido: true },
      { recurso: "clientes", acao: "ver", permitido: true },
    ]);
    permissaoUsuarioFindMany.mockResolvedValue([
      { recurso: "clientes", acao: "ver", permitido: false, expiraEm: null },
      { recurso: "qualidade", acao: "ver", permitido: true, expiraEm: null },
    ]);
    const r = await permissoesEfetivas(subject());
    expect(r).toContain("financeiro:ver");
    expect(r).toContain("qualidade:ver");
    expect(r).not.toContain("clientes:ver");
  });

  it("ignora override expirado", async () => {
    permissaoUsuarioFindMany.mockResolvedValue([
      { recurso: "qualidade", acao: "ver", permitido: true, expiraEm: new Date(Date.now() - 1000) },
    ]);
    expect(await permissoesEfetivas(subject())).not.toContain("qualidade:ver");
  });

  it("faz UMA leitura de override, não uma por par do catálogo", async () => {
    await permissoesEfetivas(subject());
    expect(permissaoUsuarioFindMany).toHaveBeenCalledTimes(1);
  });
});

describe("trava só interno no Financeiro (decisão do dono, 2026-11-19)", () => {
  beforeEach(() => {
    permissaoPerfilFindMany.mockReset();
    permissaoUsuarioFindUnique.mockReset();
    permissaoUsuarioFindUnique.mockResolvedValue(null);
    permissaoUsuarioFindMany.mockReset();
    permissaoUsuarioFindMany.mockResolvedValue([]);
    userFindUnique.mockReset();
    invalidatePerfil();
    permissaoPerfilFindMany.mockResolvedValue([
      { recurso: "financeiro", acao: "ver", permitido: true },
      { recurso: "financeiro", acao: "extrato", permitido: true },
      { recurso: "clientes", acao: "ver", permitido: true },
    ]);
  });

  it("externo com financeiro:ver no perfil é negado; o extrato e outros recursos seguem", async () => {
    const ext = subject({ tipo: "externo" });
    expect(await permissaoEfetiva(ext, "financeiro", "ver")).toBe(false);
    expect(await permissaoEfetiva(ext, "financeiro", "extrato")).toBe(true);
    expect(await permissaoEfetiva(ext, "clientes", "ver")).toBe(true);
  });

  it("nem override nem superusuário abrem o Financeiro a externo", async () => {
    permissaoUsuarioFindUnique.mockResolvedValue({ permitido: true, expiraEm: null });
    expect(await permissaoEfetiva(subject({ tipo: "externo" }), "financeiro", "gerir")).toBe(false);
    expect(await permissaoEfetiva(subject({ tipo: "externo", superUsuario: true }), "financeiro", "ver")).toBe(false);
    expect(await permissaoEfetiva(subject({ tipo: "externo", superUsuario: true }), "financeiro", "extrato")).toBe(true);
  });

  it("sem tipo no sujeito, lê User.tipo só quando a permissão é de interno; sem linha = externo", async () => {
    userFindUnique.mockResolvedValue({ tipo: "interno" });
    expect(await permissaoEfetiva(subject({ tipo: undefined }), "financeiro", "ver")).toBe(true);
    expect(await permissaoEfetiva(subject({ tipo: undefined }), "clientes", "ver")).toBe(true);
    expect(userFindUnique).toHaveBeenCalledTimes(1);
    userFindUnique.mockResolvedValue({ tipo: "externo" });
    expect(await permissaoEfetiva(subject({ tipo: undefined }), "financeiro", "ver")).toBe(false);
    userFindUnique.mockResolvedValue(null);
    expect(await permissaoEfetiva(subject({ tipo: undefined }), "financeiro", "ver")).toBe(false);
  });

  it("menu: externo perde as chaves do Financeiro, menos o extrato (também como superusuário)", async () => {
    const r = await permissoesEfetivas(subject({ tipo: "externo" }));
    expect(r).not.toContain("financeiro:ver");
    expect(r).toContain("financeiro:extrato");
    expect(r).toContain("clientes:ver");
    const su = await permissoesEfetivas(subject({ tipo: "externo", superUsuario: true }));
    expect(su.filter((c) => c.startsWith("financeiro:"))).toEqual(["financeiro:extrato"]);
    expect(await permissoesEfetivas(subject({ tipo: "interno" }))).toContain("financeiro:ver");
  });
});
