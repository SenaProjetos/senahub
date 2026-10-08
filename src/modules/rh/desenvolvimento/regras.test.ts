import { describe, expect, it } from "vitest";
import { deveLembrar, encontroVisivel, papelSobre, podeEscrever, proximoUmAUm } from "./regras";

describe("papelSobre", () => {
  it("RH vê qualquer um; líder ativo vê o liderado; a pessoa vê a si", () => {
    expect(papelSobre({ id: "rh", ehRh: true }, "ana", "bia")).toBe("rh");
    expect(papelSobre({ id: "bia", ehRh: false }, "ana", "bia")).toBe("lider");
    expect(papelSobre({ id: "ana", ehRh: false }, "ana", "bia")).toBe("self");
  });
  it("liderança não acessa quem não lidera (nem a antiga)", () => {
    expect(papelSobre({ id: "carlos", ehRh: false }, "ana", "bia")).toBeNull();
    expect(papelSobre({ id: "bia", ehRh: false }, "ana", null)).toBeNull();
  });
  it("só RH e líder escrevem", () => {
    expect([podeEscrever("rh"), podeEscrever("lider"), podeEscrever("self"), podeEscrever(null)]).toEqual([true, true, false, false]);
  });
});

describe("encontroVisivel", () => {
  it("a pessoa só vê o compartilhado", () => {
    expect(encontroVisivel({ visibilidade: "lider_rh" }, "self")).toBe(false);
    expect(encontroVisivel({ visibilidade: "compartilhado" }, "self")).toBe(true);
    expect(encontroVisivel({ visibilidade: "lider_rh" }, "lider")).toBe(true);
    expect(encontroVisivel({ visibilidade: "compartilhado" }, null)).toBe(false);
  });
});

describe("proximoUmAUm", () => {
  it("sem encontro: início da liderança + cadência", () => {
    expect(proximoUmAUm(null, "2026-09-01", 30, "2026-10-08")).toEqual({ em: "2026-10-01", vencido: true, diasAtraso: 7 });
  });
  it("próximo marcado no registro vence a cadência", () => {
    expect(proximoUmAUm({ data: "2026-09-20", proximoEm: "2026-10-15" }, "2026-01-01", 30, "2026-10-08")).toEqual({
      em: "2026-10-15",
      vencido: false,
      diasAtraso: 0,
    });
  });
  it("sem próximo marcado: último + cadência", () => {
    expect(proximoUmAUm({ data: "2026-09-20", proximoEm: null }, "2026-01-01", 15, "2026-10-08").em).toBe("2026-10-05");
  });
});

describe("deveLembrar", () => {
  it("no máximo a cada 7 dias", () => {
    expect(deveLembrar(null, "2026-10-08")).toBe(true);
    expect(deveLembrar("2026-10-02", "2026-10-08")).toBe(false);
    expect(deveLembrar("2026-10-01", "2026-10-08")).toBe(true);
  });
});
