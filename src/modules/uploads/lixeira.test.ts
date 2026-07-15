import { describe, it, expect } from "vitest";
import { DIAS_LIXEIRA, limitePurga, diasRestantesLixeira } from "./lixeira";

const MS_DIA = 24 * 60 * 60 * 1000;
const agora = new Date("2026-07-11T12:00:00.000Z");
const diasAtras = (n: number) => new Date(agora.getTime() - n * MS_DIA);

describe("lixeira", () => {
  it("retém por 30 dias", () => {
    expect(DIAS_LIXEIRA).toBe(30);
  });

  it("limitePurga = agora - 30 dias", () => {
    expect(limitePurga(agora).getTime()).toBe(agora.getTime() - 30 * MS_DIA);
  });

  it("recém-excluído mostra o prazo cheio", () => {
    expect(diasRestantesLixeira(agora, agora)).toBe(DIAS_LIXEIRA);
  });

  it("conta os dias restantes (arredonda p/ cima)", () => {
    expect(diasRestantesLixeira(diasAtras(10), agora)).toBe(20);
    expect(diasRestantesLixeira(diasAtras(29.5), agora)).toBe(1);
  });

  it("no vencimento (30 dias) ou depois → 0", () => {
    expect(diasRestantesLixeira(diasAtras(30), agora)).toBe(0);
    expect(diasRestantesLixeira(diasAtras(45), agora)).toBe(0);
  });

  it("excluidoEm no futuro (relógio torto) → prazo cheio", () => {
    expect(diasRestantesLixeira(diasAtras(-5), agora)).toBe(DIAS_LIXEIRA);
  });
});
