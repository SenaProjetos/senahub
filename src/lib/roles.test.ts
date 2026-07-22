import { describe, it, expect } from "vitest";
import { SOLICITACAO_CADASTRO_ROLES, ROLES, ROLE_LABELS } from "./roles";

describe("SOLICITACAO_CADASTRO_ROLES", () => {
  it("exclui perfis privilegiados/internos do auto-cadastro público", () => {
    for (const priv of ["admin", "supervisor", "administrativo", "ti"] as const) {
      expect(SOLICITACAO_CADASTRO_ROLES).not.toContain(priv);
    }
  });

  it("permite os perfis externos/contratação", () => {
    for (const r of ["cliente", "clt", "estagiario", "projetista_pj", "freelancer"] as const) {
      expect(SOLICITACAO_CADASTRO_ROLES).toContain(r);
    }
  });

  it("todos os valores são roles válidos com rótulo", () => {
    for (const r of SOLICITACAO_CADASTRO_ROLES) {
      expect(ROLES).toContain(r);
      expect(ROLE_LABELS[r]).toBeTruthy();
    }
  });
});
