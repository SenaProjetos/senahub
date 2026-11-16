import { describe, expect, it } from "vitest";
import {
  MOTIVO_FERIAS_JA_DECIDIDAS,
  MOTIVO_PROPRIAS_FERIAS,
  motivoParaNaoDecidirFerias,
  motivoParaNaoLancarFeriasPara,
} from "@/modules/rh/ferias-decisao";

const rh = { id: "rh1", superUsuario: false };

describe("motivoParaNaoDecidirFerias", () => {
  it("férias pendentes de outra pessoa podem ser decididas", () => {
    expect(motivoParaNaoDecidirFerias({ status: "pendente", userId: "u2" }, rh)).toBeNull();
  });

  it("férias já aprovadas ou rejeitadas recusam com a frase de já decididas", () => {
    expect(motivoParaNaoDecidirFerias({ status: "aprovado", userId: "u2" }, rh)).toBe(MOTIVO_FERIAS_JA_DECIDIDAS);
    expect(motivoParaNaoDecidirFerias({ status: "rejeitado", userId: "u2" }, rh)).toBe(MOTIVO_FERIAS_JA_DECIDIDAS);
  });

  it("as próprias férias recusam, exceto para o superusuário", () => {
    expect(motivoParaNaoDecidirFerias({ status: "pendente", userId: "rh1" }, rh)).toBe(MOTIVO_PROPRIAS_FERIAS);
    expect(motivoParaNaoDecidirFerias({ status: "pendente", userId: "rh1" }, { ...rh, superUsuario: true })).toBeNull();
  });
});

describe("motivoParaNaoLancarFeriasPara", () => {
  it("lançar para outra pessoa pode", () => {
    expect(motivoParaNaoLancarFeriasPara("u2", "rh1")).toBeNull();
  });

  it("lançar para si mesmo recusa: a solicitação passa por outra pessoa do RH", () => {
    expect(motivoParaNaoLancarFeriasPara("rh1", "rh1")).toMatch(/suas próprias férias/);
  });
});
