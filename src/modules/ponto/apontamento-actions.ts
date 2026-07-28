"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { PJ_ROLES } from "@/lib/roles";
import { abrirApontamento, fecharApontamento, trocarApontamento } from "@/modules/ponto/apontamento";

/**
 * Restrito a `PJ_ROLES`: quem controla jornada usa `registrarBatida` (modules/ponto/actions.ts),
 * inalterado. Ver modules/ponto/apontamento.ts para o porquê deste módulo existir.
 */
const base = { modulo: "rh", roles: PJ_ROLES } as const;
const rev = () => revalidatePath("/ponto");

const projetoSchema = z.object({ projetoId: z.string().optional().or(z.literal("")) });

export const abrirApontamentoAction = defineAction(
  { ...base, acao: "abrir-apontamento", entidade: "SessaoTrabalho", schema: projetoSchema },
  async (i, { user }) => {
    const s = await abrirApontamento(user.id, i.projetoId || null);
    rev();
    return { id: s.id };
  },
);

export const trocarApontamentoAction = defineAction(
  { ...base, acao: "trocar-apontamento", entidade: "SessaoTrabalho", schema: projetoSchema },
  async (i, { user }) => {
    await trocarApontamento(user.id, i.projetoId || null);
    rev();
    return { ok: true };
  },
);

export const fecharApontamentoAction = defineAction(
  { ...base, acao: "fechar-apontamento", entidade: "SessaoTrabalho", schema: z.object({}) },
  async (_i, { user }) => {
    await fecharApontamento(user.id);
    rev();
    return { ok: true };
  },
);
