import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/with-action";
import { acessoDoUsuarioAoProjetoDoPortal, type UsuarioDaSessao } from "@/modules/portal/acesso";
import { uploadLiberadoNoAlcance } from "@/modules/projetos/arquivos/link-publico";
import {
  aplicarControleNoTx,
  carregarRevisao,
  estadoParaTransicao,
  uploadsComBloqueioDeDownload,
} from "@/modules/uploads/ciclo/service";
import {
  LIMITE_COMENTARIO,
  LIMITE_RESPOSTA,
  MOTIVO_JA_RESPONDIDO,
  motivoEmRevisao,
  motivoParaNaoAceitar,
  motivoParaNaoCancelar,
  motivoParaNaoRecusar,
  motivoDoAnexo,
  type EstadoDaRevisao,
  type StatusPedido,
} from "./regras";

/**
 * Pedido de revisão do cliente (spec 2026-11-19-portal-pedido-revisao-design.md). O ÚNICO lugar que grava
 * `PedidoRevisaoCliente`: toda troca de status é `updateMany` condicionado a `aguardando` (dois cliques, ou aceite e
 * cancelamento ao mesmo tempo, = um só vence). O aceite é a única porta para `Pendencia`/`ControleRevisao`, pelos
 * serviços de sempre.
 */

type Tx = Prisma.TransactionClient;

export const MOTIVO_PRANCHA_FORA = "Esta prancha não está nas suas entregas.";
export const MOTIVO_PEDIDO_NAO_ENCONTRADO = "Pedido não encontrado.";

function textoObrigatorio(valor: string, limite: number, vazio: string, longo: string): string {
  const t = valor.trim();
  if (!t) throw new ActionError(vazio);
  if (t.length > limite) throw new ActionError(longo);
  return t;
}

/**
 * A prancha em que o cliente quer pedir: conta do portal com acesso ao projeto, upload PDF nas Entregas (mesma regra
 * do download) e sem bloqueio de download. Devolve o que o pedido grava.
 */
export async function pranchaDoPedido(autor: UsuarioDaSessao, projetoId: string, uploadId: string) {
  const acesso = await acessoDoUsuarioAoProjetoDoPortal(autor, projetoId);
  if (!acesso.ok) throw new ActionError(MOTIVO_PRANCHA_FORA);
  const liberado = await uploadLiberadoNoAlcance(acesso.alcance, uploadId);
  if (!liberado || !liberado.nomeArquivo.toLowerCase().endsWith(".pdf")) throw new ActionError(MOTIVO_PRANCHA_FORA);
  if ((await uploadsComBloqueioDeDownload(prisma, [uploadId])).size > 0) throw new ActionError(MOTIVO_PRANCHA_FORA);
  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: { id: true, documentoId: true, revisaoId: true, disciplinaId: true },
  });
  if (!upload?.documentoId || !upload.revisaoId) throw new ActionError(MOTIVO_PRANCHA_FORA);
  return { projetoId, uploadId: upload.id, documentoId: upload.documentoId, revisaoId: upload.revisaoId };
}

export async function criarPedidoNoBanco(p: {
  autor: UsuarioDaSessao;
  projetoId: string;
  uploadId: string;
  comentario: string;
}): Promise<{ id: string }> {
  const comentario = textoObrigatorio(
    p.comentario,
    LIMITE_COMENTARIO,
    "Escreva o que você quer revisar.",
    `O comentário passa de ${LIMITE_COMENTARIO} caracteres.`,
  );
  const prancha = await pranchaDoPedido(p.autor, p.projetoId, p.uploadId);
  const criado = await prisma.pedidoRevisaoCliente.create({
    data: { ...prancha, autorId: p.autor.id, comentario },
    select: { id: true },
  });
  return criado;
}

