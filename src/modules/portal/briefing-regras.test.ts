import { describe, expect, it } from "vitest";
import { fraseEncerradoPelaEquipe, fraseProgressoBriefing, fraseProgressoExtras, statusDoFormulario } from "./briefing-regras";

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

describe("statusDoFormulario", () => {
  const extra = (resposta: string) => ({ resposta });

  it("com campo visível mantém o status do briefing, mesmo com extras", () => {
    expect(statusDoFormulario({ status: "nao_iniciado", temCampoVisivel: true, extras: [extra("x")] })).toBe("nao_iniciado");
    expect(statusDoFormulario({ status: "completo", temCampoVisivel: true, extras: [extra("")] })).toBe("completo");
  });

  it("sem campo visível, nenhuma extra respondida = não iniciado", () => {
    expect(statusDoFormulario({ status: "nao_iniciado", temCampoVisivel: false, extras: [extra(""), extra("  ")] })).toBe("nao_iniciado");
  });

  it("sem campo visível, algumas respondidas = em preenchimento", () => {
    expect(statusDoFormulario({ status: "nao_iniciado", temCampoVisivel: false, extras: [extra("sim"), extra("")] })).toBe("em_preenchimento");
  });

  it("sem campo visível, todas respondidas = completo", () => {
    expect(statusDoFormulario({ status: "nao_iniciado", temCampoVisivel: false, extras: [extra("a"), extra("b")] })).toBe("completo");
  });

  it("sem campo visível e sem extras mantém o status do briefing", () => {
    expect(statusDoFormulario({ status: "nao_iniciado", temCampoVisivel: false, extras: [] })).toBe("nao_iniciado");
  });
});

describe("fraseProgressoExtras", () => {
  it("conta as perguntas respondidas", () => {
    expect(fraseProgressoExtras([{ resposta: "a" }, { resposta: "" }, { resposta: "b" }])).toBe("2 de 3 perguntas respondidas");
  });

  it("concorda no singular", () => {
    expect(fraseProgressoExtras([{ resposta: "a" }])).toBe("1 de 1 pergunta respondida");
  });

  it("some sem pergunta", () => {
    expect(fraseProgressoExtras([])).toBeNull();
  });
});
