"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { elementoSchema } from "@/modules/documentos/schema";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Blocos reutilizáveis do Estúdio de Documentos.
 *
 * Um bloco é um conjunto de elementos (cabeçalho, assinatura, carimbo…) salvo
 * na biblioteca para reinserir em outros modelos. `conteudo` guarda o array de
 * `Elemento` serializado; `donoId` é o autor; `compartilhado` libera p/ todos.
 */

const base = { modulo: "documentos", recurso: "documentos", permissao: "gerir" } as const;
const PATH = "/documentos";

const salvarBlocoSchema = z.object({
  nome: z.string().min(1, "Informe o nome do bloco."),
  /** Elementos selecionados, já clonados pelo editor (ids podem ser regerados na inserção). */
  conteudo: z.array(elementoSchema).min(1, "Selecione ao menos um elemento."),
  compartilhado: z.boolean().default(false),
});

export const salvarBloco = defineAction(
  { ...base, acao: "salvar-bloco", entidade: "BlocoDocumento", schema: salvarBlocoSchema },
  async (i, { user }) => {
    const b = await prisma.blocoDocumento.create({
      data: {
        nome: i.nome,
        conteudo: i.conteudo as unknown as Prisma.InputJsonValue,
        donoId: user.id,
        compartilhado: i.compartilhado,
      },
    });
    revalidatePath(PATH);
    return { id: b.id, nome: b.nome };
  },
);

const excluirBlocoSchema = z.object({ id: z.string().min(1) });

export const excluirBloco = defineAction(
  {
    ...base,
    acao: "excluir-bloco",
    entidade: "BlocoDocumento",
    schema: excluirBlocoSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
  },
  async (i, { user }) => {
    const b = await prisma.blocoDocumento.findUnique({
      where: { id: i.id },
      select: { id: true, donoId: true },
    });
    if (!b) throw new ActionError("Bloco não encontrado.");
    const ehDono = b.donoId != null && b.donoId === user.id;
    if (!ehDono && user.role !== "admin") {
      throw new ActionError("Apenas o dono ou um administrador pode excluir o bloco.");
    }
    await prisma.blocoDocumento.delete({ where: { id: i.id } });
    revalidatePath(PATH);
    return { id: i.id };
  },
);
