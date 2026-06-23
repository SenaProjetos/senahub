"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { INTERNAL_ROLES } from "@/lib/roles";
import type { Prisma } from "@/generated/prisma/client";
import { calcular, snapshotParaSalvar } from "./service";
import { getFerramenta } from "./registry";

const base = { modulo: "ferramentas", roles: INTERNAL_ROLES, recurso: "ferramentas" } as const;
const rev = () => revalidatePath("/ferramentas");

const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

const salvarSchema = z.object({
  ferramenta: z.string().min(1),
  titulo: z.string().min(1, "Informe o título do cálculo."),
  projetoId: opt(z.string()),
  disciplinaId: opt(z.string()),
  entradas: z.record(z.string(), z.unknown()),
});

const renomearSchema = z.object({
  id: z.string().min(1),
  titulo: z.string().min(1, "Informe o título."),
});

const excluirSchema = z.object({
  id: z.string().min(1),
});

export const salvarCalculo = defineAction(
  {
    ...base,
    acao: "salvar-calculo",
    permissao: "usar",
    entidade: "CalculoFerramenta",
    entidadeId: (d) => (d as { id: string }).id,
    schema: salvarSchema,
  },
  async (i, { user }) => {
    const meta = getFerramenta(i.ferramenta);
    if (!meta) throw new ActionError(`Ferramenta desconhecida: "${i.ferramenta}".`);

    // Recalcula no servidor — não confia no resultado que veio do cliente.
    const resultado = calcular(i.ferramenta, i.entradas);
    const snapshot = snapshotParaSalvar(
      i.ferramenta,
      i.titulo,
      meta.norma,
      1,
      i.entradas,
      resultado,
    );

    const registro = await prisma.calculoFerramenta.create({
      data: {
        ferramenta: snapshot.ferramenta,
        titulo: snapshot.titulo,
        norma: snapshot.norma ?? null,
        versaoCalc: snapshot.versaoCalc,
        entradasJson: snapshot.entradasJson as Prisma.InputJsonValue,
        resultadoJson: snapshot.resultadoJson as Prisma.InputJsonValue,
        autorId: user.id,
        projetoId: i.projetoId || null,
        disciplinaId: i.disciplinaId || null,
      },
    });

    rev();
    return { id: registro.id };
  },
);

export const renomearCalculo = defineAction(
  {
    ...base,
    acao: "renomear-calculo",
    permissao: "usar",
    entidade: "CalculoFerramenta",
    schema: renomearSchema,
    capturarAntes: async (i) =>
      prisma.calculoFerramenta.findUnique({ where: { id: i.id }, select: { titulo: true } }),
  },
  async (i, { user }) => {
    const registro = await prisma.calculoFerramenta.findUnique({ where: { id: i.id } });
    if (!registro) throw new ActionError("Cálculo não encontrado.");

    const podeGerir = await can(user.role, "ferramentas", "gerir");
    if (registro.autorId !== user.id && !podeGerir) {
      throw new ActionError("Sem permissão para renomear este cálculo.");
    }

    await prisma.calculoFerramenta.update({ where: { id: i.id }, data: { titulo: i.titulo } });
    rev();
    return { id: i.id };
  },
);

export const buscarCalculo = defineAction(
  {
    ...base,
    acao: "buscar-calculo",
    permissao: "usar",
    entidade: "CalculoFerramenta",
    schema: excluirSchema,
    audit: false,
  },
  async (i, { user }) => {
    const registro = await prisma.calculoFerramenta.findUnique({ where: { id: i.id } });
    if (!registro) throw new ActionError("Cálculo não encontrado.");
    const podeGerir = await can(user.role, "ferramentas", "gerir");
    if (registro.autorId !== user.id && !podeGerir) throw new ActionError("Sem permissão.");
    return {
      id: registro.id,
      titulo: registro.titulo,
      ferramenta: registro.ferramenta,
      entradasJson: registro.entradasJson as Record<string, unknown>,
    };
  },
);

export const excluirCalculo = defineAction(
  {
    ...base,
    acao: "excluir-calculo",
    permissao: "usar",
    entidade: "CalculoFerramenta",
    schema: excluirSchema,
    capturarAntes: async (i) =>
      prisma.calculoFerramenta.findUnique({
        where: { id: i.id },
        select: { titulo: true, ferramenta: true },
      }),
  },
  async (i, { user }) => {
    const registro = await prisma.calculoFerramenta.findUnique({ where: { id: i.id } });
    if (!registro) throw new ActionError("Cálculo não encontrado.");

    const podeGerir = await can(user.role, "ferramentas", "gerir");
    if (registro.autorId !== user.id && !podeGerir) {
      throw new ActionError("Sem permissão para excluir este cálculo.");
    }

    await prisma.calculoFerramenta.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);
