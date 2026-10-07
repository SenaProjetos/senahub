import { describe, expect, it } from "vitest";
import { ActionError } from "@/lib/action-error";
import { normalizarConta } from "./service";

function erro(fn: () => unknown): ActionError | undefined {
  try {
    fn();
  } catch (e) {
    return e as ActionError;
  }
  return undefined;
}

describe("normalizarConta: chave PIX", () => {
  it("válida vai no formato do BACEN", () => {
    expect(normalizarConta({ pixTipo: "cpf", pixChave: "529.982.247-25" }).pixChave).toBe("52998224725");
    expect(normalizarConta({ pixTipo: "telefone", pixChave: "(31) 99999-8888" }).pixChave).toBe("+5531999998888");
  });

  it("inválida nova é recusada com a frase no campo pixChave", () => {
    const e = erro(() => normalizarConta({ pixTipo: "cpf", pixChave: "123" }));
    expect(e).toBeInstanceOf(ActionError);
    expect(e?.message).toBe("CPF deve ter 11 dígitos.");
    expect(e?.campos).toEqual({ pixChave: "CPF deve ter 11 dígitos." });
  });

  it("chave com outro texto junto é recusada ao criar", () => {
    expect(erro(() => normalizarConta({ pixTipo: "cpf", pixChave: "529.982.247-25 (pai)" }))?.campos).toHaveProperty("pixChave");
  });

  it("inválida que já estava gravada, mesmo tipo, passa e fica exatamente como estava (D4)", () => {
    const gravado = { pixTipo: "telefone" as const, pixChave: "(55) 3333-4444 ramal 12" };
    expect(normalizarConta({ banco: "X", pixTipo: "telefone", pixChave: "(55) 3333-4444 ramal 12" }, gravado).pixChave).toBe(
      "(55) 3333-4444 ramal 12",
    );
    expect(normalizarConta({ pixTipo: "cpf", pixChave: " 123456 " }, { pixTipo: "cpf", pixChave: "123456" }).pixChave).toBe("123456");
  });

  it("inválida gravada não vale para outro tipo nem para outro valor", () => {
    const gravado = { pixTipo: "cpf" as const, pixChave: "123" };
    expect(erro(() => normalizarConta({ pixTipo: "cnpj", pixChave: "123" }, gravado))).toBeInstanceOf(ActionError);
    expect(erro(() => normalizarConta({ pixTipo: "cpf", pixChave: "124" }, gravado))).toBeInstanceOf(ActionError);
  });
});