/** O cliente (qualquer conta do MESMO cliente do projeto, com acesso ao portal) cancela enquanto aguarda. */
export async function cancelarPedidoNoBanco(p: { id: string; autor: UsuarioDaSessao }): Promise<void> {
  const pedido = await prisma.pedidoRevisaoCliente.findUnique({ where: { id: p.id }, select: { projetoId: true, status: true } });
  if (!pedido) throw new ActionError(MOTIVO_PEDIDO_NAO_ENCONTRADO);
  const acesso = await acessoDoUsuarioAoProjetoDoPortal(p.autor, pedido.projetoId);
  if (!acesso.ok) throw new ActionError(MOTIVO_PEDIDO_NAO_ENCONTRADO);
  const motivo = motivoParaNaoCancelar({ status: pedido.status as StatusPedido });
  if (motivo) throw new ActionError(motivo);
  const { count } = await prisma.pedidoRevisaoCliente.updateMany({
    where: { id: p.id, status: "aguardando" },
    data: { status: "cancelado", canceladoEm: new Date() },
  });
  if (count !== 1) throw new ActionError(MOTIVO_JA_RESPONDIDO);
}

/** A revisão do pedido ainda é a das Entregas? Lê o estado do ciclo e se o PDF do pedido foi substituído/excluído. */
export async function estadoDaRevisaoDoPedido(
  db: Tx | typeof prisma,
  pedido: { revisaoId: string; uploadId: string },
): Promise<EstadoDaRevisao> {
  const r = await carregarRevisao(db, pedido.revisaoId);
  const up = await db.upload.findFirst({
    where: { id: pedido.uploadId, substituidoPorId: { not: undefined } },
    select: { substituidoPorId: true, excluidoEm: true },
  });
  return {
    estado: r.estado,
    participa: estadoParaTransicao(r).participa,
    uploadSubstituido: !up || up.substituidoPorId !== null || up.excluidoEm !== null,
    arquivada: r.estado === "arquivado",
  };
}

export type ResultadoAceite = { emRevisao: boolean; jaEstavaEmRevisao: boolean; rascunhos: number };

/**
 * Aceita: status → aceito; revisão publicada do ciclo ganha "Em revisão" (motivo = o pedido), se ainda não tiver —
 * sem avisar os projetistas (nada chega a eles antes da rodada). Uma transação; a linha da revisão é travada para
 * dois aceites de pedidos diferentes na mesma revisão não disputarem a marca.
 */
export async function aceitarPedidoNoBanco(p: {
  id: string;
  quem: { id: string; podeValidar: boolean };
  resposta: string | null;
}): Promise<ResultadoAceite> {
  const resposta = p.resposta?.trim() ? p.resposta.trim() : null;
  if (resposta && resposta.length > LIMITE_RESPOSTA) throw new ActionError(`A resposta passa de ${LIMITE_RESPOSTA} caracteres.`);
  return prisma.$transaction(async (tx) => {
    const pedido = await tx.pedidoRevisaoCliente.findUnique({
      where: { id: p.id },
      select: { id: true, status: true, revisaoId: true, uploadId: true, comentario: true },
    });
    if (!pedido) throw new ActionError(MOTIVO_PEDIDO_NAO_ENCONTRADO);
    await tx.$queryRaw`SELECT id FROM documento_revisao WHERE id = ${pedido.revisaoId} FOR UPDATE`;
    const revisao = await estadoDaRevisaoDoPedido(tx, pedido);
    const motivo = motivoParaNaoAceitar({ status: pedido.status as StatusPedido, podeValidar: p.quem.podeValidar, revisao });
    if (motivo) throw new ActionError(motivo);

    const { count } = await tx.pedidoRevisaoCliente.updateMany({
      where: { id: pedido.id, status: "aguardando" },
      data: { status: "aceito", resposta, respondidoPorId: p.quem.id, respondidoEm: new Date() },
    });
    if (count !== 1) throw new ActionError(MOTIVO_JA_RESPONDIDO);

    let emRevisao = false;
    let jaEstavaEmRevisao = false;
    if (revisao.participa && revisao.estado === "publicado") {
      const r = await carregarRevisao(tx, pedido.revisaoId);
      jaEstavaEmRevisao = r.controles.some((c) => c.tipo === "em_revisao");
      if (!jaEstavaEmRevisao) {
        await aplicarControleNoTx(tx, r, "em_revisao", {
          quem: { userId: p.quem.id },
          motivo: motivoEmRevisao(pedido.comentario),
          origem: "pedido_cliente",
          detalhe: { pedidoId: pedido.id },
        });
        emRevisao = true;
      }
    }
    return { emRevisao, jaEstavaEmRevisao, rascunhos: 0 };
  });
}

