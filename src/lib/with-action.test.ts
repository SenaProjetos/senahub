import { describe, it, expect, vi, beforeEach } from "vitest";

// Gates por eixo do `defineAction` (Onda F): `interno` lê `User.tipo`, `gereRh` lê `rh:gerir`
// já resolvido na sessão. Sessão e auditoria mockadas — o que se testa é só a ordem dos gates.
const sessao = vi.fn();
const logAudit = vi.fn();
vi.mock("@/lib/session", () => ({ getSession: () => sessao() }));
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a), getClientIp: async () => null }));
vi.mock("@/lib/permissions", () => ({ can: async () => true }));

import { defineAction } from "@/lib/with-action";

function usuario(over: Record<string, unknown> = {}) {
  return {
    user: {
      id: "u1",
      role: "clt",
      ativo: true,
      mustChangePassword: false,
      tipo: "interno",
      gereRh: false,
      superUsuario: false,
      ...over,
    },
  };
}

const acaoInterna = defineAction({ modulo: "teste", acao: "interna", interno: true, audit: false }, async () => "ok");
const acaoRh = defineAction({ modulo: "teste", acao: "rh", gereRh: true, audit: false }, async () => "ok");

describe("defineAction — gates por eixo", () => {
  beforeEach(() => {
    sessao.mockReset();
    logAudit.mockReset();
  });

  it("interno: aceita tipo interno, recusa externo", async () => {
    sessao.mockResolvedValue(usuario());
    expect(await acaoInterna(undefined)).toEqual({ ok: true, data: "ok" });
    sessao.mockResolvedValue(usuario({ tipo: "externo" }));
    expect(await acaoInterna(undefined)).toEqual({ ok: false, error: "Sem permissão." });
  });

  it("gereRh: só quem tem rh:gerir resolvido na sessão — o papel não conta", async () => {
    sessao.mockResolvedValue(usuario({ role: "administrativo", gereRh: false }));
    expect(await acaoRh(undefined)).toEqual({ ok: false, error: "Sem permissão." });
    sessao.mockResolvedValue(usuario({ role: "clt", gereRh: true }));
    expect(await acaoRh(undefined)).toEqual({ ok: true, data: "ok" });
  });
});
