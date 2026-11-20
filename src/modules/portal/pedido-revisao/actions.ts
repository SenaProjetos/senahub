"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";
import { exigirEscopoDaRevisao } from "@/modules/uploads/ciclo/acesso";
import {
  aceitarPedidoSchema,
  cancelarPedidoSchema,
  criarPedidoModeloSchema,
  criarPedidoSchema,
  recusarPedidoSchema,
} from "./schemas";
import {
  aceitarPedidoModeloNoBanco,
  aceitarPedidoNoBanco,
  avisarPedidoNovo,
  avisarResposta,
  cancelarPedidoNoBanco,
  criarPedidoModeloNoBanco,
  criarPedidoNoBanco,
  exigirEscopoDoPedidoModelo,
  recusarPedidoNoBanco,
} from "./service";
import { MOTIVO_SEM_COORDENACAO, tipoDoPedido, type TipoPedido } from "./modelo-regras";

/**
 * Ações do pedido de revisão do cliente. As do CLIENTE (criar, cancelar) não têm permissão de catálogo: o portal não
 * tem perfil de acesso para isso, e quem decide é o serviço (conta externa com acesso ao projeto + prancha nas
 * Entregas, ou modelo 3D que o portal mostra). As da COORDENAÇÃO usam `arquivos:alterar_status` (o mesmo de marcar
 * "Em revisão") e a muralha da disciplina da revisão. Aceitar uma prancha ainda exige `uploads:validar` (os rascunhos
 * de apontamento ficam com quem aceita); aceitar um modelo exige `coordenacao:gerir` (quem cria apontamento 3D).
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

/** Pedido no modelo 3D: devolve os ids das marcações, na ordem, para a tela enviar a imagem de cada vista. */
export const criarPedidoModelo = defineAction(
  {
    modulo: "portal",
    acao: "pedido-revisao-modelo-criar",
    entidade: "PedidoRevisaoCliente",
    schema: criarPedidoModeloSchema,
    entidadeId: (data) => (data as { id: string }).id,
  },
  async (input, { user }) => {
    if (user.tipo !== "externo") throw new ActionError("Só o cliente pede revisão pelo portal.");
    const criado = await criarPedidoModeloNoBanco({
      autor: user,
      projetoId: input.projetoId,
      comentario: input.comentario,
      marcacoes: input.marcacoes,
    });
    await avisarPedidoNovo(criado.id);
    revalidatePath(`/portal/${input.projetoId}`);
    return { id: criado.id, marcacaoIds: criado.marcacaoIds };
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

/** A muralha de aceitar/recusar: a da revisão (prancha) ou a do pedido de modelo. Devolve o tipo do pedido. */
async function exigirEscopoDoPedido(user: SessionUser, pedidoId: string): Promise<TipoPedido> {
  const p = await prisma.pedidoRevisaoCliente.findUnique({ where: { id: pedidoId }, select: { tipo: true, revisaoId: true } });
  if (!p) throw new ActionError("Pedido não encontrado.");
  const tipo = tipoDoPedido(p.tipo);
  if (tipo === "modelo") await exigirEscopoDoPedidoModelo(user, pedidoId);
  else if (p.revisaoId) await exigirEscopoDaRevisao(user, p.revisaoId);
  else throw new ActionError("Pedido não encontrado.");
  return tipo;
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
    const tipo = await exigirEscopoDoPedido(user, input.id);
    const resposta = input.resposta ?? null;
    let resultado: { emRevisao: boolean; jaEstavaEmRevisao: boolean; rascunhos: number; apontamentos: number };
    if (tipo === "modelo") {
      if (!(await can(user, "coordenacao", "gerir"))) throw new ActionError(MOTIVO_SEM_COORDENACAO);
      const r = await aceitarPedidoModeloNoBanco({ id: input.id, quem: { id: user.id }, resposta });
      resultado = { emRevisao: r.emRevisao > 0, jaEstavaEmRevisao: false, rascunhos: 0, apontamentos: r.apontamentos };
    } else {
      const podeValidar = await can(user, "uploads", "validar");
      const r = await aceitarPedidoNoBanco({ id: input.id, quem: { id: user.id, podeValidar }, resposta });
      resultado = { ...r, apontamentos: 0 };
    }
    await avisarResposta(input.id);
    revalidatePath("/arquivos/pedidos-cliente", "layout");
    return { id: input.id, tipo, ...resultado };
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
    const tipo = await exigirEscopoDoPedido(user, input.id);
    if (tipo === "modelo" && !(await can(user, "coordenacao", "gerir"))) throw new ActionError(MOTIVO_SEM_COORDENACAO);
    await recusarPedidoNoBanco({ id: input.id, quem: { id: user.id }, resposta: input.resposta });
    await avisarResposta(input.id);
    revalidatePath("/arquivos/pedidos-cliente", "layout");
    return { id: input.id };
  },
);
