import { describe, expect, it } from "vitest";
import { CAMPOS } from "./index";
import { aplicarEdicao } from "./edicao";

const cpf = CAMPOS.cpf;
const tel = CAMPOS.telefone;

describe("aplicarEdicao", () => {
  it("digitando no fim, o cursor fica depois do último dígito (pulando a pontuação nova)", () => {
    expect(aplicarEdicao(cpf, { anterior: "123", digitado: "1234", cursor: 4 })).toEqual({ texto: "123.4", cursor: 5 });
  });
  it("digitando no meio, o cursor fica logo depois do dígito digitado", () => {
    expect(aplicarEdicao(cpf, { anterior: "123.456.789-09", digitado: "1203.456.789-09", cursor: 3 })).toEqual({
      texto: "120.345.678-90",
      cursor: 3,
    });
  });
  it("backspace logo depois da pontuação apaga o dígito anterior (não trava)", () => {
    expect(
      aplicarEdicao(cpf, { anterior: "123.456", digitado: "123456", cursor: 3, inputType: "deleteContentBackward" }),
    ).toEqual({ texto: "124.56", cursor: 2 });
  });
  it("delete logo antes da pontuação apaga o dígito seguinte", () => {
    expect(
      aplicarEdicao(cpf, { anterior: "123.456", digitado: "123456", cursor: 3, inputType: "deleteContentForward" }),
    ).toEqual({ texto: "123.56", cursor: 3 });
  });
  it("letra num CPF não entra e o cursor não anda", () => {
    expect(aplicarEdicao(cpf, { anterior: "123", digitado: "12a3", cursor: 3 })).toEqual({ texto: "123", cursor: 2 });
  });
  it("colar telefone com +55 no campo vazio formata e põe o cursor no fim", () => {
    const r = aplicarEdicao(tel, { anterior: "", digitado: "+55 81 99999-8888", cursor: 17 });
    expect(r.texto).toBe("(81) 99999-8888");
    expect(r.cursor).toBe(r.texto.length);
  });
  it("cursor no começo continua no começo", () => {
    expect(aplicarEdicao(tel, { anterior: "(81) 9", digitado: "(81) 9", cursor: 0 }).cursor).toBe(0);
  });
});
