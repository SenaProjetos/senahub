import { describe, expect, it } from "vitest";
import { agruparFollowUps, grupoDoFollowUp } from "./follow-ups";

// Quarta-feira, 15h local.
const agora = new Date(2026, 8, 16, 15, 0);
const em = (dias: number, hora = 9) => new Date(2026, 8, 16 + dias, hora, 0);

describe("grupoDoFollowUp", () => {
  it("ação de hoje às 9h vista às 15h ainda é de hoje, não atrasada", () => {
    expect(grupoDoFollowUp(em(0, 9), agora)).toBe("hoje");
  });

  it("ontem é atrasado; amanhã e daqui a 7 dias são próximos", () => {
    expect(grupoDoFollowUp(em(-1, 23), agora)).toBe("atrasados");
    expect(grupoDoFollowUp(em(1, 0), agora)).toBe("proximos");
    expect(grupoDoFollowUp(em(7, 23), agora)).toBe("proximos");
  });

  it("depois de 7 dias fica em 'mais adiante'", () => {
    expect(grupoDoFollowUp(em(9), agora)).toBe("depois");
  });
});

describe("agruparFollowUps", () => {
  it("preserva a ordem de entrada dentro de cada grupo", () => {
    const itens = [
      { id: "a", inicio: em(-3).toISOString() },
      { id: "b", inicio: em(-1).toISOString() },
      { id: "c", inicio: em(0).toISOString() },
    ];
    const g = agruparFollowUps(itens, agora);
    expect(g.atrasados.map((i) => i.id)).toEqual(["a", "b"]);
    expect(g.hoje.map((i) => i.id)).toEqual(["c"]);
    expect(g.proximos).toEqual([]);
  });
});
