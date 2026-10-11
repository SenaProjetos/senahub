import { describe, expect, it } from "vitest";
import { agenteDoNovoVinculo } from "./agente-integracao";

describe("agenteDoNovoVinculo", () => {
  it("renovação ou troca de setor de estágio mantém o agente do vínculo anterior", () => {
    expect(agenteDoNovoVinculo("estagio", undefined, { contratacao: "estagio", agenteIntegracao: null })).toBeNull();
    expect(agenteDoNovoVinculo("estagio", undefined, { contratacao: "estagio", agenteIntegracao: "IEL" })).toBe("IEL");
  });
  it("estágio novo começa pelo IEL (a princípio todos são pelo IEL)", () => {
    expect(agenteDoNovoVinculo("estagio", undefined, null)).toBe("IEL");
    expect(agenteDoNovoVinculo("estagio", undefined, { contratacao: "clt", agenteIntegracao: null })).toBe("IEL");
  });
  it("o que o RH informar vale", () => {
    expect(agenteDoNovoVinculo("estagio", null, { contratacao: "estagio", agenteIntegracao: "IEL" })).toBeNull();
  });
  it("fora do estágio não há agente", () => {
    expect(agenteDoNovoVinculo("clt", "IEL", { contratacao: "estagio", agenteIntegracao: "IEL" })).toBeNull();
  });
});
