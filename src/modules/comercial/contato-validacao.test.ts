import { describe, expect, it } from "vitest";
import {
  canalEhIndicacao,
  emailValido,
  formatarTelefoneEntrada,
  normalizarEmail,
  telefoneValido,
} from "./contato-validacao";

describe("emailValido", () => {
  it("aceita e-mail comum e vazio (campo opcional)", () => {
    expect(emailValido("joao@empresa.com.br")).toBe(true);
    expect(emailValido("  joao@empresa.com  ")).toBe(true);
    expect(emailValido("")).toBe(true);
  });

  it("recusa o que não tem cara de e-mail", () => {
    for (const ruim of ["joao", "joao@", "@empresa.com", "joao@empresa", "joao empresa@x.com"]) {
      expect(emailValido(ruim)).toBe(false);
    }
  });

  it("normaliza para caixa-baixa e sem espaço nas pontas", () => {
    expect(normalizarEmail("  Joao@Empresa.COM ")).toBe("joao@empresa.com");
  });
});

describe("formatarTelefoneEntrada", () => {
  it("monta a máscara enquanto digita, celular e fixo", () => {
    expect(formatarTelefoneEntrada("8")).toBe("(8");
    expect(formatarTelefoneEntrada("81")).toBe("(81");
    expect(formatarTelefoneEntrada("819")).toBe("(81) 9");
    expect(formatarTelefoneEntrada("81999")).toBe("(81) 999");
    expect(formatarTelefoneEntrada("8133334444")).toBe("(81) 3333-4444");
    expect(formatarTelefoneEntrada("81999998888")).toBe("(81) 99999-8888");
  });

  it("descarta o +55 colado em vez de cortar o número no meio", () => {
    expect(formatarTelefoneEntrada("+55 81 99999-8888")).toBe("(81) 99999-8888");
    expect(formatarTelefoneEntrada("5581999998888")).toBe("(81) 99999-8888");
  });

  it("não passa de 11 dígitos e aceita vazio", () => {
    expect(formatarTelefoneEntrada("819999988889999")).toBe("(81) 99999-8888");
    expect(formatarTelefoneEntrada("")).toBe("");
  });
});

describe("telefoneValido", () => {
  it("aceita celular (9 após o DDD), fixo e vazio", () => {
    expect(telefoneValido("(81) 99999-8888")).toBe(true);
    expect(telefoneValido("81999998888")).toBe(true);
    expect(telefoneValido("(81) 3333-4444")).toBe(true);
    expect(telefoneValido("+55 81 99999-8888")).toBe(true);
    expect(telefoneValido("")).toBe(true);
  });

  it("recusa tamanho errado, DDD inexistente e celular sem o 9", () => {
    expect(telefoneValido("999")).toBe(false);
    expect(telefoneValido("(81) 9999-888")).toBe(false);
    expect(telefoneValido("(01) 99999-8888")).toBe(false);
    expect(telefoneValido("(81) 89999-8888")).toBe(false);
    expect(telefoneValido("(81) 9333-4444")).toBe(false);
  });
});

describe("canalEhIndicacao", () => {
  it("reconhece o canal do seed, com ou sem acento e caixa", () => {
    expect(canalEhIndicacao("Indicação")).toBe(true);
    expect(canalEhIndicacao("INDICACAO")).toBe(true);
    expect(canalEhIndicacao("Indicação de parceiro")).toBe(true);
  });

  it("não confunde com os outros canais", () => {
    for (const nome of ["Site", "LinkedIn / Sales Navigator", "Cliente recorrente", "Prospecção ativa", "Outro"]) {
      expect(canalEhIndicacao(nome)).toBe(false);
    }
    expect(canalEhIndicacao(null)).toBe(false);
    expect(canalEhIndicacao(undefined)).toBe(false);
  });
});
