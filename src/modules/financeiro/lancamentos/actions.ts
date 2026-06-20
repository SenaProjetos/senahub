"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { addMonths } from "date-fns";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import {
  criarLancamentoSchema,
  editarLancamentoSchema,
  confirmarLancamentoSchema,
  idLancamentoSchema,
} from "@/modules/financeiro/lancamentos/schemas";
import { z } from "zod";
import { removerArquivo } from "@/lib/storage";
import { notificarMuitos } from "@/lib/notificar";
import { getNiveisAprovacao, aprovadoresPorPapeis } from "@/modules/financeiro/aprovacao/queries";
import { precisaAprovacao, papeisAprovadores } from "@/modules/financeiro/aprovacao/niveis";
import { saldoRestante } from "@/modules/financeiro/lancamentos/parcial";
import { getConfigFinanceiro, getExclusaoCompleto } from "@/modules/financeiro/config/queries";
import { obrigatorioFaltando } from "@/modules/financeiro/config/validacao";
import { verificarSenha } from "@/modules/financeiro/config/senha";
import { brl } from "@/lib/utils";

const base = { modulo: "financeiro", recurso: "financeiro", permissao: "gerir" } as const;

function rev() {
  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/contas-a-pagar");
  revalidatePath("/financeiro/contas-a-receber");
  revalidatePath("/financeiro/relatorios");
}

