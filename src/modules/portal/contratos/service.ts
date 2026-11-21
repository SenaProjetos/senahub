import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { notificar } from "@/lib/notificar";
import { smtpConfigurado } from "@/lib/mail";
import { enviarEmailTemplate } from "@/lib/email-templates";
import { exigirSocioSeAcimaDaAlcada } from "@/modules/juridico/alcada";
import { assinarVersaoNoTx, depoisDeAssinar, hashDaVersao } from "@/modules/juridico/assinatura/assinar-service";
import { comRetentativaDeConflito } from "@/modules/juridico/assinatura/service";
import { devePassarParaAssinado } from "@/modules/juridico/contrato/estado";
import type { ContaDoPortal } from "./acesso";
import {
  MOTIVO_ENCERRADO,
  MOTIVO_JA_PEDIDO,
  MOTIVO_MUDOU,
  MOTIVO_NAO_AGUARDANDO,
  MOTIVO_NAO_ENCONTRADO,
  MOTIVO_VERSAO_NAO_VIGENTE,
  motivoParaNaoAssinar,
  motivoParaNaoPedir,
  situacaoDoPedido,
  textoAssinadoNoPortal,
  textoPedidoAssinatura,
} from "./regras";

/**
 * O pedido de assinatura de contrato pelo portal do cliente (spec
 * `docs/superpowers/specs/2026-11-21-portal-assinatura-contrato-design.md`): a equipe pede, o cliente assina, a equipe
 * cancela. Toda mudança de situação do pedido é um `updateMany` condicionado a `aguardando`; cliente e projeto são
 * sempre lidos do `DocumentoJuridico`. Avisos só depois do commit — falha de aviso nunca desfaz nada.
 *
 * Ordem das travas (pedir e assinar): pedido(s) → documento. A mesma ordem nos dois caminhos evita deadlock quando a
 * equipe pede de novo enquanto o cliente assina o pedido antigo.
 */

export type AvisarAssinatura = {
  notificar: (userId: string, n: { titulo: string; corpo: string; href: string }) => Promise<void>;
  enviarEmail: ((to: string, slug: string, vars: Record<string, string>) => Promise<boolean>) | null;
};

const avisosPadrao = (): AvisarAssinatura => ({
  notificar: (userId, n) => notificar(userId, n),
  enviarEmail: smtpConfigurado() ? enviarEmailTemplate : null,
});

