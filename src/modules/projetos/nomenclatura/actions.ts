"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { ehModelo, compilarPadrao } from "@/modules/uploads/nomenclatura/padrao";

const cfg = { modulo: "configuracoes", recurso: "configuracoes", permissao: "gerir" } as const;

/**
 * Valida o padrão custom, se informado. Modelo (`{campo}`) e regex são as duas escritas
 * aceitas (F5, editor visual) — cada uma com sua própria checagem, porque um modelo com chave
 * mal fechada (`{proj}-{disc`) É um regex válido pro `new RegExp` (chave sozinha é literal),
 * mas `compilarPadrao` devolve `null` pra ele — e `foraDoPadrao` trataria isso como "sem
 * padrão configurado", desligando o alerta pra todo mundo em silêncio (o mesmo bug que o
 * diagnóstico de 2026-09-15 achou em prod, só que entrando pela validação em vez do parser).
 */
function validarPadrao(padrao?: string) {
  const p = (padrao ?? "").trim();
  if (!p) return null;
  if (ehModelo(p)) {
    if (!compilarPadrao(p)) {
      throw new ActionError("Modelo inválido — confira se toda chave aberta tem um fechamento (\"{...}\").");
    }
    return p;
  }
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
    schema: z.object({ exigir: z.boolean(), exigirFase: z.boolean(), padrao: z.string().max(500).optional() }),
  },
  async (i) => {
    const padrao = validarPadrao(i.padrao);
    const existe = await prisma.nomenclaturaConfig.findFirst({ where: { projetoId: null }, select: { id: true } });
    if (existe) {
      await prisma.nomenclaturaConfig.update({ where: { id: existe.id }, data: { exigir: i.exigir, exigirFase: i.exigirFase, padrao } });
    } else {
      await prisma.nomenclaturaConfig.create({ data: { projetoId: null, exigir: i.exigir, exigirFase: i.exigirFase, padrao } });
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
      exigirFase: z.boolean(),
      padrao: z.string().max(500).optional(),
    }),
  },
  async (i) => {
    const padrao = validarPadrao(i.padrao);
    await prisma.nomenclaturaConfig.upsert({
      where: { projetoId: i.projetoId },
      create: { projetoId: i.projetoId, exigir: i.exigir, exigirFase: i.exigirFase, padrao },
      update: { exigir: i.exigir, exigirFase: i.exigirFase, padrao },
    });
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
    revalidatePath(`/projetos/${i.projetoId}/arquivos`);
    return { ok: true };
  },
);
