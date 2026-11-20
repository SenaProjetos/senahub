import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";
import { rotuloRevisao } from "@/lib/utils";
import { escopoProjeto } from "@/modules/projetos/queries";
import { participaDoCiclo } from "@/modules/uploads/ciclo/escopo";
import { ROTULO_STATUS_PEDIDO, revisaoAindaNasEntregas, type StatusPedido } from "./regras";

/**
 * Leituras do pedido de revisão do cliente. Cada view leva só o que a tela mostra: o cliente nunca recebe quem
 * respondeu (só a resposta).
 */

const selectLinha = {
  id: true,
  status: true,
  comentario: true,
  resposta: true,
  createdAt: true,
  respondidoEm: true,
  revisaoId: true,
  uploadId: true,
  autor: { select: { name: true } },
  documento: { select: { chave: true, nomeArquivo: true, titulo: true } },
  revisao: { select: { numero: true, estado: true } },
  upload: { select: { nomeArquivo: true, substituidoPorId: true, excluidoEm: true } },
  anexos: { select: { id: true, nome: true, tamanho: true }, orderBy: { createdAt: "asc" } },
  _count: { select: { marcacoes: true } },
} satisfies Prisma.PedidoRevisaoClienteSelect;

type Linha = Prisma.PedidoRevisaoClienteGetPayload<{ select: typeof selectLinha }>;

/** A revisão do pedido ainda é a das Entregas? Mesma regra do aceite (`revisaoAindaNasEntregas`), lida da linha. */
function aindaNasEntregas(l: Linha): boolean {
  return revisaoAindaNasEntregas({
    estado: l.revisao.estado,
    participa: participaDoCiclo({ chave: l.documento.chave, extensoes: [] }),
    uploadSubstituido: l.upload.substituidoPorId !== null || l.upload.excluidoEm !== null,
    arquivada: l.revisao.estado === "arquivado",
  });
}

function baseDaView(l: Linha) {
  const status = l.status as StatusPedido;
  return {
    id: l.id,
    status,
    rotuloStatus: ROTULO_STATUS_PEDIDO[status],
    comentario: l.comentario,
    resposta: l.resposta,
    criadoEm: l.createdAt.toISOString(),
    respondidoEm: l.respondidoEm?.toISOString() ?? null,
    prancha: l.documento.titulo?.trim() || l.upload.nomeArquivo,
    arquivo: l.upload.nomeArquivo,
    uploadId: l.uploadId,
    revisao: rotuloRevisao(l.revisao.numero),
    autorNome: l.autor.name,
    marcacoes: l._count.marcacoes,
    anexos: l.anexos.map((a) => ({ id: a.id, nome: a.nome, tamanho: a.tamanho })),
    /** Só faz sentido enquanto aguarda: a prancha ganhou revisão nova e o pedido não pode mais ser aceito. */
    revisaoSubstituida: status === "aguardando" && !aindaNasEntregas(l),
  };
}

export type PedidoPortalView = ReturnType<typeof baseDaView>;

/** Pedidos do projeto para o portal (todas as contas do mesmo cliente veem todos). */
export async function pedidosDoProjetoNoPortal(projetoId: string, clienteId: string): Promise<PedidoPortalView[]> {
  const linhas = await prisma.pedidoRevisaoCliente.findMany({
    where: { projetoId, projeto: { clienteId } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: selectLinha,
  });
  return linhas.map(baseDaView);
}

export type FiltroFila = "aguardando" | "respondidos";

const selectFila = {
  ...selectLinha,
  projeto: { select: { id: true, codigo: true, nome: true } },
} satisfies Prisma.PedidoRevisaoClienteSelect;

function viewDaFila(l: Prisma.PedidoRevisaoClienteGetPayload<{ select: typeof selectFila }>) {
  return { ...baseDaView(l), projeto: l.projeto };
}

export type PedidoFilaView = ReturnType<typeof viewDaFila>;

/** Fila da coordenação (`/arquivos/pedidos-cliente`): só projetos que a pessoa enxerga. */
export async function pedidosParaCoordenacao(user: SessionUser, filtro: FiltroFila): Promise<PedidoFilaView[]> {
  const linhas = await prisma.pedidoRevisaoCliente.findMany({
    where: {
      projeto: escopoProjeto(user),
      status: filtro === "aguardando" ? "aguardando" : { not: "aguardando" },
    },
    orderBy: { createdAt: filtro === "aguardando" ? "asc" : "desc" },
    take: 200,
    select: selectFila,
  });
  return linhas.map(viewDaFila);
}

export async function contarPedidosAguardando(user: SessionUser): Promise<number> {
  return prisma.pedidoRevisaoCliente.count({ where: { projeto: escopoProjeto(user), status: "aguardando" } });
}

/** Detalhe de um pedido para a coordenação, com as marcações e o aviso de outro pedido já aceito na revisão. */
export async function pedidoParaCoordenacao(user: SessionUser, id: string) {
  const l = await prisma.pedidoRevisaoCliente.findFirst({
    where: { id, projeto: escopoProjeto(user) },
    select: {
      ...selectFila,
      respondidoPor: { select: { name: true } },
      marcacoes: { orderBy: { ordem: "asc" }, select: { id: true, ordem: true, pagina: true, texto: true, pendenciaId: true } },
    },
  });
  if (!l) return null;
  const outroAceito = await prisma.pedidoRevisaoCliente.count({
    where: { revisaoId: l.revisaoId, status: "aceito", id: { not: l.id } },
  });
  return {
    ...viewDaFila(l),
    respondidoPor: l.respondidoPor?.name ?? null,
    listaMarcacoes: l.marcacoes,
    jaHaPedidoAceitoNaRevisao: outroAceito > 0,
  };
}

export type PedidoDetalheView = NonNullable<Awaited<ReturnType<typeof pedidoParaCoordenacao>>>;
