import { describe, expect, it } from "vitest";
import { fraseEncerradoPelaEquipe, fraseProgressoBriefing } from "./briefing-regras";

describe("fraseProgressoBriefing", () => {
  it("conta as obrigatórias respondidas", () => {
    expect(fraseProgressoBriefing({ preenchidos: 3, total: 8 })).toBe("3 de 8 obrigatórias respondidas");
    expect(fraseProgressoBriefing({ preenchidos: 0, total: 8 })).toBe("0 de 8 obrigatórias respondidas");
  });

  it("concorda no singular", () => {
    expect(fraseProgressoBriefing({ preenchidos: 1, total: 1 })).toBe("1 de 1 obrigatória respondida");
  });

  it("some quando não há obrigatória", () => {
    expect(fraseProgressoBriefing({ preenchidos: 0, total: 0 })).toBeNull();
  });
});

describe("fraseEncerradoPelaEquipe", () => {
  it("usa o dia de São Paulo, não o de UTC", () => {
    // 22/11 01:30 UTC ainda é 21/11 em São Paulo (UTC-3).
    expect(fraseEncerradoPelaEquipe(new Date("2026-11-22T01:30:00Z"))).toBe("Encerrado pela equipe em 21/11/2026.");
  });
});
