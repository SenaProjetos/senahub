"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { notificar } from "@/lib/notificar";

const validarSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["aprovada", "rejeitada"]),
  observacao: z.string().optional().or(z.literal("")),
});

/** Gestor aprova/rejeita a NF do PJ. Notifica o autor. */
export const validarNF = defineAction(
  {
    modulo: "rh",
    roles: HR_ADMIN_ROLES,
    acao: "validar-nf",
    entidade: "NotaFiscalPJ",
    schema: validarSchema,
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (i, { user }) => {
    const nf = await prisma.notaFiscalPJ.findUnique({ where: { id: i.id } });
    if (!nf) throw new ActionError("Nota fiscal não encontrada.");
    if (nf.status !== "enviada") throw new ActionError("Nota já validada.");

    await prisma.notaFiscalPJ.update({
      where: { id: i.id },
      data: {
        status: i.status,
        observacao: i.observacao || null,
        validadoPorId: user.id,
        validadoEm: new Date(),
        historico: { create: { de: nf.status, para: i.status, autorId: user.id } },
      },
    });

    await notificar(nf.userId, {
      titulo: i.status === "aprovada" ? "Nota fiscal aprovada" : "Nota fiscal rejeitada",
      corpo: i.observacao || undefined,
      href: "/rh",
      tag: `nf-${nf.id}`,
    });

    revalidatePath("/rh/admin");
    revalidatePath("/rh");
    return { id: i.id };
  },
);
