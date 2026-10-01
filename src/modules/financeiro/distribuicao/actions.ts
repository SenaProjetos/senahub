"use server";

import { revalidatePath } from "next/cache";
import { CHAVE_CONFIG_LIQUIDEZ } from "@/modules/financeiro/config/liquidez";
import { getConfigLiquidez } from "@/modules/financeiro/config/queries";
import { prisma } from "@/lib/prisma";
import { ActionError, defineAction } from "@/lib/with-action";
import { distribuirDesdeSchema, distribuirSchema, idRegraSchema, pularSchema, regraSchema } from "@/modules/financeiro/distribuicao/schemas";
import { distribuirRecebimento, gravarRegra, pularRecebimento, tornarPadrao } from "@/modules/financeiro/distribuicao/service";

/**
 * Regras de distribuição e "Recebimentos a distribuir" (F5). Ver é de quem vê o Financeiro; tudo o que
 * grava exige `financeiro:gerir`. Distribuir só RESERVA (alocação em caixinha): nenhum dinheiro muda de
 * banco, e nenhum lançamento é criado ou alterado.
 */
const base = { modulo: "financeiro", recurso: "financeiro", permissao: "gerir" } as const;

function rev() {
  revalidatePath("/financeiro/distribuicao");
  revalidatePath("/financeiro/caixinhas");
  revalidatePath("/financeiro/planejador");
  revalidatePath("/financeiro");
}

export const salvarRegra = defineAction(
  {
    ...base,
    acao: "salvar-regra-distribuicao",
    entidade: "RegraDistribuicao",
    schema: regraSchema,
    capturarAntes: async (i) =>
      i.id ? prisma.regraDistribuicao.findUnique({ where: { id: i.id }, include: { itens: { orderBy: { ordem: "asc" } } } }) : null,
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (i) => {
    const r = await gravarRegra({ id: i.id, nome: i.nome, categoriasIds: i.categoriasIds, itens: i.itens });
    rev();
    return r;
  },
);

export const duplicarRegra = defineAction(
  { ...base, acao: "duplicar-regra-distribuicao", entidade: "RegraDistribuicao", schema: idRegraSchema, entidadeId: (d) => (d as { id: string }).id },
  async (i) => {
    const r = await prisma.regraDistribuicao.findUnique({ where: { id: i.id }, include: { itens: { orderBy: { ordem: "asc" } } } });
    if (!r) throw new ActionError("Regra não encontrada.");
    let nome = `Cópia de ${r.nome}`.slice(0, 80);
    for (let n = 2; await prisma.regraDistribuicao.findFirst({ where: { nome: { equals: nome, mode: "insensitive" } }, select: { id: true } }); n++) {
      nome = `Cópia ${n} de ${r.nome}`.slice(0, 80);
    }
    const nova = await prisma.regraDistribuicao.create({
      data: {
        nome,
        categoriasIds: [],
        itens: { create: r.itens.map((x) => ({ caixinhaId: x.caixinhaId, bp: x.bp, ordem: x.ordem })) },
      },
      select: { id: true },
    });
    rev();
    return nova;
  },
);

export const alternarAtivaRegra = defineAction(
  { ...base, acao: "alternar-regra-distribuicao", entidade: "RegraDistribuicao", schema: idRegraSchema, entidadeId: (_d, i) => i.id },
  async (i) => {
    const r = await prisma.regraDistribuicao.findUnique({ where: { id: i.id }, select: { ativa: true, padrao: true } });
    if (!r) throw new ActionError("Regra não encontrada.");
    if (r.ativa && r.padrao) throw new ActionError("A regra padrão não pode ficar inativa: torne outra regra padrão antes.");
    await prisma.regraDistribuicao.update({ where: { id: i.id }, data: { ativa: !r.ativa } });
    rev();
    return { ativa: !r.ativa };
  },
);

export const tornarPadraoRegra = defineAction(
  { ...base, acao: "padrao-regra-distribuicao", entidade: "RegraDistribuicao", schema: idRegraSchema, entidadeId: (_d, i) => i.id },
  async (i) => {
    await tornarPadrao(i.id);
    rev();
    return { id: i.id };
  },
);

/** Só exclui regra nunca usada — a usada fica inativa, para o histórico das distribuições manter o nome. */
export const excluirRegra = defineAction(
  {
    ...base,
    acao: "excluir-regra-distribuicao",
    entidade: "RegraDistribuicao",
    schema: idRegraSchema,
    capturarAntes: (i) => prisma.regraDistribuicao.findUnique({ where: { id: i.id }, include: { itens: true } }),
    entidadeId: (_d, i) => i.id,
  },
  async (i) => {
    const r = await prisma.regraDistribuicao.findUnique({ where: { id: i.id }, select: { padrao: true, _count: { select: { distribuicoes: true } } } });
    if (!r) throw new ActionError("Regra não encontrada.");
    if (r._count.distribuicoes > 0) throw new ActionError("Já foi usada numa distribuição. Deixe inativa para manter o histórico.");
    if (r.padrao && (await prisma.regraDistribuicao.count()) > 1) throw new ActionError("Torne outra regra padrão antes de excluir esta.");
    await prisma.regraDistribuicao.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

export const distribuirRecebimentoAction = defineAction(
  { ...base, acao: "distribuir-recebimento", entidade: "Lancamento", schema: distribuirSchema, entidadeId: (_d, i) => i.lancamentoId },
  async (i, { user }) => {
    const r = await distribuirRecebimento({ lancamentoId: i.lancamentoId, regraId: i.regraId ?? null, itens: i.itens, usuarioId: user.id });
    rev();
    return r;
  },
);

export const pularRecebimentoAction = defineAction(
  { ...base, acao: "pular-recebimento", entidade: "Lancamento", schema: pularSchema, entidadeId: (_d, i) => i.lancamentoId },
  async (i, { user }) => {
    await pularRecebimento({ lancamentoId: i.lancamentoId, usuarioId: user.id });
    rev();
    return { ok: true };
  },
);

/** Muda só a data inicial da fila; o resto da configuração do planejador fica como está. */
export const definirDistribuirDesde = defineAction(
  {
    ...base,
    acao: "definir-distribuir-desde",
    entidade: "ConfigSistema",
    schema: distribuirDesdeSchema,
    capturarAntes: async () => (await prisma.configSistema.findUnique({ where: { chave: CHAVE_CONFIG_LIQUIDEZ } }))?.valor ?? null,
  },
  async (i) => {
    const atual = await getConfigLiquidez();
    const valor = { ...atual, distribuirDesde: i.data };
    await prisma.configSistema.upsert({ where: { chave: CHAVE_CONFIG_LIQUIDEZ }, create: { chave: CHAVE_CONFIG_LIQUIDEZ, valor }, update: { valor } });
    rev();
    return { ok: true };
  },
);
