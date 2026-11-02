import type { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { BRIEFING_SCHEMA } from "../src/modules/inputs/briefing-schema";

export const NOME_MODELO_PADRAO = "Briefing padrão";

/**
 * Modelo padrão do briefing (Lote 4), criado a partir do formulário embutido. CREATE-ONLY: se já
 * existe um modelo padrão (mesmo editado ou renomeado) não toca em nada — a edição da gestão vale
 * mais que o deploy.
 */
export async function seedModeloBriefing(prisma: PrismaClient): Promise<{ criado: boolean }> {
  const existente = await prisma.modeloBriefing.findFirst({ where: { padrao: true }, select: { id: true } });
  if (existente) return { criado: false };
  const nomeLivre = !(await prisma.modeloBriefing.findUnique({ where: { nome: NOME_MODELO_PADRAO }, select: { id: true } }));
  await prisma.modeloBriefing.create({
    data: {
      nome: nomeLivre ? NOME_MODELO_PADRAO : `${NOME_MODELO_PADRAO} (embutido)`,
      descricao: "Formulário de start usado em todos os projetos que não escolheram outro modelo.",
      padrao: true,
      esquema: BRIEFING_SCHEMA as unknown as Prisma.InputJsonValue,
    },
  });
  return { criado: true };
}
