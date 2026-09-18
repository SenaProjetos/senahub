import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { criarLeadSchema } from "./schemas";

/**
 * `criarLead`/`editarLead` espalham o payload validado no `data` do Prisma. Uma chave do schema que
 * não é coluna do `Lead` dá `Unknown argument` em runtime — o Zod, o tsc e o lint não pegam, e o
 * diálogo sempre manda a chave. Foi assim que `campanhaId` (coluna real: `campaignId`) derrubou toda
 * edição de lead. Chave nova aqui precisa ser mapeada na action e entrar nesta lista de propósito.
 */
describe("criarLeadSchema × colunas do Lead", () => {
  it("só `campanhaId` difere das colunas, e as actions a mapeiam para `campaignId`", () => {
    const colunas = new Set(Object.values(Prisma.LeadScalarFieldEnum));
    const foraDoModelo = Object.keys(criarLeadSchema.shape).filter((k) => !colunas.has(k as never));

    expect(foraDoModelo).toEqual(["campanhaId"]);
    expect(colunas.has("campaignId" as never)).toBe(true);
  });
});
