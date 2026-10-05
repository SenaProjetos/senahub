import { describe, expect, it } from "vitest";
import { CAMPOS, campoDe, exibicaoInicial, mensagemDe, variantesDoValor } from "./index";

describe("campoDe", () => {
  it("devolve o tipo do catálogo", () => {
    expect(campoDe("cpf")).toBe(CAMPOS.cpf);
  });
  it("chavePix sem tipo vira texto livre (campo desabilitado até escolher o tipo)", () => {
    const c = campoDe("chavePix");
    expect(c.mascarar("qualquer coisa")).toBe("qualquer coisa");
    expect(c.validar("qualquer coisa")).toBe(true);
  });
  it("chavePix com tipo usa a regra do PIX", () => {
    expect(campoDe("chavePix", "cpf").validar("123")).toBe(false);
  });
});

describe("mensagemDe", () => {
  it("prefere o motivo específico", () => {
    expect(mensagemDe(campoDe("chavePix", "cpf"), "123")).toBe("CPF deve ter 11 dígitos.");
    expect(mensagemDe(CAMPOS.cpf, "123")).toBe(CAMPOS.cpf.mensagem);
  });
});

describe("exibicaoInicial", () => {
  it("valor válido aparece mascarado", () => {
    expect(exibicaoInicial(CAMPOS.cpf, "52998224725")).toBe("529.982.247-25");
    expect(exibicaoInicial(campoDe("chavePix", "telefone"), "+5531999998888")).toBe("(31) 99999-8888");
  });
  it("legado inválido aparece mascarado se a máscara não perde nada", () => {
    expect(exibicaoInicial(CAMPOS.cpf, "1234567890")).toBe("123.456.789-0");
  });
  it("legado que a máscara apagaria aparece como está", () => {
    expect(exibicaoInicial(CAMPOS.cpf, "não tem")).toBe("não tem");
    expect(exibicaoInicial(CAMPOS.telefone, "ramal 22")).toBe("ramal 22");
  });
});

describe("variantesDoValor", () => {
  it("formato padrão, só dígitos e o texto como veio, sem repetir", () => {
    expect(variantesDoValor(CAMPOS.cnpj, "11222333000181")).toEqual(["11.222.333/0001-81", "11222333000181"]);
    expect(variantesDoValor(CAMPOS.cnpj, "11.222.333/0001-81")).toEqual(["11.222.333/0001-81", "11222333000181"]);
  });
});
