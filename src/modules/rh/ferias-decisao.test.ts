import { describe, expect, it } from "vitest";
import {
  MOTIVO_FERIAS_DE_RH,
  MOTIVO_FERIAS_JA_DECIDIDAS,
  MOTIVO_PROPRIAS_FERIAS,
  motivoFeriasSobrepostas,
  motivoParaNaoDecidirFerias,
  motivoParaNaoDecidirFeriasDe,
  motivoParaNaoLancarFeriasPara,
} from "@/modules/rh/ferias-decisao";

const rh = { id: "rh1", superUsuario: false };
const admin = { id: "adm", superUsuario: true };
const pendente = { status: "pendente", userId: "u2", donoEhRh: false };

describe("motivoParaNaoDecidirFerias", () => {
  it("férias pendentes de quem não é do RH o RH decide", () => {
    expect(motivoParaNaoDecidirFerias(pendente, rh)).toBeNull();
  });

  it("férias já aprovadas ou rejeitadas recusam com a frase de já decididas", () => {
    expect(motivoParaNaoDecidirFerias({ ...pendente, status: "aprovado" }, rh)).toBe(MOTIVO_FERIAS_JA_DECIDIDAS);
    expect(motivoParaNaoDecidirFerias({ ...pendente, status: "rejeitado" }, admin)).toBe(MOTIVO_FERIAS_JA_DECIDIDAS);
  });

  it("as próprias férias recusam, exceto para o superusuário", () => {
    const proprias = { ...pendente, userId: "rh1", donoEhRh: true };
    expect(motivoParaNaoDecidirFerias(proprias, rh)).toBe(MOTIVO_PROPRIAS_FERIAS);
    expect(motivoParaNaoDecidirFerias(proprias, { ...rh, superUsuario: true })).toBeNull();
  });

  it("as de um colega do RH só um administrador decide", () => {
    expect(motivoParaNaoDecidirFerias({ ...pendente, donoEhRh: true }, rh)).toBe(MOTIVO_FERIAS_DE_RH);
    expect(motivoParaNaoDecidirFerias({ ...pendente, donoEhRh: true }, admin)).toBeNull();
  });
});

describe("motivoParaNaoDecidirFeriasDe (alteração de férias já aprovadas)", () => {
  it("segue a mesma regra sem olhar status", () => {
    expect(motivoParaNaoDecidirFeriasDe({ id: "u2", ehRh: false }, rh)).toBeNull();
    expect(motivoParaNaoDecidirFeriasDe({ id: "rh1", ehRh: true }, rh)).toBe(MOTIVO_PROPRIAS_FERIAS);
    expect(motivoParaNaoDecidirFeriasDe({ id: "rh2", ehRh: true }, rh)).toBe(MOTIVO_FERIAS_DE_RH);
    expect(motivoParaNaoDecidirFeriasDe({ id: "rh2", ehRh: true }, admin)).toBeNull();
  });
});

describe("motivoParaNaoLancarFeriasPara", () => {
  it("lançar para quem não é do RH pode", () => {
    expect(motivoParaNaoLancarFeriasPara({ id: "u2", ehRh: false }, rh)).toBeNull();
  });

  it("lançar para si mesmo recusa: a solicitação vai a um administrador", () => {
    expect(motivoParaNaoLancarFeriasPara({ id: "rh1", ehRh: true }, rh)).toMatch(/suas próprias férias.*administrador/);
  });

  it("lançar para um colega do RH só o administrador", () => {
    expect(motivoParaNaoLancarFeriasPara({ id: "rh2", ehRh: true }, rh)).toBe("Para quem é do RH, só um administrador lança férias.");
    expect(motivoParaNaoLancarFeriasPara({ id: "rh2", ehRh: true }, admin)).toBeNull();
  });
});

describe("motivoFeriasSobrepostas", () => {
  it("a própria pessoa: pendente e aprovada em frases dela", () => {
    expect(motivoFeriasSobrepostas("pendente", "propria")).toMatch(/^Você já pediu férias/);
    expect(motivoFeriasSobrepostas("aprovado", "propria")).toMatch(/^Você já tem férias aprovadas/);
  });

  it("RH lançando: pendente aponta a fila, aprovada recusa", () => {
    expect(motivoFeriasSobrepostas("pendente", "lancar")).toMatch(/Férias pendentes/);
    expect(motivoFeriasSobrepostas("aprovado", "lancar")).toMatch(/férias aprovadas/);
  });

  it("aprovação manda rejeitar; alteração fala da nova data", () => {
    expect(motivoFeriasSobrepostas("aprovado", "aprovar")).toMatch(/Rejeite/);
    expect(motivoFeriasSobrepostas("aprovado", "alterar")).toMatch(/^A nova data cruza outras férias aprovadas/);
    expect(motivoFeriasSobrepostas("pendente", "alterar")).toMatch(/pendente.*Decida-a/);
  });
});
