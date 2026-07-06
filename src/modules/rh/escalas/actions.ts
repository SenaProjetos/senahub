"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  salvarEscalaRoleSchema,
  salvarEscalaUsuarioSchema,
  removerEscalaUsuarioSchema,
  diaGradeSchema,
} from "@/modules/rh/escalas/schemas";

const base = { modulo: "rh", recurso: "ponto", permissao: "gerir_escalas" } as const;
const rev = () => revalidatePath("/rh/escalas");

function camposDia(d: z.infer<typeof diaGradeSchema>) {
  return {
    entrada: d.entrada,
    saida: d.saida,
    descansos: d.descansos as unknown as Prisma.InputJsonValue,
    horasDia: d.horasDia,
    ativo: d.ativo,
    toleranciaMin: d.toleranciaMin,
  };
}

/** Salva a grade padrão (7 dias) de um perfil do sistema. */
export const salvarEscalaRole = defineAction(
  { ...base, acao: "salvar-escala-role", entidade: "EscalaRole", schema: salvarEscalaRoleSchema },
  async (i) => {
    await prisma.$transaction(
      i.dias.map((d) =>
        prisma.escalaRole.upsert({
          where: { role_diaSemana: { role: i.role, diaSemana: d.diaSemana } },
          create: { role: i.role, diaSemana: d.diaSemana, ...camposDia(d) },
          update: camposDia(d),
        }),
      ),
    );
    rev();
    return { ok: true };
  },
);

/** Salva/ativa a grade personalizada (7 dias) de um usuário — passa a substituir a do perfil. */
export const salvarEscalaUsuario = defineAction(
  { ...base, acao: "salvar-escala-usuario", entidade: "EscalaUsuario", schema: salvarEscalaUsuarioSchema },
  async (i) => {
    await prisma.$transaction(
      i.dias.map((d) =>
        prisma.escalaUsuario.upsert({
          where: { userId_diaSemana: { userId: i.userId, diaSemana: d.diaSemana } },
          create: { userId: i.userId, diaSemana: d.diaSemana, ...camposDia(d) },
          update: camposDia(d),
        }),
      ),
    );
    rev();
    return { ok: true };
  },
);

/** Remove a escala personalizada — o usuário volta a seguir a escala do perfil. */
export const removerEscalaUsuario = defineAction(
  { ...base, acao: "remover-escala-usuario", entidade: "EscalaUsuario", schema: removerEscalaUsuarioSchema },
  async (i) => {
    await prisma.escalaUsuario.deleteMany({ where: { userId: i.userId } });
    rev();
    return { ok: true };
  },
);
