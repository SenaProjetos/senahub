"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

const cfg = { modulo: "configuracoes", recurso: "configuracoes", permissao: "gerir" } as const;

/** Valida que o padrão custom é um regex válido (se informado). */
function validarPadrao(padrao?: string) {
  const p = (padrao ?? "").trim();
  if (!p) return null;
  try {
    new RegExp(p);
  } catch {
    throw new ActionError("Padrão inválido (regex). Deixe vazio para usar o padrão embutido.");
  }
  return p;
}

export const salvarNomenclaturaGlobal = defineAction(
  {
    ...cfg,
    acao: "salvar-nomenclatura-global",
    entidade: "NomenclaturaConfig",
    schema: z.object({ exigir: z.boolean(), padrao: z.string().max(500).optional() }),
  },
  async (i) => {
    const padrao = validarPadrao(i.padrao);
    const existe = await prisma.nomenclaturaConfig.findFirst({ where: { projetoId: null }, select: { id: true } });
    if (existe) {
      await prisma.nomenclaturaConfig.update({ where: { id: existe.id }, data: { exigir: i.exigir, padrao } });
    } else {
      await prisma.nomenclaturaConfig.create({ data: { projetoId: null, exigir: i.exigir, padrao } });
    }
    revalidatePath("/configuracoes/lista-mestre");
    return { ok: true };
  },
);

export const salvarNomenclaturaProjeto = defineAction(
  {
    ...cfg,
    acao: "salvar-nomenclatura-projeto",
    entidade: "NomenclaturaConfig",
    entidadeId: (_d, i) => (i as { projetoId: string }).projetoId,
    schema: z.object({
      projetoId: z.string().min(1),
      exigir: z.boolean(),
      padrao: z.string().max(500).optional(),
    }),
  },
  async (i) => {
    const padrao = validarPadrao(i.padrao);
    await prisma.nomenclaturaConfig.upsert({
      where: { projetoId: i.projetoId },
      create: { projetoId: i.projetoId, exigir: i.exigir, padrao },
      update: { exigir: i.exigir, padrao },
    });
    revalidatePath(`/projetos/${i.projetoId}/lista-mestre`);
    revalidatePath(`/projetos/${i.projetoId}/arquivos`);
    return { ok: true };
  },
);

/** Remove a config específica do projeto → volta a herdar a global. */
export const limparNomenclaturaProjeto = defineAction(
  {
    ...cfg,
    acao: "limpar-nomenclatura-projeto",
    entidade: "NomenclaturaConfig",
    entidadeId: (_d, i) => (i as { projetoId: string }).projetoId,
    schema: z.object({ projetoId: z.string().min(1) }),
  },
  async (i) => {
    await prisma.nomenclaturaConfig.deleteMany({ where: { projetoId: i.projetoId } });
    revalidatePath(`/projetos/${i.projetoId}/lista-mestre`);
    revalidatePath(`/projetos/${i.projetoId}/arquivos`);
    return { ok: true };
  },
);
