"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { removerArquivo } from "@/lib/storage";

const base = { modulo: "comercial", recurso: "comercial", permissao: "gerir" } as const;
const rev = (propostaId: string) => revalidatePath(`/comercial/propostas/${propostaId}`);

export const adicionarAnexoProposta = defineAction(
  {
    ...base,
    acao: "add-anexo-proposta",
    entidade: "PropostaAnexo",
    schema: z.object({
      propostaId: z.string().min(1),
      meta: z.object({ caminho: z.string().min(1), nome: z.string().min(1), mime: z.string().min(1), tamanho: z.number().int().nonnegative() }),
    }),
  },
  async (i, ctx) => {
    await prisma.propostaAnexo.create({
      data: { propostaId: i.propostaId, caminho: i.meta.caminho, nome: i.meta.nome, mime: i.meta.mime, tamanho: i.meta.tamanho, autorId: ctx.user.id },
    });
    rev(i.propostaId);
    return { ok: true };
  },
);

export const removerAnexoProposta = defineAction(
  { ...base, acao: "rm-anexo-proposta", entidade: "PropostaAnexo", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    const a = await prisma.propostaAnexo.findUnique({ where: { id: i.id } });
    if (!a) throw new ActionError("Anexo não encontrado.");
    await prisma.propostaAnexo.delete({ where: { id: i.id } });
    await removerArquivo(a.caminho);
    rev(a.propostaId);
    return { id: i.id };
  },
);
