import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/with-action";
import { removerArquivo } from "@/lib/storage";
import type { z } from "zod";
import type { criarRfqSchema, registrarPropostaSchema } from "./schemas";

type CriarRfqInput = z.infer<typeof criarRfqSchema>;
type RegistrarPropostaInput = z.infer<typeof registrarPropostaSchema>;

export async function criarRfq(input: CriarRfqInput, criadoPorId: string) {
  return prisma.custoRfq.create({
    data: {
      orcamentoId: input.orcamentoId ?? null,
      titulo: input.titulo,
      descricao: input.descricao || null,
      prazoResposta: input.prazoResposta ? new Date(`${input.prazoResposta}T00:00:00Z`) : null,
      criadoPorId,
      itens: {
        create: input.itens.map((item) => ({
          insumoId: item.insumoId ?? null,
          descricao: item.descricao,
          quantidade: item.quantidade,
          unidade: item.unidade,
        })),
      },
    },
    include: { itens: true },
  });
}

/** Convida fornecedores (ignora quem já foi convidado) e abre a RFQ se ainda estava em rascunho. */
export async function convidarFornecedores(rfqId: string, fornecedorIds: string[]) {
  const rfq = await prisma.custoRfq.findUnique({ where: { id: rfqId }, select: { status: true } });
  if (!rfq) throw new ActionError("RFQ não encontrada.");
  if (rfq.status === "encerrada" || rfq.status === "cancelada") {
    throw new ActionError("RFQ já encerrada — não é possível convidar mais fornecedores.");
  }

  await prisma.custoRfqConvite.createMany({
    data: fornecedorIds.map((fornecedorId) => ({ rfqId, fornecedorId })),
    skipDuplicates: true,
  });

  if (rfq.status === "rascunho") {
    await prisma.custoRfq.update({ where: { id: rfqId }, data: { status: "aberta" } });
  }
}

/** Registra a proposta digitada por um funcionário a partir do que o fornecedor enviou. */
export async function registrarProposta(input: RegistrarPropostaInput, criadoPorId: string) {
  const rfq = await prisma.custoRfq.findUnique({
    where: { id: input.rfqId },
    select: { status: true, itens: { select: { id: true } } },
  });
  if (!rfq) throw new ActionError("RFQ não encontrada.");
  if (rfq.status === "encerrada" || rfq.status === "cancelada") {
    throw new ActionError("RFQ já encerrada — não é possível registrar nova proposta.");
  }
  const idsValidos = new Set(rfq.itens.map((i) => i.id));
  for (const item of input.itens) {
    if (!idsValidos.has(item.rfqItemId)) throw new ActionError("Item não pertence a esta RFQ.");
  }

  // Sem fluxo de revisão de proposta nesta onda — 1 proposta por fornecedor por RFQ, senão o mesmo
  // fornecedor aparece duas vezes no ranking do comparador (e, se escolhido, uma sobra `nao_escolhida`
  // ao lado da vencedora do mesmo fornecedor — confuso e sem necessidade real ainda).
  const existente = await prisma.custoProposta.findFirst({
    where: { rfqId: input.rfqId, fornecedorId: input.fornecedorId },
    select: { id: true },
  });
  if (existente) throw new ActionError("Este fornecedor já tem uma proposta registrada nesta RFQ.");

  const proposta = await prisma.$transaction(async (tx) => {
    const p = await tx.custoProposta.create({
      data: {
        rfqId: input.rfqId,
        fornecedorId: input.fornecedorId,
        frete: input.frete,
        impostosInclusos: input.impostosInclusos,
        impostosValor: input.impostosValor ?? null,
        prazoEntregaDias: input.prazoEntregaDias ?? null,
        validadeAte: input.validadeAte ? new Date(`${input.validadeAte}T00:00:00Z`) : null,
        condicoesPagamento: input.condicoesPagamento || null,
        observacoes: input.observacoes || null,
        criadoPorId,
        itens: {
          create: input.itens.map((item) => ({
            rfqItemId: item.rfqItemId,
            precoUnitario: item.precoUnitario,
            observacao: item.observacao || null,
          })),
        },
      },
      include: { itens: true },
    });
    await tx.custoRfqConvite.updateMany({
      where: { rfqId: input.rfqId, fornecedorId: input.fornecedorId },
      data: { status: "respondido", respondidoEm: new Date() },
    });
    return p;
  });

  return proposta;
}

/**
 * Escolhe o vencedor: marca a proposta `vencedora`, as demais recebidas da mesma RFQ viram
 * `nao_escolhida` (preservadas, nunca deletadas — regra invólavel #10), a RFQ fecha, e grava 1
 * `CustoPrecoHistorico` append-only por item da vencedora.
 */
export async function escolherVencedor(propostaId: string, justificativaEscolha: string, escolhidoPorId: string) {
  const proposta = await prisma.custoProposta.findUnique({
    where: { id: propostaId },
    include: { itens: { include: { rfqItem: true } } },
  });
  if (!proposta) throw new ActionError("Proposta não encontrada.");

  const hoje = new Date();
  await prisma.$transaction(async (tx) => {
    const atualizada = await tx.custoProposta.updateMany({
      where: { id: propostaId, status: "recebida" },
      data: { status: "vencedora", justificativaEscolha, escolhidoPorId, escolhidoEm: hoje },
    });
    if (atualizada.count === 0) throw new ActionError("Esta proposta já foi decidida.");
    await tx.custoProposta.updateMany({
      where: { rfqId: proposta.rfqId, id: { not: propostaId }, status: "recebida" },
      data: { status: "nao_escolhida" },
    });
    await tx.custoRfq.update({ where: { id: proposta.rfqId }, data: { status: "encerrada" } });
    await tx.custoPrecoHistorico.createMany({
      data: proposta.itens.map((item) => ({
        insumoId: item.rfqItem.insumoId,
        descricao: item.rfqItem.descricao,
        fornecedorId: proposta.fornecedorId,
        propostaId: proposta.id,
        valor: item.precoUnitario,
        unidade: item.rfqItem.unidade,
        data: hoje,
      })),
    });
  });

  return { id: propostaId };
}

export async function excluirAnexoProposta(id: string) {
  const anexo = await prisma.custoPropostaAnexo.findUnique({ where: { id }, select: { caminho: true } });
  if (!anexo) throw new ActionError("Anexo não encontrado.");
  await prisma.custoPropostaAnexo.delete({ where: { id } });
  await removerArquivo(anexo.caminho);
  return { id };
}
