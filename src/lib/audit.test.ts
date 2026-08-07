import { describe, expect, it } from "vitest";
import { sanitize } from "./audit";

const red = "[redacted]";

describe("sanitize — campos sensíveis", () => {
  it("redige credenciais por substring", () => {
    expect(sanitize({ password: "x", senhaAtual: "y", accessToken: "z", secretKey: "w", hashSha256: "h" })).toEqual({
      password: red, senhaAtual: red, accessToken: red, secretKey: red, hashSha256: red,
    });
  });

  it("redige salário em qualquer variante", () => {
    expect(sanitize({ salarioBase: 5000, salário: 1, remuneracao: 2 })).toEqual({
      salarioBase: red, salário: red, remuneracao: 2,
    });
  });

  it("redige dados bancários e documentos do colaborador", () => {
    expect(sanitize({ banco: "001", agencia: "1234", conta: "56789-0", cpf: "12345678901", rg: "MG-1" })).toEqual({
      banco: red, agencia: red, conta: red, cpf: red, rg: red,
    });
  });

  it("redige PIX por substring — cobre pixTipo e pixChave", () => {
    expect(sanitize({ pixChave: "a@b.c", pixTipo: "email", pix: "x" })).toEqual({
      pixChave: red, pixTipo: red, pix: red,
    });
  });

  it("NÃO redige campos do financeiro/custos que só contêm o radical", () => {
    // Estes precisam continuar auditáveis: são ids e rótulos, não dado bancário de pessoa.
    const entrada = {
      contaId: "c1", contaBancariaId: "cb1", contatoEmergenciaNome: "Maria",
      bancoId: "b1", bancoHoras: 12, contaTransferenciaId: "c2", formaId: "f1",
    };
    expect(sanitize(entrada)).toEqual(entrada);
  });

  it("é recursivo — cobre o par { antes, novo } do capturarAntes", () => {
    expect(
      sanitize({ antes: { cpf: "111", nome: "Ana" }, novo: { cpf: "222", nome: "Ana Maria" } }),
    ).toEqual({ antes: { cpf: red, nome: "Ana" }, novo: { cpf: red, nome: "Ana Maria" } });
  });

  it("percorre arrays de objetos", () => {
    expect(sanitize([{ banco: "001" }, { nome: "ok" }])).toEqual([{ banco: red }, { nome: "ok" }]);
  });

  it("ignora caixa da chave", () => {
    expect(sanitize({ CPF: "1", Banco: "2", Conta: "3" })).toEqual({ CPF: red, Banco: red, Conta: red });
  });

  it("devolve primitivos e null sem alteração", () => {
    expect(sanitize(null)).toBeNull();
    expect(sanitize("texto")).toBe("texto");
    expect(sanitize(42)).toBe(42);
  });
});