export async function recusarPedidoNoBanco(p: { id: string; quem: { id: string }; resposta: string }): Promise<void> {
  const pedido = await prisma.pedidoRevisaoCliente.findUnique({ where: { id: p.id }, select: { status: true } });
  if (!pedido) throw new ActionError(MOTIVO_PEDIDO_NAO_ENCONTRADO);
  const motivo = motivoParaNaoRecusar({ status: pedido.status as StatusPedido, resposta: p.resposta });
  if (motivo) throw new ActionError(motivo);
  const resposta = p.resposta.trim();
  if (resposta.length > LIMITE_RESPOSTA) throw new ActionError(`A resposta passa de ${LIMITE_RESPOSTA} caracteres.`);
  const { count } = await prisma.pedidoRevisaoCliente.updateMany({
    where: { id: p.id, status: "aguardando" },
    data: { status: "recusado", resposta, respondidoPorId: p.quem.id, respondidoEm: new Date() },
  });
  if (count !== 1) throw new ActionError(MOTIVO_JA_RESPONDIDO);
}

// ─────────────────────────────────────────────────────────────
// Anexos (rota /api/portal/pedidos/[id]/anexos)
// ─────────────────────────────────────────────────────────────

export const MOTIVO_ANEXO_SO_AUTOR = "Só quem fez o pedido anexa arquivos, e só enquanto ele aguarda a equipe.";

/**
 * Checagem barata ANTES de gravar o arquivo no disco: autor, aguardando, limite e extensão. A mesma checagem se
 * repete na transação de `gravarAnexoNoBanco` (dois envios ao mesmo tempo não passam de 5).
 */
export async function motivoParaAnexar(p: { pedidoId: string; userId: string; nome: string }): Promise<string | null> {
  const pedido = await prisma.pedidoRevisaoCliente.findUnique({
    where: { id: p.pedidoId },
    select: { autorId: true, status: true, _count: { select: { anexos: true } } },
  });
  if (!pedido || pedido.autorId !== p.userId || pedido.status !== "aguardando") return MOTIVO_ANEXO_SO_AUTOR;
  return motivoDoAnexo({ nome: p.nome, jaTem: pedido._count.anexos });
}

export async function gravarAnexoNoBanco(p: {
  pedidoId: string;
  userId: string;
  nome: string;
  caminho: string;
  tamanho: number;
  mime: string;
}): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM pedido_revisao_cliente WHERE id = ${p.pedidoId} FOR UPDATE`;
    const pedido = await tx.pedidoRevisaoCliente.findUnique({
      where: { id: p.pedidoId },
      select: { autorId: true, status: true, _count: { select: { anexos: true } } },
    });
    if (!pedido || pedido.autorId !== p.userId || pedido.status !== "aguardando") throw new ActionError(MOTIVO_ANEXO_SO_AUTOR);
    const motivo = motivoDoAnexo({ nome: p.nome, jaTem: pedido._count.anexos });
    if (motivo) throw new ActionError(motivo);
    return tx.anexoPedidoCliente.create({
      data: { pedidoId: p.pedidoId, nome: p.nome, caminho: p.caminho, tamanho: p.tamanho, mime: p.mime },
      select: { id: true },
    });
  });
}

/**
 * Quem baixa um anexo: a coordenação (`arquivos:alterar_status` + projeto no escopo) ou uma conta do portal com
 * acesso ao projeto do pedido. Devolve o arquivo ou null (a rota responde 404 nos dois casos).
 */
export async function anexoParaBaixar(
  user: (UsuarioDaSessao & { superUsuario?: boolean }) | null,
  anexoId: string,
  podeCoordenar: (projetoId: string) => Promise<boolean>,
): Promise<{ nome: string; caminho: string; mime: string; projetoId: string } | null> {
  if (!user) return null;
  const anexo = await prisma.anexoPedidoCliente.findUnique({
    where: { id: anexoId },
    select: { nome: true, caminho: true, mime: true, pedido: { select: { projetoId: true } } },
  });
  if (!anexo) return null;
  const projetoId = anexo.pedido.projetoId;
  const pode =
    user.tipo === "externo" ? (await acessoDoUsuarioAoProjetoDoPortal(user, projetoId)).ok : await podeCoordenar(projetoId);
  return pode ? { nome: anexo.nome, caminho: anexo.caminho, mime: anexo.mime, projetoId } : null;
}
