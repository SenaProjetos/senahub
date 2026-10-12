import { describe, expect, it } from "vitest";
import { assinaturaJaDevida } from "./assinatura-prazo";

const conta = (status: string, vencimento: string | null) => ({ status, vencimento });

describe("assinaturaJaDevida", () => {
  it("antes do dia do pagamento não cobra", () => {
    expect(assinaturaJaDevida(true, conta("previsto", "2026-11-06"), "2026-11-05")).toBe(false);
  });
  it("no dia do pagamento cobra", () => {
    expect(assinaturaJaDevida(true, conta("previsto", "2026-11-06"), "2026-11-06")).toBe(true);
  });
  it("depois do vencimento, com a conta ainda em aberto, continua cobrando", () => {
    expect(assinaturaJaDevida(true, conta("previsto", "2026-11-06"), "2026-11-20")).toBe(true);
  });
  it("conta paga antes do vencimento libera a cobrança", () => {
    expect(assinaturaJaDevida(true, conta("confirmado", "2026-11-06"), "2026-11-03")).toBe(true);
  });
  it("sem conta vinculada (folha antiga) ou conta apagada: cobra já", () => {
    expect(assinaturaJaDevida(false, null, "2026-11-01")).toBe(true);
    expect(assinaturaJaDevida(true, null, "2026-11-01")).toBe(true);
  });
  it("conta sem vencimento: cobra já", () => {
    expect(assinaturaJaDevida(true, conta("previsto", null), "2026-11-01")).toBe(true);
  });
});
