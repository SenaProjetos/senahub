"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

const base = { modulo: "projetos", recurso: "projetos", permissao: "gerir", entidade: "LinkPublicoArquivos" } as const;
const idProjeto = (d: unknown, i: unknown) => ((d ?? i) as { projetoId: string }).projetoId;

/** IDs de disciplina que realmente pertencem ao projeto (barra lixo/whitelist forjada). */
async function disciplinasValidas(projetoId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const discs = await prisma.disciplina.findMany({
    where: { projetoId, id: { in: ids } },
    select: { id: true },
  });
  return discs.map((d) => d.id);
}

/**
 * Gera (ou regenera) o link público de arquivos do projeto. Na criação, libera
 * TODAS as disciplinas por padrão e ativa o link; ao regerar, troca só o token e
 * preserva a seleção/validade (o link antigo para de funcionar imediatamente).
 */
export const gerarLinkArquivos = defineAction(
  {
    ...base,
    acao: "gerar-link-arquivos",
    schema: z.object({ projetoId: z.string().min(1) }),
    entidadeId: idProjeto,
    capturarAntes: (i) => prisma.linkPublicoArquivos.findUnique({ where: { projetoId: i.projetoId } }),
  },
  async (input, { user }) => {
    const token = randomBytes(18).toString("hex");
    const existente = await prisma.linkPublicoArquivos.findUnique({ where: { projetoId: input.projetoId } });
    if (existente) {
      await prisma.linkPublicoArquivos.update({ where: { projetoId: input.projetoId }, data: { token } });
    } else {
      const todas = await prisma.disciplina.findMany({ where: { projetoId: input.projetoId }, select: { id: true } });
      await prisma.linkPublicoArquivos.create({
        data: {
          projetoId: input.projetoId,
          token,
          ativo: true,
          disciplinaIds: todas.map((d) => d.id),
          criadoPorId: user.id,
        },
      });
    }
    revalidatePath(`/projetos/${input.projetoId}/arquivos`);
    return { projetoId: input.projetoId, token };
  },
);

/** Atualiza a whitelist de disciplinas, o estado (ativo/revogado) e a validade do link. */
export const atualizarLinkArquivos = defineAction(
  {
    ...base,
    acao: "atualizar-link-arquivos",
    schema: z.object({
      projetoId: z.string().min(1),
      disciplinaIds: z.array(z.string()).default([]),
      ativo: z.boolean(),
      expiraEm: z.string().datetime().nullable().optional(),
    }),
    entidadeId: idProjeto,
    capturarAntes: (i) => prisma.linkPublicoArquivos.findUnique({ where: { projetoId: i.projetoId } }),
  },
  async (input) => {
    const disciplinaIds = await disciplinasValidas(input.projetoId, input.disciplinaIds);
    await prisma.linkPublicoArquivos.update({
      where: { projetoId: input.projetoId },
      data: {
        disciplinaIds,
        ativo: input.ativo,
        expiraEm: input.expiraEm ? new Date(input.expiraEm) : null,
      },
    });
    revalidatePath(`/projetos/${input.projetoId}/arquivos`);
    return { projetoId: input.projetoId };
  },
);
