import { describe, expect, it } from "vitest";
import { MOTIVO_NAO_PARTICIPA, podeParticiparDaConversa } from "@/modules/projetos/pendencias/problemas";

const base = { autorId: "a", usuarioId: "u", ehResponsavel: false, ehGlobal: false };

describe("podeParticiparDaConversa", () => {
  it("autor participa mesmo sem ser responsável", () => {
    expect(podeParticiparDaConversa({ ...base, usuarioId: "a" })).toBe(true);
  });
  it("responsável participa", () => {
    expect(podeParticiparDaConversa({ ...base, ehResponsavel: true })).toBe(true);
  });
  it("global participa", () => {
    expect(podeParticiparDaConversa({ ...base, ehGlobal: true })).toBe(true);
  });
  it("nenhum dos três não participa", () => {
    expect(podeParticiparDaConversa(base)).toBe(false);
  });
  it("MOTIVO_NAO_PARTICIPA é a frase do servidor", () => {
    expect(MOTIVO_NAO_PARTICIPA).toBe("Só um responsável da disciplina pode alterar esta pendência.");
  });
});
