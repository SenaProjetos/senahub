import { describe, it, expect } from "vitest";
import { brl, brlInteiro, formatarData, formatarDataHora, formatarMesCurto, formatarDiaMes } from "@/lib/utils";

// normaliza espaço estreito/insecável que o Intl usa em pt-BR
const norm = (s: string) => s.replace(/ | /g, " ");

describe("brl", () => {
  it("formata real com 2 casas e separadores pt-BR", () => {
    expect(norm(brl(81000))).toBe("R$ 81.000,00");
    expect(norm(brl(1234.5))).toBe("R$ 1.234,50");
    expect(norm(brl(0))).toBe("R$ 0,00");
  });
});

describe("brlInteiro", () => {
  it("formata real sem centavos", () => {
    expect(norm(brlInteiro(81000))).toBe("R$ 81.000");
    expect(norm(brlInteiro(1234.9))).toBe("R$ 1.235");
  });
});

describe("formatarData", () => {
  it("formata Date como dd/mm/aaaa", () => {
    expect(formatarData(new Date(2026, 5, 7))).toBe("07/06/2026");
  });
  it("parseia string yyyy-mm-dd sem shift de timezone", () => {
    expect(formatarData("2026-06-07")).toBe("07/06/2026");
  });
  it("retorna '' para valor inválido/nulo", () => {
    expect(formatarData(null)).toBe("");
    expect(formatarData(undefined)).toBe("");
    expect(formatarData("x</")).toBe("");
  });
  it("não perde um dia com Date em meia-noite UTC (retorno de campo @db.Date do Prisma)", () => {
    expect(formatarData(new Date(Date.UTC(2026, 6, 9)))).toBe("09/07/2026");
  });
});

describe("formatarDataHora", () => {
  it("inclui hora:minuto", () => {
    expect(formatarDataHora(new Date(2026, 5, 7, 14, 30))).toBe("07/06/2026 14:30");
  });
  it("retorna '' para inválido", () => {
    expect(formatarDataHora(null)).toBe("");
  });
});

describe("formatarMesCurto / formatarDiaMes", () => {
  it("mês curto sem ponto", () => {
    expect(formatarMesCurto(new Date(2026, 5, 7))).toBe("jun");
  });
  it("dia/mês 2 dígitos", () => {
    expect(formatarDiaMes(new Date(2026, 5, 7))).toBe("07/06");
  });
});
