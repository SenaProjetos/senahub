import { describe, expect, it } from "vitest";
import { ActionError } from "@/lib/action-error";
import { prepararAlteracoes, SELECT_FORMATADOS } from "./alteracoes";

function erro(fn: () => unknown): ActionError | undefined {
  try {
    fn();
  } catch (e) {
    return e as ActionError;
  }
  return undefined;
}

describe("prepararAlteracoes (Minha ficha → Editar meus dados)", () => {
  it("só whitelist, aparado, e os campos com formato no formato padrão", () => {
    const r = prepararAlteracoes(
      { telefone: " 81999998888 ", emailPessoal: "Ana@Empresa.COM", enderecoCep: "01310100", enderecoBairro: " Centro ", salario: "999" },
      null,
    );
    expect(r).toEqual({ telefone: "(81) 99999-8888", emailPessoal: "ana@empresa.com", enderecoCep: "01310-100", enderecoBairro: "Centro" });
  });

  it("vazio continua vazio (limpar o campo)", () => {
    expect(prepararAlteracoes({ telefoneEmergencia: "  " }, null)).toEqual({ telefoneEmergencia: "" });
  });

  it("inválido novo é recusado no campo", () => {
    const e = erro(() => prepararAlteracoes({ telefoneEmergencia: "123" }, { telefoneEmergencia: null }));
    expect(e).toBeInstanceOf(ActionError);
    expect(e?.campos).toHaveProperty("telefoneEmergencia");
  });

  it("inválido igual ao gravado passa como está (D4), sem reescrever", () => {
    const gravado = { telefone: "(55) 3333-4444 ramal 12" };
    expect(prepararAlteracoes({ telefone: "(55) 3333-4444 ramal 12" }, gravado)).toEqual({ telefone: "(55) 3333-4444 ramal 12" });
  });

  it("na aprovação a frase leva o nome do campo", () => {
    const e = erro(() => prepararAlteracoes({ enderecoCep: "123" }, null, { comRotulo: true }));
    expect(e?.message).toMatch(/^CEP: CEP inválido/);
    expect(e?.campos).toHaveProperty("enderecoCep");
  });

  it("o select cobre todos os campos com formato", () => {
    expect(Object.keys(SELECT_FORMATADOS).sort()).toEqual(["emailPessoal", "enderecoCep", "telefone", "telefoneEmergencia"]);
  });
});
