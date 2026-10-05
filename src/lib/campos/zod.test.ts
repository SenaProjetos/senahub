import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { CAMPOS } from "./index";
import { campo, campoZod } from "./zod";

const s = z.object({ cpf: campo.cpf(), tel: campo.telefone({ obrigatorio: true }), doc: campo.cpfCnpj({ legado: true }) });

describe("campo.<tipo>()", () => {
  it("normaliza o válido para o formato padrão", () => {
    const r = s.parse({ cpf: "52998224725", tel: "81999998888", doc: "11222333000181" });
    expect(r).toEqual({ cpf: "529.982.247-25", tel: "(81) 99999-8888", doc: "11.222.333/0001-81" });
  });
  it("estrito recusa o inválido com a mensagem do catálogo, no campo", () => {
    const r = s.safeParse({ cpf: "123", tel: "81999998888" });
    expect(r.success).toBe(false);
    expect(r.error?.flatten().fieldErrors.cpf).toEqual(["CPF inválido. Confira os 11 dígitos."]);
  });
  it("legado deixa passar o inválido sem mexer", () => {
    expect(s.parse({ tel: "81999998888", doc: " 123 " }).doc).toBe("123");
  });
  it("opcional: ausente fica ausente e vazio fica vazio (limpar o campo)", () => {
    const r = s.parse({ tel: "81999998888" });
    expect(r.cpf).toBeUndefined();
    expect(s.parse({ tel: "81999998888", cpf: "   " }).cpf).toBe("");
  });
  it("obrigatório recusa vazio", () => {
    const r = s.safeParse({ tel: "" });
    expect(r.error?.flatten().fieldErrors.tel).toEqual(["Campo obrigatório."]);
  });
  it("obrigatório ausente recusa com a mesma frase em português", () => {
    const r = s.safeParse({});
    expect(r.error?.flatten().fieldErrors.tel).toEqual(["Campo obrigatório."]);
  });
  it("mensagemObrigatorio troca a frase do vazio", () => {
    const r = campo.cep({ obrigatorio: true, mensagemObrigatorio: "Informe o CEP." }).safeParse("");
    expect(r.error?.issues[0]?.message).toBe("Informe o CEP.");
  });
  it("há uma fábrica para cada campo do catálogo", () => {
    expect(Object.keys(campo).sort()).toEqual(Object.keys(CAMPOS).sort());
  });
});

describe("tipos inferidos", () => {
  it("opcional vira chave opcional; obrigatório vira string", () => {
    expectTypeOf<z.infer<typeof s>>().toEqualTypeOf<{ cpf?: string | undefined; tel: string; doc?: string | undefined }>();
    expectTypeOf<z.input<typeof s>>().toEqualTypeOf<{ cpf?: string | undefined; tel: string; doc?: string | undefined }>();
  });
  it("campoZod segue as mesmas sobrecargas", () => {
    const o = z.object({ a: campoZod(CAMPOS.cep), b: campoZod(CAMPOS.cep, { obrigatorio: true }) });
    expectTypeOf<z.infer<typeof o>>().toEqualTypeOf<{ a?: string | undefined; b: string }>();
    expect(o.parse({ b: "01310100" })).toEqual({ b: "01310-100" });
  });
});

describe("teto de tamanho", () => {
  it("texto longo demais é recusado em português, mesmo no legado", () => {
    const longo = "1".repeat(201);
    expect(campo.cpf().safeParse(longo).error?.issues[0]?.message).toBe("Texto longo demais para este campo.");
    expect(campo.rg({ legado: true }).safeParse(longo).error?.issues[0]?.message).toBe("Texto longo demais para este campo.");
  });
});
