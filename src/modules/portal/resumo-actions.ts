"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { diaDeSaoPaulo } from "@/lib/data";
import { somarDiasIso } from "./resumo-diario";
import { definirResumoPorEmail, getConfigResumo, salvarConfigResumo } from "./resumo-service";

/**
 * Liga ou desliga o resumo diário do portal (Configurações → Portal do cliente). Ligar quando estava desligado começa
 * do zero: `desde = hoje` e `ultimoDia = ontem` — o primeiro resumo é o de hoje, amanhã às 7h, e nada do período em
 * que esteve desligado é enviado. Desligar só para; `desde` fica para a tela mostrar.
 */
export const salvarResumoPortal = defineAction(
  {
    modulo: "portal",
    recurso: "configuracoes",
    permissao: "gerir",
    acao: "salvar-resumo-portal",
    entidade: "ConfigSistema",
    schema: z.object({ ativo: z.boolean() }),
    capturarAntes: () => getConfigResumo(),
  },
  async (i) => {
    const atual = await getConfigResumo();
    if (i.ativo === atual.ativo) return { ok: true };
    const hoje = diaDeSaoPaulo();
    await salvarConfigResumo(i.ativo ? { ativo: true, desde: hoje, ultimoDia: somarDiasIso(hoje, -1) } : { ...atual, ativo: false });
    revalidatePath("/configuracoes/portal");
    return { ok: true };
  },
);

/**
 * O cliente liga ou desliga o e-mail do resumo para SI (Meus projetos). Ação própria, em vez da genérica
 * `salvarPreferencia`: grava só `notif_portal_resumo`, com valor booleano, e fica na auditoria.
 */
export const salvarResumoPorEmail = defineAction(
  {
    modulo: "portal",
    acao: "salvar-resumo-por-email",
    entidade: "UserPreference",
    schema: z.object({ quer: z.boolean() }),
    entidadeId: (data) => (data as { userId: string }).userId,
  },
  async (i, ctx) => {
    await definirResumoPorEmail(ctx.user.id, i.quer);
    return { userId: ctx.user.id };
  },
);
