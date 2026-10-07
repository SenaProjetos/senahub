import { describe, expect, it } from "vitest";
import { ActionError } from "@/lib/action-error";
import { exigirCamposValidos } from "./exigir";

const mapa = { documento: "cpfCnpj", telefone: "telefone" } as const;

function erro(fn: () => void): ActionError | undefined {
  try {
    fn();
  } catch (e) {
    return e as ActionError;
  }
  return undefined;
}

describe("exigirCamposValidos", () => {
  it("válido passa", () => {
    expect(erro(() => exigirCamposValidos({ documento: "529.982.247-25" }, null, mapa))).toBeUndefined();
  });
  it("vazio passa", () => {
    expect(erro(() => exigirCamposValidos({ documento: "", telefone: undefined }, null, mapa))).toBeUndefined();
  });
  it("inválido igual ao gravado passa, mesmo com outra pontuação", () => {
    expect(erro(() => exigirCamposValidos({ documento: "123.456.789-00" }, { documento: "12345678900" }, mapa))).toBeUndefined();
  });
  it("inválido diferente do gravado é recusado, no campo", () => {
    const e = erro(() => exigirCamposValidos({ documento: "123.456.789-01" }, { documento: "12345678900" }, mapa));
    expect(e).toBeInstanceOf(ActionError);
    expect(e?.campos).toEqual({ documento: "CPF ou CNPJ inválido. Confira os dígitos." });
  });
  it("inválido sem registro anterior (criar) é recusado", () => {
    expect(erro(() => exigirCamposValidos({ telefone: "123" }, null, mapa))?.campos).toHaveProperty("telefone");
  });
  it("lixo diferente com a mesma essência vazia não passa por 'igual'", () => {
    expect(erro(() => exigirCamposValidos({ documento: "xyz" }, { documento: "abc" }, mapa))).toBeInstanceOf(ActionError);
  });
});
