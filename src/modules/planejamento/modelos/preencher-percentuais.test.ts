import { describe, expect, it } from "vitest";
import { percentuaisAPreencher } from "./preencher-percentuais";

const modelo = { pl: 20, bs: 40, ex: 40 };
const et = (etapaId: string, percentual = 0, liberada = false) => ({ etapaId, percentual, liberada });
const com = new Set(["d1", "d2"]);

describe("percentuaisAPreencher", () => {
  it("preenche as 3 etapas zeradas com os percentuais do modelo", () => {
    const r = percentuaisAPreencher({
      percentuaisPorFase: modelo,
      disciplinas: [{ disciplinaId: "d1", etapas: [et("pl"), et("bs"), et("ex")] }],
      disciplinasComLinha: com,
    });
    expect(r).toEqual([
      { disciplinaId: "d1", etapaId: "pl", percentual: 20 },
      { disciplinaId: "d1", etapaId: "bs", percentual: 40 },
      { disciplinaId: "d1", etapaId: "ex", percentual: 40 },
    ]);
  });

  it("não toca quem já preencheu alguma etapa à mão", () => {
    expect(
      percentuaisAPreencher({ percentuaisPorFase: modelo, disciplinas: [{ disciplinaId: "d1", etapas: [et("pl", 10), et("bs"), et("ex")] }], disciplinasComLinha: com }),
    ).toEqual([]);
  });

  it("não toca disciplina com pagamento de fase liberado", () => {
    expect(
      percentuaisAPreencher({ percentuaisPorFase: modelo, disciplinas: [{ disciplinaId: "d1", etapas: [et("pl", 0, true), et("bs"), et("ex")] }], disciplinasComLinha: com }),
    ).toEqual([]);
  });

  it("unifamiliar (só BS e EX): soma 80% não fecha, então não preenche pela metade", () => {
    expect(
      percentuaisAPreencher({ percentuaisPorFase: modelo, disciplinas: [{ disciplinaId: "d1", etapas: [et("bs"), et("ex")] }], disciplinasComLinha: com }),
    ).toEqual([]);
  });

  it("modelo sem percentual para alguma etapa da disciplina: não preenche", () => {
    expect(
      percentuaisAPreencher({ percentuaisPorFase: { bs: 50, ex: 50 }, disciplinas: [{ disciplinaId: "d1", etapas: [et("pl"), et("bs"), et("ex")] }], disciplinasComLinha: com }),
    ).toEqual([]);
  });

  it("modelo só com BS e EX (50/50) preenche a disciplina que só tem BS e EX", () => {
    const r = percentuaisAPreencher({
      percentuaisPorFase: { bs: 50, ex: 50 },
      disciplinas: [{ disciplinaId: "d1", etapas: [et("bs"), et("ex")] }],
      disciplinasComLinha: com,
    });
    expect(r.map((x) => x.percentual)).toEqual([50, 50]);
  });

  it("disciplina sem linha do modelo ou sem etapa fica de fora; as outras entram", () => {
    const r = percentuaisAPreencher({
      percentuaisPorFase: modelo,
      disciplinas: [
        { disciplinaId: "d1", etapas: [et("pl"), et("bs"), et("ex")] },
        { disciplinaId: "d3", etapas: [et("pl"), et("bs"), et("ex")] },
        { disciplinaId: "d2", etapas: [] },
      ],
      disciplinasComLinha: com,
    });
    expect(new Set(r.map((x) => x.disciplinaId))).toEqual(new Set(["d1"]));
  });

  it("33,33 + 33,33 + 33,34 fecha em centavos", () => {
    const r = percentuaisAPreencher({
      percentuaisPorFase: { pl: 33.33, bs: 33.33, ex: 33.34 },
      disciplinas: [{ disciplinaId: "d1", etapas: [et("pl"), et("bs"), et("ex")] }],
      disciplinasComLinha: com,
    });
    expect(r).toHaveLength(3);
  });
});
