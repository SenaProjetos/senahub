"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { feriadosNacionais } from "@/modules/rh/feriados/queries";

const base = { modulo: "rh", roles: HR_ADMIN_ROLES } as const;
const rev = () => revalidatePath("/configuracoes/feriados");

export const salvarFeriado = defineAction(
  {
    ...base,
    acao: "salvar-feriado",
    entidade: "Feriado",
    schema: z.object({ data: z.string().min(1), nome: z.string().min(1), tipo: z.string().default("nacional") }),
  },
  async (i) => {
    const data = new Date(i.data + "T00:00:00Z");
    const f = await prisma.feriado.upsert({
      where: { data },
      create: { data, nome: i.nome, tipo: i.tipo },
      update: { nome: i.nome, tipo: i.tipo },
    });
    rev();
    return { id: f.id };
  },
);

export const excluirFeriado = defineAction(
  { ...base, acao: "excluir-feriado", entidade: "Feriado", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    await prisma.feriado.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

/** Importa os feriados nacionais do ano (fixos + móveis). Idempotente (upsert por data). */
export const importarFeriadosNacionais = defineAction(
  { ...base, acao: "importar-feriados", entidade: "Feriado", schema: z.object({ ano: z.number().int() }) },
  async (i) => {
    const lista = feriadosNacionais(i.ano);
    for (const f of lista) {
      await prisma.feriado.upsert({
        where: { data: f.data },
        create: { data: f.data, nome: f.nome, tipo: "nacional" },
        update: { nome: f.nome },
      });
    }
    rev();
    return { total: lista.length };
  },
);
