"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { removerArquivo } from "@/lib/storage";
import { HR_ADMIN_ROLES, INTERNAL_ROLES } from "@/lib/roles";

const rhBase = { modulo: "rh", roles: HR_ADMIN_ROLES, entidade: "FuncionarioDocumento" } as const;
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

function rev(userId: string) {
  revalidatePath(`/rh/pessoas/${userId}`);
  revalidatePath("/minha-ficha");
}

/** RH define (ou tira) a validade. Mudar a data rearma os avisos (`avisoFaixa` volta a nulo). */
export const definirValidadeDocumento = defineAction(
  {
    ...rhBase,
    acao: "validade-doc-funcionario",
    schema: z.object({ id: z.string().min(1), validadeEm: dataIso.nullable() }),
    entidadeId: (_d, i) => i.id,
    capturarAntes: (i) => prisma.funcionarioDocumento.findUnique({ where: { id: i.id }, select: { validadeEm: true } }),
  },
  async (i) => {
    const d = await prisma.funcionarioDocumento.update({
      where: { id: i.id },
      data: { validadeEm: i.validadeEm ? new Date(`${i.validadeEm}T00:00:00Z`) : null, avisoFaixa: null },
      select: { userId: true },
    });
    rev(d.userId);
    return { id: i.id };
  },
);

/** RH confere um documento enviado pela própria pessoa. */
export const conferirDocumento = defineAction(
  { ...rhBase, acao: "conferir-doc-funcionario", schema: z.object({ id: z.string().min(1) }), entidadeId: (_d, i) => i.id },
  async (i, { user }) => {
    const r = await prisma.funcionarioDocumento.updateMany({
      where: { id: i.id, conferidoEm: null },
      data: { conferidoEm: new Date(), conferidoPorId: user.id },
    });
    if (r.count !== 1) throw new ActionError("Este documento já foi conferido.");
    const d = await prisma.funcionarioDocumento.findUniqueOrThrow({ where: { id: i.id }, select: { userId: true } });
    rev(d.userId);
    return { id: i.id };
  },
);

/** A pessoa tira um documento que ELA enviou, enquanto o RH ainda não conferiu. */
export const removerMeuDocumento = defineAction(
  {
    modulo: "rh",
    roles: INTERNAL_ROLES,
    acao: "rm-meu-doc",
    entidade: "FuncionarioDocumento",
    schema: z.object({ id: z.string().min(1) }),
    entidadeId: (_d, i) => i.id,
  },
  async (i, { user }) => {
    const d = await prisma.funcionarioDocumento.findUnique({
      where: { id: i.id },
      select: { userId: true, caminho: true, enviadoPelaPessoa: true, conferidoEm: true },
    });
    if (!d || d.userId !== user.id) throw new ActionError("Documento não encontrado.");
    if (!d.enviadoPelaPessoa || d.conferidoEm) throw new ActionError("Depois que o RH confere, só o RH remove o documento.");
    await prisma.funcionarioDocumento.delete({ where: { id: i.id } });
    await removerArquivo(d.caminho);
    rev(user.id);
    return { id: i.id };
  },
);
