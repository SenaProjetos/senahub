import { describe, it, expect } from "vitest";
import { etapaEhPerdido, calcularStatusComercial } from "./status";
import type { StatusComercial } from "./status";

describe("etapaEhPerdido", () => {
  it("reconhece 'Perdido'", () => {
    expect(etapaEhPerdido("Perdido")).toBe(true);
  });

  it("reconhece 'Perdida' (variação de gênero)", () => {
    expect(etapaEhPerdido("Perdida")).toBe(true);
  });

  it("é case-insensitive", () => {
    expect(etapaEhPerdido("PERDIDO")).toBe(true);
    expect(etapaEhPerdido("perdido")).toBe(true);
  });

  it("reconhece variação com sufixo, por ser substring", () => {
    expect(etapaEhPerdido("Perdido (revisar)")).toBe(true);
  });

  it("NÃO reconhece etapa renomeada para fora do padrão — limitação documentada, não bug oculto", () => {
    expect(etapaEhPerdido("Não avançou")).toBe(false);
    expect(etapaEhPerdido("Descartada")).toBe(false);
  });

  it("não reconhece as demais etapas do seed", () => {
    expect(etapaEhPerdido("Orçamento")).toBe(false);
    expect(etapaEhPerdido("Em negociação")).toBe(false);
    expect(etapaEhPerdido("Proposta enviada")).toBe(false);
    expect(etapaEhPerdido("Contratado")).toBe(false);
  });
});

describe("calcularStatusComercial", () => {
  it("PROSPECT quando não há proposta aceita e sem override", () => {
    const r: StatusComercial = calcularStatusComercial(false, null);
    expect(r).toBe("PROSPECT");
  });

  it("CLIENTE quando há proposta aceita e sem override", () => {
    const r: StatusComercial = calcularStatusComercial(true, null);
    expect(r).toBe("CLIENTE");
  });

  it("override sempre vence, mesmo contra o cálculo", () => {
    expect(calcularStatusComercial(true, "EX_CLIENTE")).toBe("EX_CLIENTE");
    expect(calcularStatusComercial(false, "PARCEIRO")).toBe("PARCEIRO");
    expect(calcularStatusComercial(false, "CLIENTE")).toBe("CLIENTE");
  });
});