function data(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

/** Snapshot JSON-safe do lançamento p/ auditoria valor-anterior × novo. */
async function snapshotLancamento(id: string) {
  const l = await prisma.lancamento.findUnique({
    where: { id },
    select: {
      valor: true, valorEfetivo: true, status: true, descricao: true, vencimento: true,
      categoriaId: true, centroId: true, projetoId: true, fornecedorId: true, clienteId: true, observacao: true,
    },
  });
  if (!l) return null;
  return {
    ...l,
    valor: Number(l.valor),
    valorEfetivo: l.valorEfetivo != null ? Number(l.valorEfetivo) : null,
    vencimento: l.vencimento ? l.vencimento.toISOString().slice(0, 10) : null,
  };
}

export const criarLancamento = defineAction(
  { ...base, acao: "criar-lancamento", entidade: "Lancamento", schema: criarLancamentoSchema },
  async (i, { user }) => {
    const dataBase = data(i.data);
    if (!dataBase) throw new ActionError("Data inválida.");
    const vencBase = data(i.vencimento || undefined);
    const compBase = data(i.dataCompetencia || undefined);

    // Campos obrigatórios configuráveis (Configurações do módulo financeiro).
    const cfg = await getConfigFinanceiro();
    const faltando = obrigatorioFaltando(cfg.obrigatorios, {
      tipo: i.tipo,
      centroId: i.centroId || undefined,
      formaId: i.formaId || undefined,
      projetoId: i.projetoId || undefined,
      fornecedorId: i.fornecedorId || undefined,
      clienteId: i.clienteId || undefined,
      observacao: i.observacao || undefined,
    });
    if (faltando) throw new ActionError(`Campo obrigatório: ${faltando}.`);

    // Alçada por faixa: despesa em faixa que exige aprovação trava em aguardando_aprovacao.
    const niveis = await getNiveisAprovacao();
    const precisaAprovar = precisaAprovacao(i.tipo, i.valor, niveis);
    const statusInicial = precisaAprovar
      ? ("aguardando_aprovacao" as const)
      : i.confirmado
        ? ("confirmado" as const)
        : ("previsto" as const);

    const grupo = i.ocorrencias > 1 ? randomUUID() : null;
    const comum = {
      tipo: i.tipo,
      descricao: i.descricao,
      valor: i.valor,
      categoriaId: i.categoriaId,
      centroId: i.centroId || null,
      contaId: i.contaId || null,
      formaId: i.formaId || null,
      projetoId: i.projetoId || null,
      fornecedorId: i.fornecedorId || null,
      clienteId: i.clienteId || null,
      observacao: i.observacao || null,
      recorrenciaGrupo: grupo,
      autorId: user.id,
      status: statusInicial,
    };

    const confirmaAgora = statusInicial === "confirmado";
    const registros = Array.from({ length: i.ocorrencias }, (_, n) => ({
      ...comum,
      data: addMonths(dataBase, n),
      vencimento: vencBase ? addMonths(vencBase, n) : null,
      dataConfirmacao: confirmaAgora ? addMonths(dataBase, n) : null,
      dataCompetencia: compBase ? addMonths(compBase, n) : null,
    }));

    await prisma.lancamento.createMany({ data: registros });
    if (precisaAprovar) {
      const ids = await aprovadoresPorPapeis(papeisAprovadores(i.valor, niveis));
      await notificarMuitos(ids.filter((id) => id !== user.id), {
        titulo: "Despesa aguardando aprovação",
        corpo: `${i.descricao} — ${brl(i.valor)}`,
        href: "/financeiro/aprovacoes",
      });
    }
    rev();
    return { ocorrencias: registros.length, aguardandoAprovacao: precisaAprovar };
  },
);

export const editarLancamento = defineAction(
  { ...base, acao: "editar-lancamento", entidade: "Lancamento", schema: editarLancamentoSchema, capturarAntes: (i) => snapshotLancamento(i.id) },
  async (i) => {
    await prisma.lancamento.update({
      where: { id: i.id },
      data: {
        descricao: i.descricao,
        valor: i.valor,
        data: data(i.data),
        vencimento: data(i.vencimento || undefined) ?? null,
        dataCompetencia: data(i.dataCompetencia || undefined) ?? null,
        categoriaId: i.categoriaId,
        centroId: i.centroId || null,
        projetoId: i.projetoId || null,
        fornecedorId: i.fornecedorId || null,
        clienteId: i.clienteId || null,
        observacao: i.observacao || null,
      },
    });
    rev();
    return { id: i.id };
  },
);

/** Confirma (realiza) um lançamento previsto → entra no caixa/DRE. */
export const confirmarLancamento = defineAction(
  { ...base, acao: "confirmar-lancamento", entidade: "Lancamento", schema: confirmarLancamentoSchema, capturarAntes: (i) => snapshotLancamento(i.id) },
  async (i, ctx) => {
    const lanc = await prisma.lancamento.findUnique({ where: { id: i.id } });
    if (!lanc) throw new ActionError("Lançamento não encontrado.");
    if (lanc.status === "confirmado") throw new ActionError("Já confirmado.");
    if (lanc.status === "aguardando_aprovacao") throw new ActionError("Despesa aguardando aprovação.");

    // Valor pago: usa o efetivo informado; se < total, o saldo vira um novo lançamento previsto.
    const restante = saldoRestante(Number(lanc.valor), i.valorEfetivo);
    const quando = data(i.dataConfirmacao || undefined) ?? new Date();

    const ops = [
      prisma.lancamento.update({
        where: { id: i.id },
        data: {
          status: "confirmado" as const,
          dataConfirmacao: quando,
          contaId: i.contaId || lanc.contaId,
          formaId: i.formaId || lanc.formaId,
          valorEfetivo: i.valorEfetivo ?? null,
          statusHistorico: { create: { de: lanc.status, para: "confirmado", autorId: ctx.user.id } },
        },
      }),
    ];

    if (restante != null) {
      ops.push(
        prisma.lancamento.create({
          data: {
            tipo: lanc.tipo,
            descricao: lanc.descricao,
            valor: restante,
            status: "previsto" as const,
            data: lanc.data,
            vencimento: lanc.vencimento,
            categoriaId: lanc.categoriaId,
            centroId: lanc.centroId,
            contaId: lanc.contaId,
            formaId: lanc.formaId,
            projetoId: lanc.projetoId,
            fornecedorId: lanc.fornecedorId,
            clienteId: lanc.clienteId,
            tags: lanc.tags,
            documentoFinanceiroId: lanc.documentoFinanceiroId,
            observacao: [lanc.observacao, "Saldo restante de pagamento parcial"].filter(Boolean).join(" · "),
            recorrenciaGrupo: lanc.recorrenciaGrupo ?? lanc.id,
            autorId: ctx.user.id,
          },
        }) as (typeof ops)[number],
      );
    }

    await prisma.$transaction(ops);
    rev();
    return { id: i.id, restante };
  },
);

/** Baixa (confirma) vários lançamentos de uma vez. Ignora os já confirmados/aguardando. */
export const baixarEmLote = defineAction(
  {
    ...base,
    acao: "baixar-lancamentos-lote",
    entidade: "Lancamento",
    schema: z.object({
      ids: z.array(z.string().min(1)).min(1).max(500),
      contaId: z.string().optional().or(z.literal("")),
      formaId: z.string().optional().or(z.literal("")),
      dataConfirmacao: z.string().optional().or(z.literal("")),
    }),
  },
  async (i, ctx) => {
    const quando = data(i.dataConfirmacao || undefined) ?? new Date();
    const alvos = await prisma.lancamento.findMany({
      where: { id: { in: i.ids }, status: "previsto" },
      select: { id: true, contaId: true, formaId: true },
    });
    if (alvos.length === 0) throw new ActionError("Nenhum lançamento elegível (previsto) selecionado.");

    await prisma.$transaction(
      alvos.map((l) =>
        prisma.lancamento.update({
          where: { id: l.id },
          data: {
            status: "confirmado",
            dataConfirmacao: quando,
            contaId: i.contaId || l.contaId,
            formaId: i.formaId || l.formaId,
            statusHistorico: { create: { de: "previsto", para: "confirmado", autorId: ctx.user.id } },
          },
        }),
      ),
    );
    rev();
    return { confirmados: alvos.length, ignorados: i.ids.length - alvos.length };
  },
);

// ── Tags e anexos do lançamento (A6) ──────────────────────────
export const salvarTagsLancamento = defineAction(
  { ...base, acao: "salvar-tags-lancamento", entidade: "Lancamento", schema: z.object({ id: z.string().min(1), tags: z.array(z.string().min(1)).max(20) }) },
  async (i) => {
    const tags = [...new Set(i.tags.map((t) => t.trim()).filter(Boolean))];
    await prisma.lancamento.update({ where: { id: i.id }, data: { tags } });
    rev();
    return { id: i.id };
  },
);

export const adicionarAnexoLancamento = defineAction(
  {
    ...base,
    acao: "add-anexo-lancamento",
    entidade: "LancamentoAnexo",
    schema: z.object({
      lancamentoId: z.string().min(1),
      meta: z.object({ caminho: z.string().min(1), nome: z.string().min(1), mime: z.string().min(1), tamanho: z.number().int().nonnegative() }),
    }),
  },
  async (i, ctx) => {
    const a = await prisma.lancamentoAnexo.create({
      data: { lancamentoId: i.lancamentoId, caminho: i.meta.caminho, nome: i.meta.nome, mime: i.meta.mime, tamanho: i.meta.tamanho, autorId: ctx.user.id },
    });
    rev();
    return { id: a.id };
  },
);

export const removerAnexoLancamento = defineAction(
  { ...base, acao: "rm-anexo-lancamento", entidade: "LancamentoAnexo", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    const a = await prisma.lancamentoAnexo.findUnique({ where: { id: i.id }, select: { caminho: true } });
    if (!a) throw new ActionError("Anexo não encontrado.");
    await prisma.lancamentoAnexo.delete({ where: { id: i.id } });
    await removerArquivo(a.caminho);
    rev();
    return { id: i.id };
  },
);

export const cancelarLancamento = defineAction(
  { ...base, acao: "cancelar-lancamento", entidade: "Lancamento", schema: idLancamentoSchema, capturarAntes: (i) => snapshotLancamento(i.id) },
  async (i, ctx) => {
    const atual = await prisma.lancamento.findUnique({ where: { id: i.id }, select: { status: true } });
    await prisma.lancamento.update({
      where: { id: i.id },
      data: {
        status: "cancelado",
        statusHistorico: { create: { de: atual?.status ?? null, para: "cancelado", autorId: ctx.user.id } },
      },
    });
    rev();
    return { id: i.id };
  },
);

export const excluirLancamento = defineAction(
  {
    ...base,
    acao: "excluir-lancamento",
    entidade: "Lancamento",
    schema: z.object({ id: z.string().min(1), senha: z.string().optional() }),
    capturarAntes: (i) => snapshotLancamento(i.id),
    redact: ["senha"],
  },
  async (i) => {
    const exclusao = await getExclusaoCompleto();
    if (exclusao.exigir && !verificarSenha(i.senha ?? "", exclusao.hash)) {
      throw new ActionError("Senha de exclusão incorreta.");
    }
    const lanc = await prisma.lancamento.findUnique({ where: { id: i.id } });
    if (!lanc) throw new ActionError("Lançamento não encontrado.");
    if (lanc.pagamentoProjetistaId) {
      throw new ActionError("Lançamento de folha não pode ser excluído aqui.");
    }
    // Soft delete: marca excluidoEm; some das listagens/relatórios (filtro global no prisma).
    await prisma.lancamento.update({ where: { id: i.id }, data: { excluidoEm: new Date() } });
    rev();
    return { id: i.id };
  },
);
