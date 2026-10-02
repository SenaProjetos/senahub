import { describe, expect, it } from "vitest";
import {
  agruparAvisosDePagar,
  CONFIG_AVISOS_PADRAO,
  cobrancaDeHoje,
  corpoDoAvisoDePagar,
  diasAteVencer,
  frasesDoVencimento,
  normalizarConfigAvisos,
  pagarDeHoje,
  type ContaVencendo,
} from "@/modules/financeiro/avisos/regras";

const tudoLigado = { cobrancaAntes: true, diasAntes: 3, cobrancaNoDia: true, cobrancaApos: true };

describe("dias até vencer", () => {
  it("conta dia-calendário, também na virada do mês e do ano", () => {
    expect(diasAteVencer("2026-10-02", "2026-10-05")).toBe(3);
    expect(diasAteVencer("2026-10-05", "2026-10-05")).toBe(0);
    expect(diasAteVencer("2026-10-06", "2026-10-05")).toBe(-1);
    expect(diasAteVencer("2026-12-30", "2027-01-02")).toBe(3);
  });
});

describe("cobrança ao cliente", () => {
  it("antes, no dia e depois — cada uma só no seu dia", () => {
    expect(cobrancaDeHoje("2026-10-02", "2026-10-05", tudoLigado)).toBe("cobranca_antes");
    expect(cobrancaDeHoje("2026-10-05", "2026-10-05", tudoLigado)).toBe("cobranca_no_dia");
    expect(cobrancaDeHoje("2026-10-06", "2026-10-05", tudoLigado)).toBe("cobranca_apos");
    expect(cobrancaDeHoje("2026-10-03", "2026-10-05", tudoLigado)).toBeNull();
    expect(cobrancaDeHoje("2026-10-07", "2026-10-05", tudoLigado)).toBeNull();
  });
  it("o que está desligado não sai", () => {
    expect(cobrancaDeHoje("2026-10-02", "2026-10-05", { ...tudoLigado, cobrancaAntes: false })).toBeNull();
    expect(cobrancaDeHoje("2026-10-05", "2026-10-05", { ...tudoLigado, cobrancaNoDia: false })).toBeNull();
    expect(cobrancaDeHoje("2026-10-06", "2026-10-05", { ...tudoLigado, cobrancaApos: false })).toBeNull();
  });
  it("os dias de antecedência são configuráveis", () => {
    expect(cobrancaDeHoje("2026-10-04", "2026-10-05", { ...tudoLigado, diasAntes: 1 })).toBe("cobranca_antes");
    expect(cobrancaDeHoje("2026-10-02", "2026-10-05", { ...tudoLigado, diasAntes: 1 })).toBeNull();
  });
  it("o padrão não manda e-mail novo para fora: só o D+1 que já existia", () => {
    expect(cobrancaDeHoje("2026-10-02", "2026-10-05", CONFIG_AVISOS_PADRAO)).toBeNull();
    expect(cobrancaDeHoje("2026-10-05", "2026-10-05", CONFIG_AVISOS_PADRAO)).toBeNull();
    expect(cobrancaDeHoje("2026-10-06", "2026-10-05", CONFIG_AVISOS_PADRAO)).toBe("cobranca_apos");
  });
});

describe("contas a pagar vencendo", () => {
  it("D-3 e D-1, nada em D-2 nem no dia", () => {
    expect(pagarDeHoje("2026-10-02", "2026-10-05")).toBe("pagar_d3");
    expect(pagarDeHoje("2026-10-04", "2026-10-05")).toBe("pagar_d1");
    expect(pagarDeHoje("2026-10-03", "2026-10-05")).toBeNull();
    expect(pagarDeHoje("2026-10-05", "2026-10-05")).toBeNull();
  });
  const c = (id: string, autorId: string, valor: number, tipo: ContaVencendo["tipo"]): ContaVencendo => ({ id, autorId, valor, descricao: id, tipo });
  it("uma notificação por pessoa, somando D-1 e D-3", () => {
    const r = agruparAvisosDePagar(
      [c("a", "u1", 100_00, "pagar_d1"), c("b", "u1", 50_00, "pagar_d1"), c("c", "u1", 80_00, "pagar_d3"), c("d", "u2", 10_00, "pagar_d3")],
      (id) => [id],
    );
    expect(r).toHaveLength(2);
    const u1 = r.find((x) => x.destinatarioId === "u1")!;
    expect(u1.d1).toEqual({ quantidade: 2, valor: 150_00 });
    expect(u1.d3).toEqual({ quantidade: 1, valor: 80_00 });
    expect(u1.ids).toEqual(["a", "b", "c"]);
  });
  it("conta de quem não vê o financeiro vai para os gestores; sem destino, ninguém recebe", () => {
    const r = agruparAvisosDePagar([c("a", "projetista", 100_00, "pagar_d1"), c("b", "fantasma", 1_00, "pagar_d1")], (id) => (id === "projetista" ? ["gestor1", "gestor2"] : null));
    expect(r.map((x) => x.destinatarioId).sort()).toEqual(["gestor1", "gestor2"]);
    expect(r.every((x) => x.ids.length === 1 && x.ids[0] === "a")).toBe(true);
  });
  it("texto do sino", () => {
    expect(corpoDoAvisoDePagar({ d1: { quantidade: 2, valor: 120_000 }, d3: { quantidade: 1, valor: 80_000 } })).toContain("2 vencem amanhã");
    expect(corpoDoAvisoDePagar({ d1: { quantidade: 2, valor: 120_000 }, d3: { quantidade: 1, valor: 80_000 } })).toContain("1 vence em 3 dias");
    expect(corpoDoAvisoDePagar({ d1: { quantidade: 0, valor: 0 }, d3: { quantidade: 4, valor: 1 } })).toBe("4 vencem em 3 dias (R$ 0,01)");
  });
});

describe("config", () => {
  it("campo inválido ou ausente volta ao padrão, campo bom fica", () => {
    expect(normalizarConfigAvisos(null)).toEqual(CONFIG_AVISOS_PADRAO);
    expect(normalizarConfigAvisos({ cobrancaAntes: true, diasAntes: 99 })).toEqual({ ...CONFIG_AVISOS_PADRAO, cobrancaAntes: true });
    expect(normalizarConfigAvisos({ diasAntes: 5, cobrancaApos: false })).toEqual({ ...CONFIG_AVISOS_PADRAO, diasAntes: 5, cobrancaApos: false });
  });
  it("frases do e-mail", () => {
    expect(frasesDoVencimento("cobranca_antes", 3)).toBe("vence em 3 dias");
    expect(frasesDoVencimento("cobranca_antes", 1)).toBe("vence amanhã");
    expect(frasesDoVencimento("cobranca_no_dia", 3)).toBe("vence hoje");
    expect(frasesDoVencimento("cobranca_apos", 3)).toBe("venceu ontem");
  });
});
