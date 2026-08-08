import { describe, expect, it } from "vitest";
import { descreverNovidades, temNovidade } from "@/modules/projetos/pendencias/novidades";

const DESDE = "2026-08-01T10:00:00.000Z";

describe("temNovidade", () => {
  it("primeira visita nunca tem novidade, por mais cheia que a prancha esteja", () => {
    // É o ponto do item: quem nunca abriu não recebe "40 novidades", recebe a prancha.
    expect(temNovidade({ desde: null, apontamentos: 40, revisoes: 3 })).toBe(false);
  });

  it("com marca d'água anterior, qualquer um dos dois sinais conta", () => {
    expect(temNovidade({ desde: DESDE, apontamentos: 1, revisoes: 0 })).toBe(true);
    expect(temNovidade({ desde: DESDE, apontamentos: 0, revisoes: 1 })).toBe(true);
    expect(temNovidade({ desde: DESDE, apontamentos: 0, revisoes: 0 })).toBe(false);
  });
});

describe("descreverNovidades", () => {
  it("nomeia cada sinal — nunca soma os dois num total", () => {
    expect(descreverNovidades({ desde: DESDE, apontamentos: 2, revisoes: 1 })).toBe(
      "Desde sua última visita: 1 revisão nova e 2 apontamentos novos.",
    );
  });

  it("concorda em número nos dois sinais", () => {
    expect(descreverNovidades({ desde: DESDE, apontamentos: 1, revisoes: 0 })).toBe(
      "Desde sua última visita: 1 apontamento novo.",
    );
    expect(descreverNovidades({ desde: DESDE, apontamentos: 0, revisoes: 2 })).toBe(
      "Desde sua última visita: 2 revisões novas.",
    );
  });

  it("sem novidade não vira frase vazia — vira null", () => {
    expect(descreverNovidades({ desde: DESDE, apontamentos: 0, revisoes: 0 })).toBeNull();
    expect(descreverNovidades({ desde: null, apontamentos: 5, revisoes: 5 })).toBeNull();
  });
});
