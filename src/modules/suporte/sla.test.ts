import { describe, it, expect } from "vitest";
import { calcularSla, SLA_ALERTA_DIAS_UTEIS } from "./sla";

const agora = new Date("2026-06-22T12:00:00Z");

function daysAgo(dias: number): Date {
  const d = new Date(agora);
  d.setDate(d.getDate() - dias);
  return d;
}

describe("calcularSla", () => {
  describe("ticket resolvido", () => {
    it("retorna emAberto=false e rotulo com 'resolvido em'", () => {
      const criado = daysAgo(5);
      const atualizado = daysAgo(1);
      const r = calcularSla(criado, atualizado, "resolvido", agora);
      expect(r.emAberto).toBe(false);
      expect(r.rotulo).toContain("resolvido em");
      expect(r.alerta).toBe(false);
    });

    it("aceita strings ISO como datas", () => {
      const r = calcularSla(
        daysAgo(3).toISOString(),
        daysAgo(1).toISOString(),
        "resolvido",
        agora,
      );
      expect(r.emAberto).toBe(false);
    });
  });

  describe("ticket em aberto", () => {
    it("retorna emAberto=true e rotulo com 'aberto há'", () => {
      const r = calcularSla(daysAgo(1), daysAgo(1), "aberto", agora);
      expect(r.emAberto).toBe(true);
      expect(r.rotulo).toContain("aberto há");
    });

    it("sem alerta quando dentro do SLA (1 dia)", () => {
      const r = calcularSla(daysAgo(1), daysAgo(1), "atendimento", agora);
      expect(r.alerta).toBe(false);
    });

    it("alerta quando excede SLA_ALERTA_DIAS_UTEIS", () => {
      // 8 dias corridos a partir de segunda 22/06 = segunda 15/06 = 5 dias úteis
      const r = calcularSla(daysAgo(8), daysAgo(8), "aberto", agora);
      expect(r.alerta).toBe(true);
    });

    it("status 'atendimento' também acumula SLA", () => {
      const r = calcularSla(daysAgo(5), daysAgo(5), "atendimento", agora);
      expect(r.emAberto).toBe(true);
    });
  });

  describe("SLA_ALERTA_DIAS_UTEIS", () => {
    it("é um número positivo", () => {
      expect(SLA_ALERTA_DIAS_UTEIS).toBeGreaterThan(0);
    });
  });
});
