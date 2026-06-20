"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { parseCsv } from "@/modules/documentos/csv";
import type { Prisma } from "@/generated/prisma/client";

const base = { modulo: "documentos", recurso: "documentos", permissao: "gerir" } as const;
const PATH = "/documentos/datasets";

const criarSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome do dataset."),
  csv: z.string().min(1, "Cole ou carregue um CSV."),
});

const renomearSchema = z.object({
  id: z.string().min(1),
  nome: z.string().trim().min(1, "Informe o nome do dataset."),
});

const idSchema = z.object({ id: z.string().min(1) });

/** Cria um dataset a partir de um CSV (parseia colunas/linhas e grava como dono o usuário atual). */
export const criarDataset = defineAction(
  { ...base, acao: "criar-dataset", entidade: "DatasetDocumento", schema: criarSchema },
  async (i, { user }) => {
    const { colunas, linhas } = parseCsv(i.csv);
    if (colunas.length === 0) throw new ActionError("CSV sem colunas: verifique o conteúdo.");

    const d = await prisma.datasetDocumento.create({
      data: {
        nome: i.nome,
        colunas: colunas as unknown as Prisma.InputJsonValue,
        linhas: linhas as unknown as Prisma.InputJsonValue,
        donoId: user.id,
      },
    });
    revalidatePath(PATH);
    return { id: d.id, nColunas: colunas.length, nLinhas: linhas.length };
  },
);

export const renomearDataset = defineAction(
  {
    ...base,
    acao: "renomear-dataset",
    entidade: "DatasetDocumento",
    schema: renomearSchema,
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (i) => {
    await prisma.datasetDocumento.update({ where: { id: i.id }, data: { nome: i.nome } });
    revalidatePath(PATH);
    return { id: i.id };
  },
);

export const excluirDataset = defineAction(
  {
    ...base,
    acao: "excluir-dataset",
    entidade: "DatasetDocumento",
    schema: idSchema,
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (i) => {
    await prisma.datasetDocumento.delete({ where: { id: i.id } });
    revalidatePath(PATH);
    return { id: i.id };
  },
);