function ehConflitoDeUnico(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? "";

export async function pedirAssinaturaNoPortal(
  p: { documentoId: string; versaoId: string; por: { id: string; nome: string; superUsuario: boolean; ehSocio: boolean } },
  deps: AvisarAssinatura = avisosPadrao(),
): Promise<{ pedidoId: string; avisadas: number; emails: number }> {
  const doc = await prisma.documentoJuridico.findUnique({
    where: { id: p.documentoId },
    select: {
      id: true,
      titulo: true,
      tipo: true,
      vinculoId: true,
      clienteId: true,
      projetoId: true,
      statusContrato: true,
      valor: true,
      cliente: { select: { ativo: true } },
      projeto: { select: { nome: true, clienteId: true } },
    },
  });
  if (!doc) throw new ActionError("Documento não encontrado.");
  const versoes = await prisma.docJuridicoVersao.findMany({
    where: { documentoId: doc.id },
    select: { id: true, numero: true, arquivoNome: true },
    orderBy: { numero: "desc" },
  });
  const versao = versoes.find((v) => v.id === p.versaoId);
  if (!versao) throw new ActionError("Versão não encontrada.");
  const vigente = versoes[0];
  const contas = doc.clienteId
    ? await prisma.user.findMany({
        where: { tipo: "externo", ativo: true, clienteId: doc.clienteId },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      })
    : [];
  const aguardandoNaVigente = await prisma.pedidoAssinaturaPortal.count({
    where: { documentoId: doc.id, status: "aguardando", versaoId: vigente.id },
  });

  const motivo = motivoParaNaoPedir({
    tipo: doc.tipo,
    vinculoId: doc.vinculoId,
    clienteId: doc.clienteId,
    clienteAtivo: doc.cliente?.ativo ?? false,
    projetoClienteId: doc.projetoId ? (doc.projeto?.clienteId ?? null) : undefined,
    contasAtivas: contas.length,
    versaoNumero: versao.numero,
    versaoVigenteNumero: vigente.numero,
    arquivoNome: versao.arquivoNome,
    statusContrato: doc.statusContrato,
    temPedidoAguardandoNaVigente: aguardandoNaVigente > 0,
  });
  if (motivo) throw new ActionError(motivo);
  // A alçada é de QUEM PEDE, e só quando a assinatura vai mudar o status (como no Jurídico): o cliente nunca
  // assina pelo portal um contrato acima do limite que ninguém com alçada pediu.
  if (devePassarParaAssinado(doc.tipo, doc.statusContrato)) {
    await exigirSocioSeAcimaDaAlcada(doc.valor?.toNumber(), p.por);
  }

  let pedidoId: string;
  try {
    pedidoId = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM pedido_assinatura_portal WHERE "documentoId" = ${doc.id} AND status = 'aguardando' FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM documento_juridico WHERE id = ${doc.id} FOR UPDATE`;
      // Relê depois das travas: versão nova ou outro pedido podem ter chegado desde a leitura acima.
      const vig = await tx.docJuridicoVersao.findFirst({
        where: { documentoId: doc.id },
        orderBy: { numero: "desc" },
        select: { id: true },
      });
      if (vig?.id !== p.versaoId) throw new ActionError(MOTIVO_VERSAO_NAO_VIGENTE);
      const atual = await tx.documentoJuridico.findUnique({ where: { id: doc.id }, select: { statusContrato: true } });
      if (atual?.statusContrato === "vencido" || atual?.statusContrato === "rescindido") throw new ActionError(MOTIVO_ENCERRADO);
      const ja = await tx.pedidoAssinaturaPortal.findFirst({
        where: { documentoId: doc.id, status: "aguardando", versaoId: p.versaoId },
        select: { id: true },
      });
      if (ja) throw new ActionError(MOTIVO_JA_PEDIDO);
      // O que ainda está aguardando é de versão substituída: cancela NESTA transação, senão o índice parcial
      // (um aguardando por documento) recusaria o pedido novo.
      await tx.pedidoAssinaturaPortal.updateMany({
        where: { documentoId: doc.id, status: "aguardando" },
        data: { status: "cancelado", canceladoPorId: p.por.id, canceladoEm: new Date() },
      });
      const criado = await tx.pedidoAssinaturaPortal.create({
        data: { documentoId: doc.id, versaoId: p.versaoId, pedidoPorId: p.por.id },
        select: { id: true },
      });
      return criado.id;
    });
  } catch (e) {
    // Dois pedidos ao mesmo tempo: o índice parcial `pedido_assinatura_portal_um_aguardando` decide.
    if (ehConflitoDeUnico(e)) throw new ActionError(MOTIVO_JA_PEDIDO);
    throw e;
  }

  // Depois do commit: o aviso nunca desfaz o pedido.
  const href = doc.projetoId ? `/portal/${doc.projetoId}#contratos` : "/portal#contratos";
  const texto = textoPedidoAssinatura({
    documentoTitulo: doc.titulo,
    tipo: doc.tipo,
    projetoNome: doc.projeto?.nome ?? null,
    porNome: p.por.nome,
  });
  const app = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  let avisadas = 0;
  let emails = 0;
  for (const conta of contas) {
    try {
      await deps.notificar(conta.id, { ...texto, href });
      avisadas += 1;
    } catch (e) {
      console.error("[contrato-portal] sino do pedido falhou:", e);
    }
    if (deps.enviarEmail && conta.email) {
      try {
        const enviado = await deps.enviarEmail(conta.email, "portal-contrato-assinatura", {
          nome: primeiroNome(conta.name),
          documento: doc.titulo,
          projeto: doc.projeto?.nome ?? "",
          url: `${app}${href}`,
        });
        if (enviado) emails += 1;
      } catch (e) {
        console.error("[contrato-portal] e-mail do pedido falhou:", e);
      }
    }
  }
  return { pedidoId, avisadas, emails };
}

export async function cancelarPedidoAssinatura(p: { pedidoId: string; porId: string }): Promise<void> {
  const { count } = await prisma.pedidoAssinaturaPortal.updateMany({
    where: { id: p.pedidoId, status: "aguardando" },
    data: { status: "cancelado", canceladoPorId: p.porId, canceladoEm: new Date() },
  });
  if (count !== 1) throw new ActionError(MOTIVO_NAO_AGUARDANDO);
}

export async function assinarPedidoNoPortal(
  p: { pedidoId: string; conta: ContaDoPortal; ip: string | null; userAgent: string | null },
  deps: Pick<AvisarAssinatura, "notificar"> = avisosPadrao(),
): Promise<{ aceiteId: string; jaAssinado: boolean; documentoProjetoId: string | null; porEntrega: boolean }> {
  const naoEncontrado = () => new ActionError(MOTIVO_NAO_ENCONTRADO);
  const pedido = await prisma.pedidoAssinaturaPortal.findUnique({
    where: { id: p.pedidoId },
    select: { id: true, documentoId: true, versaoId: true, pedidoPorId: true },
  });
  if (!pedido) throw naoEncontrado();
  const doc = await prisma.documentoJuridico.findUnique({
    where: { id: pedido.documentoId },
    select: { titulo: true, clienteId: true, cliente: { select: { ativo: true } } },
  });
  // A conta é conferida no banco, não só pelo que a action passou: externa, ativa, do cliente do documento, e o
  // cliente ativo. Qualquer recusa é a mesma frase — nunca diz se o pedido existe.
  const conta = await prisma.user.findUnique({
    where: { id: p.conta.userId },
    select: { tipo: true, ativo: true, clienteId: true },
  });
  if (
    !doc ||
    !doc.clienteId ||
    doc.clienteId !== p.conta.clienteId ||
    !doc.cliente?.ativo ||
    !conta ||
    conta.tipo !== "externo" ||
    !conta.ativo ||
    conta.clienteId !== doc.clienteId
  ) {
    throw naoEncontrado();
  }

  const hashArquivo = await hashDaVersao(pedido.versaoId);

  const { r, versaoNumero } = await comRetentativaDeConflito(() =>
    prisma.$transaction(async (tx) => {
      // Trava o pedido e depois o documento (ver a ordem no topo do arquivo). Leituras planas, uma de cada vez.
      await tx.$queryRaw`SELECT id FROM pedido_assinatura_portal WHERE id = ${pedido.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM documento_juridico WHERE id = ${pedido.documentoId} FOR UPDATE`;
      const atual = await tx.pedidoAssinaturaPortal.findUnique({
        where: { id: pedido.id },
        select: { status: true, versaoId: true },
      });
      const versao = await tx.docJuridicoVersao.findUnique({ where: { id: pedido.versaoId }, select: { numero: true } });
      const vigente = await tx.docJuridicoVersao.findFirst({
        where: { documentoId: pedido.documentoId },
        orderBy: { numero: "desc" },
        select: { numero: true },
      });
      const d = await tx.documentoJuridico.findUnique({
        where: { id: pedido.documentoId },
        select: { statusContrato: true, clienteId: true },
      });
      if (!atual || !versao || !vigente || !d || d.clienteId !== p.conta.clienteId) throw naoEncontrado();
      const motivo = motivoParaNaoAssinar(
        situacaoDoPedido(
          { status: atual.status, versaoNumero: versao.numero },
          { versaoVigenteNumero: vigente.numero, statusContrato: d.statusContrato },
        ),
      );
      if (motivo) throw new ActionError(motivo);

      const r = await assinarVersaoNoTx(tx, {
        versaoId: pedido.versaoId,
        ator: { id: p.conta.userId, nome: p.conta.nome },
        // O Financeiro é só interno: os recebíveis gerados pela assinatura são de quem PEDIU.
        autorFinanceiroId: pedido.pedidoPorId,
        hashArquivo,
        ip: p.ip,
        userAgent: p.userAgent,
      });

      // A mesma conta já tinha assinado esta versão (pelo Jurídico): fecha o pedido com o aceite existente — a não ser
      // que outro pedido já o carregue (`aceiteId` é único), e aí o pedido fecha sem apontar para ele.
      let aceiteId: string | null = r.aceiteId;
      if (r.jaAssinado) {
        const outro = await tx.pedidoAssinaturaPortal.findFirst({ where: { aceiteId: r.aceiteId }, select: { id: true } });
        if (outro) aceiteId = null;
      }
      const { count } = await tx.pedidoAssinaturaPortal.updateMany({
        where: { id: pedido.id, status: "aguardando" },
        data: {
          status: "assinado",
          aceiteId,
          assinadoPorId: p.conta.userId,
          assinadoPorNome: p.conta.nome,
          assinadoEm: new Date(),
        },
      });
      if (count !== 1) throw new ActionError(MOTIVO_MUDOU);
      return { r, versaoNumero: versao.numero };
    }),
  );

  // Depois do commit. Uma falha aqui não desfaz a assinatura nem pode parecer, para o cliente, que ela não aconteceu.
  try {
    await depoisDeAssinar(r, pedido.pedidoPorId);
  } catch (e) {
    console.error("[contrato-portal] previsões depois da assinatura falharam:", e);
  }
  try {
    const quemPediu = await prisma.user.findUnique({ where: { id: pedido.pedidoPorId }, select: { ativo: true } });
    if (quemPediu?.ativo) {
      const texto = textoAssinadoNoPortal({ documentoTitulo: doc.titulo, versaoNumero, contaNome: p.conta.nome });
      await deps.notificar(pedido.pedidoPorId, { ...texto, href: "/juridico" });
    }
  } catch (e) {
    console.error("[contrato-portal] sino da assinatura falhou:", e);
  }

  return {
    aceiteId: r.aceiteId,
    jaAssinado: r.jaAssinado,
    documentoProjetoId: r.documento.projetoId,
    porEntrega: !r.jaAssinado && r.documento.formaCobranca === "por_entrega" && !r.documento.vinculoId,
  };
}
