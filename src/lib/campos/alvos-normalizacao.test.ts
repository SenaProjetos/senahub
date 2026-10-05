import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAMPOS } from ".";
import { ALVOS, SO_RELATORIO, podeReescrever } from "../../../scripts/normalizar-campos-alvos";

const schema = readFileSync(path.resolve(__dirname, "../../../prisma/schema.prisma"), "utf8");

function bloco(modelo: string): string {
  const m = new RegExp(`^model ${modelo} \\{([\\s\\S]*?)^\\}`, "m").exec(schema);
  return m?.[1] ?? "";
}

describe("alvos do normalizar-campos existem no schema", () => {
  for (const [i, a] of [...ALVOS, ...SO_RELATORIO].entries()) {
    it(`${a.modelo} (${Object.keys(a.colunas).join(", ")}) #${i}`, () => {
      const b = bloco(a.modelo);
      expect(b, `model ${a.modelo} não existe`).not.toBe("");
      for (const col of Object.keys(a.colunas)) {
        expect(b, `${a.modelo}.${col}`).toMatch(new RegExp(`^\\s+${col}\\s+String`, "m"));
      }
      if (Object.values(a.colunas).includes("pix")) {
        expect(b, `${a.modelo}.pixTipo`).toMatch(/^\s+pixTipo\s+TipoPix/m);
      }
      for (const col of a.unicas ?? []) {
        expect(b, `${a.modelo}.${col} @unique`).toMatch(new RegExp(`^\\s+${col}\\s+String.*@unique`, "m"));
      }
      if (a.lixeira) {
        expect(b, `${a.modelo}.excluidoEm`).toMatch(/^\s+excluidoEm\s+DateTime\?/m);
      }
    });
  }

  it("o documento do cliente é só relatório (gravado só com dígitos)", () => {
    expect(ALVOS.some((a) => a.modelo === "Cliente" && "documento" in a.colunas)).toBe(false);
    expect(SO_RELATORIO.some((a) => a.modelo === "Cliente" && a.colunas.documento === "cpfCnpj")).toBe(true);
  });
});

describe("toda coluna @unique de um alvo está em `unicas`", () => {
  // Sem isto, um alvo novo com coluna única quebraria no meio da gravação (P2002) em vez de relatar a colisão.
  for (const [i, a] of ALVOS.entries()) {
    it(`${a.modelo} #${i}`, () => {
      const b = bloco(a.modelo);
      for (const col of Object.keys(a.colunas)) {
        if (new RegExp(`^\\s+${col}\\s+String.*@unique`, "m").test(b)) {
          expect(a.unicas ?? [], `${a.modelo}.${col} é @unique`).toContain(col);
        }
      }
    });
  }
});

describe("podeReescrever: só valor limpo é reescrito", () => {
  const NFE = "3520 0714 2001 6600 0187 5500 1000 0000 0465 5001 0007";

  it.each([
    ["cpf", "529 982 247 25"],
    ["cpf", "529.982.247-25"],
    ["cnpj", "11.444.777/0001-61"],
    ["cpfCnpj", "11444777000161"],
    ["cep", "01310-100"],
    ["chaveNfe", NFE],
    ["telefone", "+55 (81) 99999-8888"],
    ["telefone", "(81) 99999-8888"],
    ["telefone", "81999998888"],
    ["rg", "12.345.678-9"],
    ["rg", "1234567"],
    ["rg", " 1234567 "],
    ["rg", "12.345.678-X"],
    ["rg", "12345678x"],
    ["agencia", "1234-5"],
    ["agencia", "1234"],
    ["agencia", "1234-X"],
    ["conta", "12345-6"],
    ["conta", "12.345-6"],
    ["conta", "123456"],
    ["email", "  Fulano@Exemplo.COM "],
  ] as const)("%s %j → limpo", (tipo, valor) => {
    expect(podeReescrever(tipo, valor)).toBe(true);
  });

  it.each([
    ["telefone", "(81) 99999-9999 Maria"],
    ["telefone", "(55) 3333-4444 ramal 12"],
    ["telefone", "5533334444 12"],
    ["telefone", "81 99999-9999 / 81 3333-4444"],
    ["cep", "50000-000 Recife"],
    ["cpf", "123.456.789-09 (pai)"],
    ["cpfCnpj", "CNPJ 11.444.777/0001-61"],
    ["rg", "MG-12.345.678"],
    ["rg", "1234567 SSP/PE"],
    ["rg", "1234567 (SSP)"],
    ["rg", "1234567-SSP"],
    ["rg", "1234567 ÓRGÃO"],
    ["rg", "MG-12.345.678 SSP"],
    ["rg", "1234567/SSP"],
    ["agencia", "Ag.1234"],
    ["agencia", "1234 5"],
    ["conta", "013-12345-6"],
    ["conta", "013 12345-6"],
    ["conta", "CC12345-6"],
    ["conta", "12345-6(CC)"],
    ["conta", "X12345"],
  ] as const)("%s %j → revisar", (tipo, valor) => {
    expect(podeReescrever(tipo, valor)).toBe(false);
  });

  it("os casos de RG e conta seguros são válidos para o catálogo (sem a regra, seriam grudados)", () => {
    for (const [tipo, valor] of [["rg", "1234567 SSP/PE"], ["rg", "MG-12.345.678 SSP"], ["conta", "013 12345-6"], ["conta", "013-12345-6"]] as const) {
      expect(CAMPOS[tipo].validar(valor), `${tipo} ${valor}`).toBe(true);
      expect(CAMPOS[tipo].normalizar(valor), `${tipo} ${valor}`).not.toBe(valor.trim());
    }
  });

  it("chave PIX segue o tipo da linha", () => {
    expect(podeReescrever("pix", "529.982.247-25", "cpf")).toBe(true);
    expect(podeReescrever("pix", "529.982.247-25 (pai)", "cpf")).toBe(false);
    expect(podeReescrever("pix", "+55 (81) 99999-8888", "telefone")).toBe(true);
    expect(podeReescrever("pix", "(55) 3333-4444 ramal 12", "telefone")).toBe(false);
    expect(podeReescrever("pix", "5581999998888", "telefone")).toBe(false);
    expect(podeReescrever("pix", "Fulano@Exemplo.com", "email")).toBe(true);
    expect(podeReescrever("pix", "123E4567-E89B-12D3-A456-426614174000", "aleatoria")).toBe(true);
  });
});
