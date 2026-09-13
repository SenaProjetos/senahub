import { describe, it, expect } from "vitest";
import { z } from "zod";
import { contaPagamento, dataPagamento, formaPagamento } from "@/modules/financeiro/folha/schemas";
import { MSG_CONTA_OBRIGATORIA } from "@/modules/financeiro/folha/status";

// Mesma forma dos schemas das três actions de efetivar (individual, lote, selecionados).
const efetivar = z.object({ contaId: contaPagamento, formaId: formaPagamento, data: dataPagamento });

describe("schemas de efetivar pagamento", () => {
  it("conta vazia é recusada com a mensagem de campo (N3)", () => {
    const r = efetivar.safeParse({ contaId: "", formaId: "", data: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.flatten().fieldErrors.contaId).toEqual([MSG_CONTA_OBRIGATORIA]);
  });
  it("conta ausente também é recusada", () => {
    expect(efetivar.safeParse({ formaId: "", data: "" }).success).toBe(false);
  });
  it("forma e data opcionais: vazio passa", () => {
    expect(efetivar.safeParse({ contaId: "c1", formaId: "", data: "" }).success).toBe(true);
    expect(efetivar.safeParse({ contaId: "c1" }).success).toBe(true);
  });
  it("data fora de yyyy-mm-dd vira erro do campo data", () => {
    const r = efetivar.safeParse({ contaId: "c1", data: "11/09/2026" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.flatten().fieldErrors.data).toEqual(["Data inválida."]);
  });
  it("data do input date passa", () => {
    expect(efetivar.safeParse({ contaId: "c1", data: "2026-09-11" }).success).toBe(true);
  });
});
