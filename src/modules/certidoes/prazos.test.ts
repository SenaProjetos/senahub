import { describe, expect, it } from "vitest";
import {
  PRAZOS_CERTIDOES_PADRAO,
  avisosAntesDaFaixa,
  normalizarDiasAvisos,
  parsePrazosCertidoes,
  tituloAvisoCertidao,
} from "./prazos";
import { prazosCertidoesSchema } from "./schemas";

describe("parsePrazosCertidoes", () => {
  it("sem configuração gravada vale o comportamento de sempre (30 dias; avisos 30/15/7)", () => {
    expect(parsePrazosCertidoes(undefined)).toEqual({ diasEmBreve: 30, diasAvisos: [30, 15, 7] });
    expect(parsePrazosCertidoes(null)).toEqual(PRAZOS_CERTIDOES_PADRAO);
    expect(parsePrazosCertidoes("lixo")).toEqual(PRAZOS_CERTIDOES_PADRAO);
    expect(parsePrazosCertidoes([1, 2])).toEqual(PRAZOS_CERTIDOES_PADRAO);
  });

  it("lê o que foi gravado", () => {
    expect(parsePrazosCertidoes({ diasEmBreve: 45, diasAvisos: [45, 10, 0] })).toEqual({
      diasEmBreve: 45,
      diasAvisos: [45, 10, 0],
    });
  });

  it("campo inválido cai no padrão só daquele campo", () => {
    expect(parsePrazosCertidoes({ diasEmBreve: 0, diasAvisos: [5] })).toEqual({ diasEmBreve: 30, diasAvisos: [5] });
    expect(parsePrazosCertidoes({ diasEmBreve: 2.5, diasAvisos: [5] }).diasEmBreve).toBe(30);
    expect(parsePrazosCertidoes({ diasEmBreve: 400, diasAvisos: [5] }).diasEmBreve).toBe(30);
    expect(parsePrazosCertidoes({ diasEmBreve: 10, diasAvisos: "7" })).toEqual({ diasEmBreve: 10, diasAvisos: [30, 15, 7] });
  });

  it("lista de avisos vazia é escolha válida (avisos desligados), não volta ao padrão", () => {
    expect(parsePrazosCertidoes({ diasEmBreve: 30, diasAvisos: [] }).diasAvisos).toEqual([]);
  });

  it("não devolve a mesma lista do padrão (mexer no resultado não estraga o padrão)", () => {
    const p = parsePrazosCertidoes(undefined);
    p.diasAvisos.push(99);
    expect(PRAZOS_CERTIDOES_PADRAO.diasAvisos).toEqual([30, 15, 7]);
  });
});

describe("normalizarDiasAvisos", () => {
  it("tira repetidos e inválidos e ordena do maior para o menor", () => {
    expect(normalizarDiasAvisos([7, 30, 7, -1, 1.5, "15", 366, 0, 15])).toEqual([30, 15, 7, 0]);
  });
  it("guarda no máximo 10", () => {
    expect(normalizarDiasAvisos([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toHaveLength(10);
  });
});

describe("avisosAntesDaFaixa", () => {
  it("lista os avisos que chegam antes de a certidão ficar 'Vence em breve'", () => {
    expect(avisosAntesDaFaixa({ diasEmBreve: 15, diasAvisos: [30, 15, 7] })).toEqual([30]);
    expect(avisosAntesDaFaixa({ diasEmBreve: 30, diasAvisos: [30, 15, 7] })).toEqual([]);
  });
});

describe("tituloAvisoCertidao", () => {
  it("fala hoje, amanhã ou N dias", () => {
    expect(tituloAvisoCertidao(0)).toBe("Certidão vence hoje");
    expect(tituloAvisoCertidao(1)).toBe("Certidão vence amanhã");
    expect(tituloAvisoCertidao(15)).toBe("Certidão vence em 15 dias");
  });
});

describe("prazosCertidoesSchema", () => {
  it("aceita o padrão e avisos vazios", () => {
    expect(prazosCertidoesSchema.safeParse(PRAZOS_CERTIDOES_PADRAO).success).toBe(true);
    expect(prazosCertidoesSchema.safeParse({ diasEmBreve: 1, diasAvisos: [] }).success).toBe(true);
  });
  it("recusa o que o parse descartaria", () => {
    expect(prazosCertidoesSchema.safeParse({ diasEmBreve: 0, diasAvisos: [] }).success).toBe(false);
    expect(prazosCertidoesSchema.safeParse({ diasEmBreve: 366, diasAvisos: [] }).success).toBe(false);
    expect(prazosCertidoesSchema.safeParse({ diasEmBreve: 30, diasAvisos: [-1] }).success).toBe(false);
    expect(prazosCertidoesSchema.safeParse({ diasEmBreve: 30, diasAvisos: [1.5] }).success).toBe(false);
    expect(
      prazosCertidoesSchema.safeParse({ diasEmBreve: 30, diasAvisos: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }).success,
    ).toBe(false);
  });
});

describe("prazosCertidoesSchema — normalização", () => {
  it("devolve os avisos sem repetidos e do maior para o menor (é o que grava e audita)", () => {
    const r = prazosCertidoesSchema.safeParse({ diasEmBreve: 30, diasAvisos: [7, 30, 7, 0] });
    expect(r.success && r.data.diasAvisos).toEqual([30, 7, 0]);
  });
});
