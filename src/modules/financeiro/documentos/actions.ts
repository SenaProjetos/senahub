"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { addMonths } from "date-fns";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { removerArquivo } from "@/lib/storage";
import { TIPO_DOC_LABEL } from "@/modules/financeiro/documentos/queries";

const base = { modulo: "financeiro", recurso: "financeiro", permissao: "gerir" } as const;
const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

const meta = z.object({
  caminho: z.string().min(1),
  nomeArquivo: z.string().min(1),
  mime: z.string().min(1),
});

function dataOuNull(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(s + "T00:00:00Z");
  return isNaN(d.getTime()) ? null : d;
}

const rev = () => {
  revalidatePath("/financeiro/documentos");
  revalidatePath("/financeiro/lancamentos");
};

export const criarDocumentoFinanceiro = defineAction(
  {
    ...base,
    acao: "criar-doc-financeiro",
    entidade: "DocumentoFinanceiro",
    schema: z.object({
      tipo: z.enum(["nf_entrada", "nf_servico", "contrato", "proposta", "medicao"]),
      numero: opt(z.string()),
      dataEmissao: opt(z.string()),
      valorDocumento: z.number().min(0).optional(),
      fornecedorId: opt(z.string()),
      clienteId: opt(z.string()),
      referenciaId: opt(z.string()),
      observacao: opt(z.string()),
      meta: meta.optional(),
    }),
  },
  async (i, ctx) => {
    const d = await prisma.documentoFinanceiro.create({
      data: {
        tipo: i.tipo,
        numero: i.numero || null,
        dataEmissao: dataOuNull(i.dataEmissao),
        valorDocumento: i.valorDocumento ?? null,
        fornecedorId: i.fornecedorId || null,
        clienteId: i.clienteId || null,
        referenciaId: i.referenciaId || null,
        observacao: i.observacao || null,
        arquivoPath: i.meta?.caminho ?? null,
        arquivoNome: i.meta?.nomeArquivo ?? null,
        arquivoMime: i.meta?.mime ?? null,
        autorId: ctx.user.id,
      },
    });
    rev();
    return { id: d.id };
  },
);

export const excluirDocumentoFinanceiro = defineAction(
  { ...base, acao: "excluir-doc-financeiro", entidade: "DocumentoFinanceiro", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    const d = await prisma.documentoFinanceiro.findUnique({ where: { id: i.id }, select: { arquivoPath: true } });
    if (!d) throw new ActionError("Documento não encontrado.");
    await prisma.documentoFinanceiro.delete({ where: { id: i.id } }); // lançamentos → documentoFinanceiroId = null (SetNull)
    if (d.arquivoPath) await removerArquivo(d.arquivoPath);
    rev();
    return { id: i.id };
  },
);

/** Gera N parcelas (lançamentos previstos) vinculadas ao documento, dividindo o valor total. */
export const gerarParcelasDoDocumento = defineAction(
  {
    ...base,
    acao: "gerar-parcelas-doc",
    entidade: "Lancamento",
    schema: z.object({
      documentoId: z.string().min(1),
      tipoLancamento: z.enum(["receita", "despesa"]),
      categoriaId: z.string().min(1, "Selecione a categoria."),
      contaId: opt(z.string()),
      parcelas: z.number().int().min(1).max(120),
      primeiroVencimento: z.string().min(1, "Informe o 1º vencimento."),
      valorTotal: z.number().positive("Informe o valor total."),
      descricao: opt(z.string()),
    }),
  },
  async (i, ctx) => {
    const doc = await prisma.documentoFinanceiro.findUnique({
      where: { id: i.documentoId },
      select: { id: true, tipo: true, numero: true },
    });
    if (!doc) throw new ActionError("Documento não encontrado.");
    const venc0 = dataOuNull(i.primeiroVencimento);
    if (!venc0) throw new ActionError("Vencimento inválido.");

    const rotulo = i.descricao?.trim() || `${TIPO_DOC_LABEL[doc.tipo]} ${doc.numero ?? ""}`.trim();
    const grupo = i.parcelas > 1 ? randomUUID() : null;
    const cents = Math.round(i.valorTotal * 100);
    const base = Math.floor(cents / i.parcelas);
    const resto = cents - base * i.parcelas;

    const registros = Array.from({ length: i.parcelas }, (_, n) => {
      const valorCent = base + (n === i.parcelas - 1 ? resto : 0);
      const venc = addMonths(venc0, n);
      return {
        tipo: i.tipoLancamento,
        descricao: i.parcelas > 1 ? `${rotulo} (${n + 1}/${i.parcelas})` : rotulo,
        valor: valorCent / 100,
        categoriaId: i.categoriaId,
        contaId: i.contaId || null,
        data: venc,
        vencimento: venc,
        status: "previsto" as const,
        recorrenciaGrupo: grupo,
        documentoFinanceiroId: doc.id,
        autorId: ctx.user.id,
      };
    });
    await prisma.lancamento.createMany({ data: registros });
    rev();
    return { criados: registros.length };
  },
);
