import { describe, expect, it } from "vitest";
import { avisoCobrancaContrato, type ContratoDeCobranca } from "./cobranca-contrato";

const contrato = (o: Partial<ContratoDeCobranca> = {}): ContratoDeCobranca => ({
  titulo: "Contrato Residencial Alfa",
  formaCobranca: "por_data",
  statusContrato: "assinado",
  parcelas: null,
  ...o,
});

describe("avisoCobrancaContrato", () => {
  it("sem contrato, nada a avisar", () => {
    expect(avisoCobrancaContrato([])).toBeNull();
  });

  it("contrato por entrega em vigor recusa — assinado ou ainda não", () => {
    for (const statusContrato of ["rascunho", "aguardando_assinatura", "assinado", "vencido"] as const) {
      const r = avisoCobrancaContrato([contrato({ formaCobranca: "por_entrega", statusContrato })]);
      expect(r?.nivel, statusContrato).toBe("recusa");
      expect(r?.texto).toContain("Contrato Residencial Alfa");
      expect(r?.texto).toContain("por entrega");
    }
  });

  it("contrato rescindido ou sem status não conta", () => {
    expect(avisoCobrancaContrato([contrato({ formaCobranca: "por_entrega", statusContrato: "rescindido" })])).toBeNull();
    expect(avisoCobrancaContrato([contrato({ formaCobranca: "por_entrega", statusContrato: null })])).toBeNull();
    expect(avisoCobrancaContrato([contrato({ parcelas: 3, statusContrato: "rescindido" })])).toBeNull();
  });

  it("contrato por data com plano definido só avisa; sem plano, cala", () => {
    expect(avisoCobrancaContrato([contrato({ parcelas: 3 })])?.nivel).toBe("aviso");
    expect(avisoCobrancaContrato([contrato({ parcelas: null })])).toBeNull();
  });

  it("por entrega tem prioridade sobre por data, e o texto cita o contrato certo", () => {
    const r = avisoCobrancaContrato([
      contrato({ titulo: "Por data", parcelas: 2 }),
      contrato({ titulo: "Por entrega", formaCobranca: "por_entrega" }),
    ]);
    expect(r?.nivel).toBe("recusa");
    expect(r?.texto).toContain("Por entrega");
    expect(r?.texto).not.toContain("Por data");
  });
});
