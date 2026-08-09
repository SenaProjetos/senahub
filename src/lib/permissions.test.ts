import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do Prisma antes de importar o módulo sob teste. `permissaoPerfil`/`permissaoUsuario`
// entram porque, desde a Onda D, `can()` resolve por `permissaoEfetiva` — não mais pela matriz
// por papel.
const findMany = vi.fn();
const perfilFindMany = vi.fn();
const overrideFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    permissao: { findMany: (...a: unknown[]) => findMany(...a) },
    permissaoPerfil: { findMany: (...a: unknown[]) => perfilFindMany(...a) },
    permissaoUsuario: { findUnique: (...a: unknown[]) => overrideFindUnique(...a) },
  },
}));

import { can, canRole, invalidatePermissions, type SubjectAutorizacao } from "@/lib/permissions";
import { invalidatePerfil } from "@/lib/permissao-efetiva";

const sujeito = (over: Partial<SubjectAutorizacao> = {}): SubjectAutorizacao => ({
  id: "u1",
  role: "clt",
  ativo: true,
  superUsuario: false,
  perfilId: "perfil-1",
  ...over,
});

describe("canRole — matriz legada por papel", () => {
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

/**
 * O corte da Onda D. Estes testes existem porque as três diferenças abaixo são exatamente as que
 * derrubariam o escritório inteiro se estivessem erradas — e nenhuma delas era exercitada pela
 * suíte enquanto `can()` só delegava para a matriz por papel.
 */
describe("can — resolve pelo motor de Perfil de acesso", () => {
  beforeEach(() => {
    findMany.mockReset();
    perfilFindMany.mockReset();
    overrideFindUnique.mockReset();
    overrideFindUnique.mockResolvedValue(null);
    perfilFindMany.mockResolvedValue([]);
    invalidatePermissions();
    invalidatePerfil();
  });

  it("NÃO usa mais a matriz por papel — `role: admin` sozinho não concede nada", async () => {
    // O bypass passou a ser `superUsuario`. Um admin sem a marca perde tudo: é a razão de o
    // backfill ter que rodar antes deste código chegar numa base.
    expect(await can(sujeito({ role: "admin", superUsuario: false, perfilId: null }), "rh", "folha")).toBe(false);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("superUsuario passa em tudo", async () => {
    expect(await can(sujeito({ superUsuario: true, perfilId: null }), "qualquer", "coisa")).toBe(true);
  });

  it("usuário inativo é negado mesmo sendo superUsuario", async () => {
    expect(await can(sujeito({ ativo: false, superUsuario: true }), "rh", "ver")).toBe(false);
  });

  it("sem perfil, nega por padrão", async () => {
    expect(await can(sujeito({ perfilId: null }), "rh", "ver")).toBe(false);
  });

  it("concede o que a matriz do perfil concede", async () => {
    perfilFindMany.mockResolvedValue([{ recurso: "rh", acao: "ver", permitido: true }]);
    expect(await can(sujeito(), "rh", "ver")).toBe(true);
    expect(await can(sujeito(), "rh", "folha")).toBe(false);
  });

  it("override individual vence o perfil, inclusive para NEGAR", async () => {
    perfilFindMany.mockResolvedValue([{ recurso: "rh", acao: "ver", permitido: true }]);
    overrideFindUnique.mockResolvedValue({ permitido: false, expiraEm: null });
    expect(await can(sujeito(), "rh", "ver")).toBe(false);
  });
});
