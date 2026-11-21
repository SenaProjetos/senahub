"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { clienteDoPedido, contaDoPortalParaCliente } from "./acesso";
import { assinarPedidoNoPortal, cancelarPedidoAssinatura, pedirAssinaturaNoPortal } from "./service";
import { MOTIVO_NAO_ENCONTRADO } from "./regras";
import {
  assinarContratoNoPortalSchema,
  cancelarAssinaturaPortalSchema,
  pedirAssinaturaPortalSchema,
} from "./schemas";

/**
 * Assinatura de contrato pelo portal do cliente (spec `docs/superpowers/specs/2026-11-21-portal-assinatura-contrato-design.md`).
 * A equipe pede e cancela (`juridico:gerir`); o cliente assina sem permissão de catálogo — a conta é conferida aqui
 * (`contaDoPortalParaCliente`) e de novo no serviço, e qualquer recusa é "Pedido não encontrado.".
 */

/** O mesmo que `revalidarFinanceiro` de `juridico/actions.ts` (local lá): contrato por entrega gera previsões. */
function revalidarFinanceiro() {
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro/contas-a-receber");
}

function revalidarTelas() {
  revalidatePath("/juridico");
  revalidatePath("/portal", "layout");
}

export const pedirAssinaturaPortal = defineAction(
  {
    modulo: "juridico",
    acao: "pedir-assinatura-portal",
    entidade: "PedidoAssinaturaPortal",
    recurso: "juridico",
    permissao: "gerir",
    interno: true,
    schema: pedirAssinaturaPortalSchema,
    entidadeId: (data) => (data as { pedidoId?: string } | undefined)?.pedidoId,
    capturarAntes: async (input) =>
      prisma.documentoJuridico.findUnique({
        where: { id: input.documentoId },
        select: { id: true, titulo: true, tipo: true, statusContrato: true },
      }),
  },
  async (input, ctx) => {
    const r = await pedirAssinaturaNoPortal({
      documentoId: input.documentoId,
      versaoId: input.versaoId,
      por: { id: ctx.user.id, nome: ctx.user.name, superUsuario: ctx.user.superUsuario, ehSocio: ctx.user.ehSocio },
    });
    revalidarTelas();
    return r;
  },
);

export const cancelarAssinaturaPortal = defineAction(
  {
    modulo: "juridico",
    acao: "cancelar-assinatura-portal",
    entidade: "PedidoAssinaturaPortal",
    recurso: "juridico",
    permissao: "gerir",
    interno: true,
    schema: cancelarAssinaturaPortalSchema,
    entidadeId: (_data, input) => input.pedidoId,
    capturarAntes: async (input) => prisma.pedidoAssinaturaPortal.findUnique({ where: { id: input.pedidoId } }),
  },
  async (input, ctx) => {
    await cancelarPedidoAssinatura({ pedidoId: input.pedidoId, porId: ctx.user.id });
    revalidarTelas();
    return { pedidoId: input.pedidoId };
  },
);

export const assinarContratoNoPortal = defineAction(
  {
    modulo: "portal",
    acao: "assinar-contrato",
    entidade: "PedidoAssinaturaPortal",
    schema: assinarContratoNoPortalSchema,
    entidadeId: (_data, input) => input.pedidoId,
  },
  async (input, ctx) => {
    if (ctx.user.tipo !== "externo") throw new ActionError(MOTIVO_NAO_ENCONTRADO);
    const acesso = await contaDoPortalParaCliente(ctx.user, await clienteDoPedido(input.pedidoId));
    if (!acesso.ok) throw new ActionError(MOTIVO_NAO_ENCONTRADO);
    const userAgent = (await headers()).get("user-agent");
    const r = await assinarPedidoNoPortal({ pedidoId: input.pedidoId, conta: acesso.conta, ip: ctx.ip, userAgent });
    revalidarTelas();
    if (r.porEntrega) revalidarFinanceiro();
    return { jaAssinado: r.jaAssinado };
  },
);
