import { describe, expect, it } from "vitest";
import { validarChavePix, formatarChavePix } from "./pix";

/** CPF/CNPJ com dígitos verificadores corretos (gerados p/ teste, não são de pessoas reais). */
const CPF_OK = "52998224725";
const CNPJ_OK = "11222333000181";

describe("validarChavePix — CPF", () => {
  it("aceita com e sem máscara e normaliza para só dígitos", () => {
    expect(validarChavePix("cpf", "529.982.247-25")).toEqual({ ok: true, chave: CPF_OK });
    expect(validarChavePix("cpf", CPF_OK)).toEqual({ ok: true, chave: CPF_OK });
  });

  it("recusa dígito verificador errado", () => {
    const r = validarChavePix("cpf", "52998224726");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toBe("CPF inválido.");
  });

  it("recusa quantidade errada de dígitos", () => {
    const r = validarChavePix("cpf", "1234567890");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("11 dígitos");
  });
});

describe("validarChavePix — CNPJ", () => {
  it("aceita com máscara", () => {
    expect(validarChavePix("cnpj", "11.222.333/0001-81")).toEqual({ ok: true, chave: CNPJ_OK });
  });

  it("recusa inválido", () => {
    expect(validarChavePix("cnpj", "11222333000182").ok).toBe(false);
  });
});

describe("validarChavePix — e-mail", () => {
  it("normaliza para minúscula", () => {
    expect(validarChavePix("email", "  Ana.Silva@Empresa.COM  ")).toEqual({
      ok: true, chave: "ana.silva@empresa.com",
    });
  });

  it("recusa sem @ ou sem domínio", () => {
    expect(validarChavePix("email", "ana.empresa.com").ok).toBe(false);
    expect(validarChavePix("email", "ana@empresa").ok).toBe(false);
  });

  it("recusa acima de 77 caracteres (limite do BACEN)", () => {
    const longo = `${"a".repeat(70)}@empresa.com`;
    const r = validarChavePix("email", longo);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("77");
  });
});

describe("validarChavePix — telefone", () => {
  it("normaliza os três formatos aceitos para +55DDD…", () => {
    expect(validarChavePix("telefone", "(31) 99999-8888")).toEqual({ ok: true, chave: "+5531999998888" });
    expect(validarChavePix("telefone", "31999998888")).toEqual({ ok: true, chave: "+5531999998888" });
    expect(validarChavePix("telefone", "+55 31 99999-8888")).toEqual({ ok: true, chave: "+5531999998888" });
  });

  it("aceita fixo de 8 dígitos", () => {
    expect(validarChavePix("telefone", "3133334444")).toEqual({ ok: true, chave: "+553133334444" });
  });

  it("recusa DDD inexistente", () => {
    const r = validarChavePix("telefone", "0199999888");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toBe("DDD inválido.");
  });

  it("recusa celular de 9 dígitos que não começa com 9", () => {
    const r = validarChavePix("telefone", "31899998888");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("começar com 9");
  });

  it("recusa comprimento errado", () => {
    expect(validarChavePix("telefone", "999998888").ok).toBe(false);
  });
});

describe("validarChavePix — aleatória", () => {
  it("aceita UUID e normaliza a caixa", () => {
    expect(validarChavePix("aleatoria", "3F2504E0-4F89-41D3-9A0C-0305E82C3301")).toEqual({
      ok: true, chave: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    });
  });

  it("recusa UUID sem hífens ou truncado", () => {
    expect(validarChavePix("aleatoria", "3f2504e04f8941d39a0c0305e82c3301").ok).toBe(false);
    expect(validarChavePix("aleatoria", "3f2504e0-4f89-41d3-9a0c").ok).toBe(false);
  });
});

describe("validarChavePix — vazio", () => {
  it("recusa string vazia ou só espaços em qualquer tipo", () => {
    for (const t of ["cpf", "cnpj", "email", "telefone", "aleatoria"] as const) {
      const r = validarChavePix(t, "   ");
      expect(r.ok, t).toBe(false);
      if (!r.ok) expect(r.erro).toBe("Informe a chave PIX.");
    }
  });
});

describe("formatarChavePix", () => {
  it("aplica máscara de exibição por tipo", () => {
    expect(formatarChavePix("cpf", CPF_OK)).toBe("529.982.247-25");
    expect(formatarChavePix("cnpj", CNPJ_OK)).toBe("11.222.333/0001-81");
    expect(formatarChavePix("telefone", "+5531999998888")).toBe("(31) 99999-8888");
    expect(formatarChavePix("telefone", "+553133334444")).toBe("(31) 3333-4444");
  });

  it("deixa e-mail e aleatória como estão", () => {
    expect(formatarChavePix("email", "a@b.com")).toBe("a@b.com");
    expect(formatarChavePix("aleatoria", "3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(
      "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    );
  });
});
