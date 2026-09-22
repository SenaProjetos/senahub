"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { agendarDesligamento, cancelarDesligamento } from "@/modules/usuarios/vinculo/service";
import { MOTIVOS_DESLIGAMENTO, validarDesligamento } from "@/modules/usuarios/vinculo/desligamento";

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
/** `<input type="date">` → meia-noite UTC, igual a toda coluna `@db.Date`. */
const dia = (s: string) => new Date(`${s}T00:00:00Z`);

async function estadoDesligamento(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      ativo: true,
      acessoAte: true,
      vinculoAtivo: { select: { id: true, dataInicio: true, dataFim: true, motivoFim: true } },
    },
  });
}

/**
 * Desliga a pessoa: último dia do vínculo + último dia com login, escolhidos pelo RH.
 *
 * Não usa `desativarUsuario` e não apaga nada. O vínculo segue ativo até `dataFim` (a pessoa
 * bate ponto e entra na apuração até lá, e o mês da saída é apurado só até essa data), e o login
 * vale até `acessoAte`. Datas já passadas valem na hora; as futuras, na rotina diária de RH.
 */
export const desligarColaborador = defineAction(
  {
    modulo: "rh",
    acao: "desligar-colaborador",
    roles: HR_ADMIN_ROLES,
    entidade: "User",
    schema: z.object({
      userId: z.string().min(1),
      dataFim: dataIso,
      acessoAte: dataIso,
      motivo: z.enum(MOTIVOS_DESLIGAMENTO),
    }),
    entidadeId: (_d, i) => i.userId,
    capturarAntes: async (i) => estadoDesligamento(i.userId),
  },
  async (i, ctx) => {
    if (i.userId === ctx.user.id) throw new ActionError("Você não pode desligar a si mesmo.");
    const u = await estadoDesligamento(i.userId);
    if (!u) throw new ActionError("Pessoa não encontrada.");
    const vinculo = u.vinculoAtivo;
    if (!vinculo) throw new ActionError("Esta pessoa não tem vínculo ativo para encerrar.");

    const dataFim = dia(i.dataFim);
    const erro = validarDesligamento({ dataInicioVinculo: vinculo.dataInicio, dataFim });
    if (erro) throw new ActionError(erro);

    const r = await prisma.$transaction((tx) =>
      agendarDesligamento(tx, i.userId, {
        vinculoId: vinculo.id,
        dataFim,
        motivo: i.motivo,
        acessoAte: dia(i.acessoAte),
      }),
    );
    revalidatePath(`/rh/pessoas/${i.userId}`);
    return r;
  },
);

/** Desfaz um desligamento agendado — só enquanto o vínculo ainda não foi encerrado. */
export const cancelarDesligamentoAction = defineAction(
  {
    modulo: "rh",
    acao: "cancelar-desligamento",
    roles: HR_ADMIN_ROLES,
    entidade: "User",
    schema: z.object({ userId: z.string().min(1) }),
    entidadeId: (_d, i) => i.userId,
    capturarAntes: async (i) => estadoDesligamento(i.userId),
  },
  async (i) => {
    const u = await estadoDesligamento(i.userId);
    const vinculo = u?.vinculoAtivo;
    if (!u || !vinculo?.dataFim) {
      throw new ActionError(
        "Não há desligamento agendado. Se o vínculo já foi encerrado, reative o usuário e registre um vínculo novo.",
      );
    }
    if (!u.ativo) {
      throw new ActionError("O acesso já foi encerrado. Reative o usuário antes de cancelar o desligamento.");
    }
    await prisma.$transaction((tx) => cancelarDesligamento(tx, i.userId, vinculo.id));
    revalidatePath(`/rh/pessoas/${i.userId}`);
    return { userId: i.userId };
  },
);
