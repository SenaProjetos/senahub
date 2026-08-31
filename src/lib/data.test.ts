import { describe, it, expect } from "vitest";
import { paraData, inicioDoDia, inicioDoDiaLocal, inicioDoDiaUtc } from "./data";

/**
 * Regressão do bug "um dia a menos": o banco devolve prazos como meia-noite UTC
 * e `getDate()` direto dava o dia anterior em America/Sao_Paulo — o card de
 * /projetos mostrava 02/09 e o painel do projeto 01/09 para o MESMO campo.
 * As asserções valem em qualquer fuso (em UTC+ o dia já era o certo).
 */
describe("paraData", () => {
  it("mantém o dia de um DateTime em meia-noite UTC (campo de data do Prisma)", () => {
    const d = paraData(new Date("2026-09-02T00:00:00.000Z"))!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(2);
  });

  it("aceita a mesma data já serializada em string ISO", () => {
    expect(paraData("2026-09-02T00:00:00.000Z")!.getDate()).toBe(2);
  });

  it("trata yyyy-mm-dd puro como data local", () => {
    const d = paraData("2026-09-02")!;
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(2);
  });

  it("preserva instantes com hora (não são data-calendário)", () => {
    const iso = "2026-09-02T14:30:00.000Z";
    expect(paraData(iso)!.getTime()).toBe(new Date(iso).getTime());
  });

  it("devolve null para nulo/indefinido/inválido", () => {
    expect(paraData(null)).toBeNull();
    expect(paraData(undefined)).toBeNull();
    expect(paraData("não-é-data")).toBeNull();
  });
});

describe("inicioDoDia", () => {
  it("zera a hora mantendo o dia da meia-noite UTC", () => {
    const d = inicioDoDia(new Date("2026-09-02T00:00:00.000Z"))!;
    expect(d.getDate()).toBe(2);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it("zera a hora de um instante com hora, sem trocar o dia local", () => {
    const agora = new Date(2026, 8, 2, 17, 45);
    const d = inicioDoDia(agora)!;
    expect(d.getDate()).toBe(2);
    expect(d.getHours()).toBe(0);
  });

  it("devolve null quando não há data", () => {
    expect(inicioDoDia(null)).toBeNull();
  });
});

describe("inicioDoDiaUtc", () => {
  it("devolve a meia-noite UTC do dia LOCAL, mesmo à noite em fuso atrás de UTC", () => {
    // 02/09 21:00 em BRT já é 03/09 em UTC — `toISOString()` erraria o dia aqui.
    const d = inicioDoDiaUtc(new Date(2026, 8, 2, 21, 0));
    expect(d.toISOString()).toBe("2026-09-02T00:00:00.000Z");
  });

  it("casa com o registro do próprio dia numa fronteira `gte`", () => {
    const registroDeHoje = new Date("2026-09-02T00:00:00.000Z");
    expect(registroDeHoje >= inicioDoDiaUtc(new Date(2026, 8, 2, 21, 0))).toBe(true);
  });

});

describe("inicioDoDiaLocal", () => {
  it("não cai na heurística de data-do-banco às 21:00:00.000 em BRT", () => {
    // Esse instante tem todos os componentes UTC zerados (03/09 00:00Z).
    const d = inicioDoDiaLocal(new Date(2026, 8, 2, 21, 0, 0, 0));
    expect(d.getDate()).toBe(2);
    expect(d.getHours()).toBe(0);
  });
});
