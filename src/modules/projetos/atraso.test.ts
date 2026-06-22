import { describe, it, expect } from "vitest";
import { diasDeAtraso } from "./atraso";

const hoje = new Date("2026-06-22T12:00:00Z");

function prazo(diasRelativo: number): Date {
  const d = new Date(hoje);
  d.setDate(d.getDate() + diasRelativo);
  return d;
}

describe("diasDeAtraso", () => {
  describe("sem atraso", () => {
    it("retorna 0 para prazo hoje", () => {
      expect(diasDeAtraso(prazo(0), "em_andamento", hoje)).toBe(0);
    });

    it("retorna 0 para prazo futuro", () => {
      expect(diasDeAtraso(prazo(5), "em_andamento", hoje)).toBe(0);
    });

    it("retorna 0 para status entregue mesmo com prazo vencido", () => {
      expect(diasDeAtraso(prazo(-10), "entregue", hoje)).toBe(0);
    });

    it("retorna 0 para status aprovado mesmo com prazo vencido", () => {
      expect(diasDeAtraso(prazo(-10), "aprovado", hoje)).toBe(0);
    });

    it("retorna 0 para prazo null", () => {
      expect(diasDeAtraso(null, "em_andamento", hoje)).toBe(0);
    });

    it("retorna 0 para prazo undefined", () => {
      expect(diasDeAtraso(undefined, "em_andamento", hoje)).toBe(0);
    });

    it("retorna 0 para string de data inválida", () => {
      expect(diasDeAtraso("not-a-date", "em_andamento", hoje)).toBe(0);
    });
  });

  describe("com atraso", () => {
    it("retorna 1 para prazo ontem", () => {
      expect(diasDeAtraso(prazo(-1), "em_andamento", hoje)).toBe(1);
    });

    it("retorna 7 para prazo há 7 dias", () => {
      expect(diasDeAtraso(prazo(-7), "em_andamento", hoje)).toBe(7);
    });

    it("aceita prazo como string ISO (com hora)", () => {
      // toISOString() usa UTC mas mantém o mesmo dia local que prazo(-7)
      expect(diasDeAtraso(prazo(-7).toISOString(), "em_andamento", hoje)).toBe(7);
    });

    it("calcula em dias-calendário, não horas", () => {
      // prazo exatamente 1 dia antes (sem considerar horas)
      const p = new Date("2026-06-21T23:59:59Z");
      expect(diasDeAtraso(p, "em_andamento", hoje)).toBe(1);
    });
  });

  describe("outros status abertos", () => {
    const statusAbertos = ["iniciado", "em_revisao", "aguardando"] as const;
    for (const s of statusAbertos) {
      it(`acumula atraso para status '${s}'`, () => {
        expect(diasDeAtraso(prazo(-3), s as Parameters<typeof diasDeAtraso>[1], hoje)).toBe(3);
      });
    }
  });
});
