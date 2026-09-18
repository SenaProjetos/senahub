import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { criarLeadSchema, editarNegociacaoSchema } from "./schemas";

/**
 * As actions espalham (ou montam) o payload validado no `data` do Prisma. Uma chave do schema que
 * não é coluna dá `Unknown argument` em runtime — Zod, tsc e lint não pegam, e o formulário sempre
 * manda a chave. Foi assim que `campanhaId` (coluna real: `campaignId`) derrubou toda edição de
 * lead. Chave nova aqui precisa ser mapeada no serviço e entrar nestas listas de propósito.
 */
const foraDoModelo = (chaves: string[], colunas: Record<string, string>) => {
  const set = new Set(Object.values(colunas));
  return chaves.filter((k) => !set.has(k));
};

describe("schemas × colunas do banco", () => {
  it("Lead: só `campanhaId` difere, e as actions a mapeiam para `campaignId`", () => {
    expect(foraDoModelo(Object.keys(criarLeadSchema.shape), Prisma.LeadScalarFieldEnum)).toEqual([
      "campanhaId",
    ]);
    expect(Object.values(Prisma.LeadScalarFieldEnum)).toContain("campaignId");
  });

  it("Negociação: só `campanhaId` difere, e o serviço a mapeia para `campaignId`", () => {
    expect(
      foraDoModelo(Object.keys(editarNegociacaoSchema.shape), Prisma.NegociacaoScalarFieldEnum),
    ).toEqual(["campanhaId"]);
    expect(Object.values(Prisma.NegociacaoScalarFieldEnum)).toContain("campaignId");
  });

  it("Negociação: estágio e valores da proposta NÃO são editáveis pela ficha", () => {
    const chaves = Object.keys(editarNegociacaoSchema.shape);
    for (const proibido of ["estagio", "valorProposto", "desconto", "valorNegociado", "probabilidadeOverride"]) {
      expect(chaves).not.toContain(proibido);
    }
  });
});
