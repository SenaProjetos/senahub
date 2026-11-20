"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { exigirEscopoDaRevisao } from "@/modules/uploads/ciclo/acesso";
import { aceitarPedidoSchema, cancelarPedidoSchema, criarPedidoSchema, recusarPedidoSchema } from "./schemas";
import {
  aceitarPedidoNoBanco,
  avisarPedidoNovo,
  avisarResposta,
  cancelarPedidoNoBanco,
  criarPedidoNoBanco,
  recusarPedidoNoBanco,
} from "./service";

/**
 * Ações do pedido de revisão do cliente. As do CLIENTE (criar, cancelar) não têm permissão de catálogo: o portal não
 * tem perfil de acesso para isso, e quem decide é o serviço (conta externa com acesso ao projeto + prancha nas
 * Entregas). As da COORDENAÇÃO usam `arquivos:alterar_status` (o mesmo de marcar "Em revisão") e a muralha da
 * disciplina da revisão; aceitar ainda exige `uploads:validar`, porque os rascunhos de apontamento ficam com quem aceita.
 */

export const criarPedidoRevisao = defineAction(
  {
    modulo: "portal",
    acao: "pedido-revisao-criar",
    entidade: "PedidoRevisaoCliente",
    schema: criarPedidoSchema,
    entidadeId: (data) => (data as { id: string }).id,
  },
  async (input, { user }) => {
    if (user.tipo !== "externo") throw new ActionError("Só o cliente pede revisão pelo portal.");
    const criado = await criarPedidoNoBanco({
      autor: user,
      projetoId: input.projetoId,
      uploadId: input.uploadId,
      comentario: input.comentario,
      marcacoes: input.marcacoes ?? [],
    });
    await avisarPedidoNovo(criado.id);
    revalidatePath(`/portal/${input.projetoId}`);
    return { id: criado.id };
  },
);

export const cancelarPedidoRevisao = defineAction(
  {
    modulo: "portal",
    acao: "pedido-revisao-cancelar",
    entidade: "PedidoRevisaoCliente",
    schema: cancelarPedidoSchema,
    entidadeId: (_d, input) => input.id,
  },
  async (input, { user }) => {
    if (user.tipo !== "externo") throw new ActionError("Só o cliente cancela o próprio pedido.");
    await cancelarPedidoNoBanco({ id: input.id, autor: user });
    revalidatePath("/portal", "layout");
    return { id: input.id };
  },
);

async function exigirEscopoDoPedido(user: Parameters<typeof exigirEscopoDaRevisao>[0], pedidoId: string): Promise<void> {
  const p = await prisma.pedidoRevisaoCliente.findUnique({ where: { id: pedidoId }, select: { revisaoId: true } });
  if (!p) throw new ActionError("Pedido não encontrado.");
  await exigirEscopoDaRevisao(user, p.revisaoId);
}

export const aceitarPedidoRevisao = defineAction(
  {
    modulo: "portal",
    acao: "pedido-revisao-aceitar",
    recurso: "arquivos",
    permissao: "alterar_status",
    interno: true,
    entidade: "PedidoRevisaoCliente",
    schema: aceitarPedidoSchema,
    entidadeId: (_d, input) => input.id,
  },
  async (input, { user }) => {
    await exigirEscopoDoPedido(user, input.id);
    const podeValidar = await can(user, "uploads", "validar");
    const r = await aceitarPedidoNoBanco({ id: input.id, quem: { id: user.id, podeValidar }, resposta: input.resposta ?? null });
    await avisarResposta(input.id);
    revalidatePath("/arquivos/pedidos-cliente", "layout");
    return { id: input.id, ...r };
  },
);

export const recusarPedidoRevisao = defineAction(
  {
    modulo: "portal",
    acao: "pedido-revisao-recusar",
    recurso: "arquivos",
    permissao: "alterar_status",
    interno: true,
    entidade: "PedidoRevisaoCliente",
    schema: recusarPedidoSchema,
    entidadeId: (_d, input) => input.id,
  },
  async (input, { user }) => {
    await exigirEscopoDoPedido(user, input.id);
    await recusarPedidoNoBanco({ id: input.id, quem: { id: user.id }, resposta: input.resposta });
    await avisarResposta(input.id);
    revalidatePath("/arquivos/pedidos-cliente", "layout");
    return { id: input.id };
  },
);
