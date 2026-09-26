import { describe, expect, it } from "vitest";
import { planejarAplicacao, type DisciplinaAlvo, type LinhaEap } from "./aplicacao";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const dia = (x: Date | undefined) => x?.toISOString().slice(0, 10);

const semEtapa: DisciplinaAlvo = { id: "est", nome: "Estrutural", etapas: [] };
const comEtapa: DisciplinaAlvo = {
  id: "ele",
  nome: "Elétrico",
  etapas: [
    { id: "ele-bs", etapaId: "BS" },
    { id: "ele-ex", etapaId: "EX" },
  ],
};

describe("disciplina SEM etapa — comportamento de sempre", () => {
  it("grava o MAIOR fim previsto, não o da última linha", () => {
    // O bug antigo: gravava linha a linha e a ÚLTIMA escrita vencia. Aqui a última linha é a
    // de fim menor — com a regra antiga, a disciplina ficaria com 01/10 em vez de 31/12.
    const linhas: LinhaEap[] = [
      { disciplinaId: "est", etapaId: null, fimPrevisto: d("2026-12-31") },
      { disciplinaId: "est", etapaId: null, fimPrevisto: d("2026-10-01") },
    ];
    const p = planejarAplicacao(linhas, [semEtapa]);
    expect(dia(p.porDisciplina.get("est"))).toBe("2026-12-31");
  });

  it("não depende da ordem das linhas", () => {
    const a: LinhaEap = { disciplinaId: "est", etapaId: null, fimPrevisto: d("2026-10-01") };
    const b: LinhaEap = { disciplinaId: "est", etapaId: null, fimPrevisto: d("2026-12-31") };
    expect(dia(planejarAplicacao([a, b], [semEtapa]).porDisciplina.get("est"))).toBe("2026-12-31");
    expect(dia(planejarAplicacao([b, a], [semEtapa]).porDisciplina.get("est"))).toBe("2026-12-31");
  });

  it("não toca etapa nem pede reconsolidação", () => {
    const p = planejarAplicacao([{ disciplinaId: "est", etapaId: "BS", fimPrevisto: d("2026-10-01") }], [semEtapa]);
    expect(p.porEtapa.size).toBe(0);
    expect(p.aReconsolidar.size).toBe(0);
  });
});

describe("disciplina COM etapa (F4)", () => {
  it("cada linha vai para a etapa da mesma fase", () => {
    const p = planejarAplicacao(
      [
        { disciplinaId: "ele", etapaId: "BS", fimPrevisto: d("2026-10-12") },
        { disciplinaId: "ele", etapaId: "EX", fimPrevisto: d("2026-12-31") },
      ],
      [comEtapa],
    );
    expect(dia(p.porEtapa.get("ele-bs"))).toBe("2026-10-12");
    expect(dia(p.porEtapa.get("ele-ex"))).toBe("2026-12-31");
    expect(p.aReconsolidar.has("ele")).toBe(true);
  });

  it("NUNCA grava direto na disciplina — o prazo dela vem da consolidação", () => {
    const p = planejarAplicacao([{ disciplinaId: "ele", etapaId: "BS", fimPrevisto: d("2026-10-12") }], [comEtapa]);
    expect(p.porDisciplina.has("ele")).toBe(false);
  });

  it("várias linhas da mesma fase: fica o maior fim", () => {
    const p = planejarAplicacao(
      [
        { disciplinaId: "ele", etapaId: "BS", fimPrevisto: d("2026-10-20") },
        { disciplinaId: "ele", etapaId: "BS", fimPrevisto: d("2026-10-05") },
      ],
      [comEtapa],
    );
    expect(dia(p.porEtapa.get("ele-bs"))).toBe("2026-10-20");
  });

  it("linha SEM fase é pulada e reportada — adivinhar a etapa seria inventar prazo", () => {
    const p = planejarAplicacao([{ disciplinaId: "ele", etapaId: null, fimPrevisto: d("2026-10-12") }], [comEtapa]);
    expect(p.porEtapa.size).toBe(0);
    expect(p.ignoradas).toEqual(["Elétrico: linha sem fase"]);
    // Nada gravado, nada a reconsolidar.
    expect(p.aReconsolidar.size).toBe(0);
  });

  it("linha de fase que a disciplina NÃO tem é pulada — não cria etapa sozinho", () => {
    const p = planejarAplicacao([{ disciplinaId: "ele", etapaId: "AB", fimPrevisto: d("2027-02-01") }], [comEtapa]);
    expect(p.porEtapa.size).toBe(0);
    expect(p.ignoradas).toEqual(["Elétrico: linha de uma fase que a disciplina não tem"]);
  });

  it("o aviso de linha pulada sai uma vez só, mesmo com várias linhas", () => {
    const p = planejarAplicacao(
      [
        { disciplinaId: "ele", etapaId: null, fimPrevisto: d("2026-10-01") },
        { disciplinaId: "ele", etapaId: null, fimPrevisto: d("2026-11-01") },
      ],
      [comEtapa],
    );
    expect(p.ignoradas).toHaveLength(1);
  });
});

describe("misturado", () => {
  it("disciplina sem etapa e com etapa no mesmo projeto seguem cada uma a sua regra", () => {
    const p = planejarAplicacao(
      [
        { disciplinaId: "est", etapaId: null, fimPrevisto: d("2026-11-30") },
        { disciplinaId: "ele", etapaId: "EX", fimPrevisto: d("2026-12-31") },
      ],
      [semEtapa, comEtapa],
    );
    expect(dia(p.porDisciplina.get("est"))).toBe("2026-11-30");
    expect(dia(p.porEtapa.get("ele-ex"))).toBe("2026-12-31");
    expect(p.porDisciplina.has("ele")).toBe(false);
  });

  it("disciplina sem linha nenhuma na EAP não aparece em lugar nenhum", () => {
    const p = planejarAplicacao([], [semEtapa, comEtapa]);
    expect(p.porDisciplina.size).toBe(0);
    expect(p.porEtapa.size).toBe(0);
    expect(p.ignoradas).toEqual([]);
  });
});
