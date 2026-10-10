"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { notificar, notificarMuitos } from "@/lib/notificar";

import { whereAudiencia } from "@/lib/audiencias";
import { prepararAlteracoes, SELECT_FORMATADOS } from "@/modules/rh/cadastro/alteracoes";
import type { Prisma } from "@/generated/prisma/client";

/** Campos sensíveis que a pessoa só PREENCHE (vazios) e o RH aprova — ver `preencher.ts`. */
const CAMPOS_SENSIVEIS_PREENCHIMENTO = new Set(["cpf", "rg"]);

/** Lê o blob `dados` do UserPreference como objeto mutável. */
async function lerDados(userId: string): Promise<Record<string, unknown>> {
  const pref = await prisma.userPreference.findUnique({ where: { userId }, select: { dados: true } });
  return { ...((pref?.dados as Record<string, unknown> | null) ?? {}) };
}
async function gravarDados(userId: string, dados: Record<string, unknown>) {
  const valor = dados as Prisma.InputJsonObject;
  await prisma.userPreference.upsert({
    where: { userId },
    create: { userId, dados: valor },
    update: { dados: valor },
  });
}

/**
 * Auto-serviço: o colaborador PROPÕE alterações no próprio cadastro (contato/endereço/
 * emergência/banco). Nada muda no User — fica pendente até o RH validar. Whitelist aplicada
 * no servidor (ignora qualquer campo fora da lista); telefone, e-mail e CEP passam pela regra do
 * catálogo (o inválido novo é recusado no campo; o que já estava gravado passa) e são guardados no
 * formato padrão.
 */
export const proporAlteracaoCadastro = defineAction(
  {
    modulo: "rh",
    acao: "propor-alteracao-cadastro",
    entidade: "User",
    schema: z.object({ alteracoes: z.record(z.string(), z.string().max(500, "Texto longo demais para este campo.")) }),
  },
  async (i, ctx) => {
    const gravado = await prisma.user.findUnique({ where: { id: ctx.user.id }, select: SELECT_FORMATADOS });
    const alteracoes = prepararAlteracoes(i.alteracoes, gravado);
    if (Object.keys(alteracoes).length === 0) {
      throw new ActionError("Nenhum campo válido para alterar.");
    }

    const dados = await lerDados(ctx.user.id);
    // A proposta nova substitui a anterior, mas não apaga CPF/RG preenchidos esperando o RH.
    const anterior = dados["cadastroPendente"] as { preenchimentos?: Record<string, string> } | undefined;
    dados["cadastroPendente"] = {
      alteracoes,
      ...(anterior?.preenchimentos ? { preenchimentos: anterior.preenchimentos } : {}),
      propostoEm: new Date().toISOString(),
    };
    await gravarDados(ctx.user.id, dados);

    // Avisa o RH que há algo para validar.
    const gestores = await prisma.user.findMany({
      where: whereAudiencia("rh_admin"),
      select: { id: true },
    });
    await notificarMuitos(
      gestores.map((g) => g.id),
      {
        titulo: "Alteração de cadastro para validar",
        corpo: `${ctx.user.name} propôs alterações no próprio cadastro.`,
        href: "/rh/pessoas",
        tag: "alteracao-cadastro",
      },
    );

    revalidatePath("/minha-ficha");
    return { ok: true };
  },
);

const hrBase = { modulo: "rh", gereRh: true, entidade: "User" } as const;
const alvoSchema = z.object({ userId: z.string().min(1) });

/** RH aprova: aplica o diff (só whitelist) no User e limpa o pendente. Auditado + notifica o autor. */
export const aprovarAlteracaoCadastro = defineAction(
  { ...hrBase, acao: "aprovar-alteracao-cadastro", schema: alvoSchema, entidadeId: (_, i) => (i as { userId: string }).userId },
  async (i) => {
    const dados = await lerDados(i.userId);
    const pend = dados["cadastroPendente"] as
      | { alteracoes?: Record<string, string>; preenchimentos?: Record<string, string> }
      | undefined;
    if (!pend || (Object.keys(pend.alteracoes ?? {}).length === 0 && Object.keys(pend.preenchimentos ?? {}).length === 0)) {
      throw new ActionError("Não há alteração pendente para este usuário.");
    }

    // De novo na aprovação: a proposta pode ser de antes da regra, e o gravado pode ter mudado.
    const gravado = await prisma.user.findUnique({ where: { id: i.userId }, select: SELECT_FORMATADOS });
    const data: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(prepararAlteracoes(pend.alteracoes ?? {}, gravado, { comRotulo: true }))) {
      data[k] = v || null;
    }
    // CPF/RG preenchidos a pedido do RH: só entram se o campo CONTINUA vazio (o RH pode ter
    // preenchido pela ficha enquanto isso — o valor dele vale).
    const preenchimentos = Object.entries(pend.preenchimentos ?? {}).filter(([k]) => CAMPOS_SENSIVEIS_PREENCHIMENTO.has(k));
    if (preenchimentos.length > 0) {
      const atuais = await prisma.user.findUnique({ where: { id: i.userId }, select: { cpf: true, rg: true } });
      for (const [k, v] of preenchimentos) {
        if (!atuais?.[k as "cpf" | "rg"]?.trim()) data[k] = v;
      }
    }
    if (Object.keys(data).length > 0) {
      await prisma.user.update({ where: { id: i.userId }, data });
    }

    delete dados["cadastroPendente"];
    await gravarDados(i.userId, dados);

    await notificar(i.userId, {
      titulo: "Cadastro atualizado",
      corpo: "Suas alterações de cadastro foram aprovadas pelo RH.",
      href: "/minha-ficha",
    });
    revalidatePath("/rh/pessoas");
    return { ok: true };
  },
);

/** RH rejeita: descarta o pendente (nada muda no User) e avisa o autor com o motivo. */
export const rejeitarAlteracaoCadastro = defineAction(
  {
    ...hrBase,
    acao: "rejeitar-alteracao-cadastro",
    schema: z.object({ userId: z.string().min(1), motivo: z.string().max(300).optional().or(z.literal("")) }),
    entidadeId: (_, i) => (i as { userId: string }).userId,
  },
  async (i) => {
    const dados = await lerDados(i.userId);
    if (!dados["cadastroPendente"]) throw new ActionError("Não há alteração pendente para este usuário.");
    delete dados["cadastroPendente"];
    await gravarDados(i.userId, dados);

    await notificar(i.userId, {
      titulo: "Alteração de cadastro recusada",
      corpo: i.motivo?.trim() ? `Recusada pelo RH: ${i.motivo.trim()}` : "Suas alterações de cadastro foram recusadas pelo RH.",
      href: "/minha-ficha",
    });
    revalidatePath("/rh/pessoas");
    return { ok: true };
  },
);
