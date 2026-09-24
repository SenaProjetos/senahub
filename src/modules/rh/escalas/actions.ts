"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  salvarEscalaContratacaoSchema,
  salvarEscalaUsuarioSchema,
  removerEscalaUsuarioSchema,
  diaGradeSchema,
  excessoJornadaEstagio,
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

/**
 * Salva a grade padrão (7 dias) de uma contratação — vale para todo colaborador dessa
 * contratação que não tem escala própria. `EscalaContratacao` é a única fonte do cálculo de
 * jornada desde a Onda E; a antiga grade por papel (`EscalaRole`) foi removida no passo 4.
 */
export const salvarEscalaContratacao = defineAction(
  {
    ...base,
    acao: "salvar-escala-contratacao",
    entidade: "EscalaContratacao",
    schema: salvarEscalaContratacaoSchema,
    capturarAntes: async (i) => prisma.escalaContratacao.findMany({ where: { contratacao: i.contratacao } }),
  },
  async (i) => {
    await prisma.$transaction(
      i.dias.map((d) =>
        prisma.escalaContratacao.upsert({
          where: { contratacao_diaSemana: { contratacao: i.contratacao, diaSemana: d.diaSemana } },
          create: { contratacao: i.contratacao, diaSemana: d.diaSemana, ...camposDia(d) },
          update: camposDia(d),
        }),
      ),
    );
    rev();
    return { ok: true };
  },
);

/** Salva/ativa a grade personalizada (7 dias) de um usuário — passa a substituir a da contratação. */
export const salvarEscalaUsuario = defineAction(
  { ...base, acao: "salvar-escala-usuario", entidade: "EscalaUsuario", schema: salvarEscalaUsuarioSchema },
  async (i) => {
    const u = await prisma.user.findUnique({ where: { id: i.userId }, select: { contratacao: true } });
    if (u?.contratacao === "estagio") {
      const excesso = excessoJornadaEstagio(i.dias);
      if (excesso) throw new ActionError(excesso);
    }
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

/** Remove a escala personalizada — o usuário volta a seguir a escala da contratação. */
export const removerEscalaUsuario = defineAction(
  { ...base, acao: "remover-escala-usuario", entidade: "EscalaUsuario", schema: removerEscalaUsuarioSchema },
  async (i) => {
    await prisma.escalaUsuario.deleteMany({ where: { userId: i.userId } });
    rev();
    return { ok: true };
  },
);
