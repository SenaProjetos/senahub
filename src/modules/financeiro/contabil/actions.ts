"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { utcFimDoDia, utcInicioDoDia } from "@/lib/data";
import { paraCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import { isoDeDataDoBanco } from "@/modules/financeiro/liquidez/datas";
import {
  copiarContaSchema,
  definirContaSchema,
  exportarMesSchema,
  lancamentosDaCategoriaSchema,
  limparContaSchema,
} from "@/modules/financeiro/contabil/schemas";
import { definirContaNoBanco, limparContaNoBanco, registrarExportacaoNoBanco, type AlvoEditavel } from "@/modules/financeiro/contabil/service";

/** Integração contábil: mesmo gate do fechamento — quem fecha o mês é quem o entrega ao contador. */
const base = { modulo: "financeiro", recurso: "financeiro", permissao: "fechar", entidade: "DeParaContabil" } as const;
const rev = () => revalidatePath("/financeiro/contabil");

const antesDoDePara = (i: { alvo: AlvoEditavel; alvoId: string }) =>
  prisma.deParaContabil.findUnique({ where: { alvo_alvoId: { alvo: i.alvo, alvoId: i.alvoId } } });

export const definirContaContabil = defineAction(
  { ...base, acao: "definir-conta-contabil", schema: definirContaSchema, entidadeId: (_d, i) => (i as { alvoId: string }).alvoId, capturarAntes: antesDoDePara },
  async (i) => {
    await definirContaNoBanco(i.alvo, i.alvoId, i.reduzido);
    rev();
    return { alvoId: i.alvoId };
  },
);

export const limparContaContabil = defineAction(
  { ...base, acao: "limpar-conta-contabil", schema: limparContaSchema, entidadeId: (_d, i) => (i as { alvoId: string }).alvoId, capturarAntes: antesDoDePara },
  async (i) => {
    await limparContaNoBanco(i.alvo, i.alvoId);
    rev();
    return { alvoId: i.alvoId };
  },
);

/** "Copiar de outra categoria": a conta da origem (própria ou herdada não — só a própria) vai para o destino. */
export const copiarContaContabil = defineAction(
  {
    ...base,
    acao: "copiar-conta-contabil",
    schema: copiarContaSchema,
    entidadeId: (_d, i) => (i as { paraCategoriaId: string }).paraCategoriaId,
    capturarAntes: (i) => antesDoDePara({ alvo: "categoria", alvoId: i.paraCategoriaId }),
  },
  async (i) => {
    const origem = await prisma.deParaContabil.findUnique({ where: { alvo_alvoId: { alvo: "categoria", alvoId: i.deCategoriaId } } });
    if (!origem?.contaReduzido) throw new ActionError("A categoria de origem não tem conta contábil.");
    const [de, para] = await prisma.$transaction([
      prisma.categoriaFinanceira.findUnique({ where: { id: i.deCategoriaId }, select: { tipo: true } }),
      prisma.categoriaFinanceira.findUnique({ where: { id: i.paraCategoriaId }, select: { tipo: true } }),
    ]);
    if (!de || !para) throw new ActionError("Categoria não encontrada.");
    if (de.tipo !== para.tipo) throw new ActionError("Copie de uma categoria do mesmo tipo (receita com receita, despesa com despesa).");
    await definirContaNoBanco("categoria", i.paraCategoriaId, origem.contaReduzido);
    rev();
    return { alvoId: i.paraCategoriaId };
  },
);

/** "Ver lançamentos de <mês>": os da categoria (e filhas) com competência ou pagamento no mês. Só lê. */
export const lancamentosDaCategoriaNoMes = defineAction(
  { ...base, acao: "ver-lancamentos-conta-contabil", schema: lancamentosDaCategoriaSchema, audit: false },
  async (i) => {
    const todas = await prisma.categoriaFinanceira.findMany({ select: { id: true, paiId: true } });
    const ids = new Set([i.categoriaId]);
    for (let mudou = true; mudou; ) {
      mudou = false;
      for (const c of todas) if (c.paiId && ids.has(c.paiId) && !ids.has(c.id)) {
        ids.add(c.id);
        mudou = true;
      }
    }
    const [ano, m] = i.mes.split("-").map(Number);
    const de = utcInicioDoDia(ano, m - 1);
    const ate = utcFimDoDia(ano, m, 0);
    const ls = await prisma.lancamento.findMany({
      where: {
        categoriaId: { in: [...ids] },
        status: { in: ["previsto", "aguardando_aprovacao", "confirmado"] },
        OR: [{ dataCompetencia: { gte: de, lte: ate } }, { dataCompetencia: null, data: { gte: de, lte: ate } }, { dataConfirmacao: { gte: de, lte: ate } }],
      },
      // natureza-ok: lista de conferência do de-para, por categoria — a natureza não filtra nada aqui.
      select: { id: true, descricao: true, tipo: true, valor: true, data: true, dataCompetencia: true },
      orderBy: [{ data: "asc" }, { id: "asc" }],
      take: 200,
    });
    return ls.map((l) => ({ id: l.id, descricao: l.descricao, tipo: l.tipo, valor: paraCentavos(l.valor) / 100, data: isoDeDataDoBanco(l.dataCompetencia ?? l.data) }));
  },
);

/** Gera e registra a exportação de um mês fechado. O arquivo sai pela rota de download, a partir do registro. */
export const exportarMesContabil = defineAction(
  { ...base, acao: "exportar-mes-contabil", entidade: "ExportacaoContabil", schema: exportarMesSchema, entidadeId: (d) => (d as { id?: string } | undefined)?.id ?? "nova" },
  async (i, ctx) => {
    const r = await registrarExportacaoNoBanco(i.mes, i.formato, ctx.user.id);
    rev();
    return r;
  },
);
