import { describe, expect, it } from "vitest";
import { TIPOS_PIX } from "@/modules/rh/contas/pix";
import { CAMPOS, type TipoCampo } from "./index";
import { campoPix } from "./chave-pix";

/** Entradas de todo tipo: parciais, completas, coladas com pontuação, com letras e lixo. */
const ENTRADAS = [
  "", " ", "5", "52", "529", "5299", "529982", "52998224725", "529.982.247-25", "11222333000181",
  "11.222.333/0001-81", "8", "81", "8133", "8133334444", "81999998888", "+55 (81) 9 9999-8888",
  "5581999998888", "(55) 3333-4444 ramal 12", "(81) 99999-9999 Maria", "3333-4444 12", "01310-100",
  "50000-000 Recife", "1.234.567 SSP/PE", "MG-12.345.678", "12.345.678-x", "1234x", "x12345",
  "013-12345-6", "CC12345-6", "abc", "ana @Empresa.com", "Fulano@Exemplo.COM", "ÓRGÃO 123",
  "123E4567-E89B-12D3-A456-426614174000xyz", "35200714200166000187550010000000046550010007",
  "3520 0714 2001 6600 0187 5500 1000 0000 0465 5001 0007", "!@#$%¨&*()_+", "1/2/3", "9".repeat(60),
];

const TIPOS: [string, TipoCampo][] = [
  ...Object.entries(CAMPOS),
  ...TIPOS_PIX.map((t) => [`pix:${t}`, campoPix(t)] as [string, TipoCampo]),
];

describe("a saída da máscara é sempre limpa", () => {
  it.each(TIPOS)("%s", (_nome, tipo) => {
    for (const x of ENTRADAS) {
      const m = tipo.mascarar(x);
      expect(tipo.limpo(m), `${JSON.stringify(x)} → ${JSON.stringify(m)}`).toBe(true);
    }
  });
});

describe("validar = vazio || (limpo && regra)", () => {
  it.each(TIPOS)("%s: o que não é limpo nunca é válido", (_nome, tipo) => {
    for (const x of ENTRADAS) {
      if (!tipo.limpo(x)) expect(tipo.validar(x), JSON.stringify(x)).toBe(false);
    }
  });
});

describe("forma do telefone", () => {
  it.each(["+55 (81) 9 9999-8888", "81999998888", "(81) 99999-8888", "+5581999998888", "(81)3333-4444", "81 3333 4444", "3333-4444"])(
    "%j é limpo",
    (v) => expect(CAMPOS.telefone.limpo(v)).toBe(true),
  );
  it.each(["5581999998888", "55 81 99999-8888", "(55) 3333-4444 ramal 12", "3333-4444 12", "81 99999-9999 / 81 3333-4444", "tel 81 3333-4444"])(
    "%j não é limpo",
    (v) => expect(CAMPOS.telefone.limpo(v)).toBe(false),
  );
});
