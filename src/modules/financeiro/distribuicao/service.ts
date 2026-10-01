import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { ActionError } from "@/lib/action-error";
import { prisma } from "@/lib/prisma";
import { inicioDoDiaUtc } from "@/lib/data";
import { getConfigLiquidez } from "@/modules/financeiro/config/queries";
import { elegivelParaDistribuir, motivoDaDivisao, partesDeCaixinha, ratear, type ItemDeRegra } from "@/modules/financeiro/distribuicao/calculo";
import { isoDeDataDoBanco } from "@/modules/financeiro/liquidez/datas";
import { paraCentavos } from "@/modules/financeiro/liquidez/dinheiro";

/**
 * Gravação das regras e das distribuições (F5). Regra de negócio fica em `calculo.ts` (pura); aqui só
 * se liga ao banco. Tudo o que grava mais de uma linha vai numa transação, com `await` em sequência.
 */

type Db = Prisma.TransactionClient | typeof prisma;

/** Confere que cada caixinha da divisão existe e está ativa. */
export async function conferirCaixinhasDosItens(db: Db, itens: readonly ItemDeRegra[]): Promise<void> {
  const ids = itens.flatMap((i) => (i.caixinhaId ? [i.caixinhaId] : []));
  if (ids.length === 0) return;
  const cxs = await db.caixinha.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, ativo: true } });
  const ativas = new Set(cxs.filter((c) => c.ativo).map((c) => c.id));
  const faltando = ids.find((id) => !ativas.has(id));
  if (faltando) {
    const nome = cxs.find((c) => c.id === faltando)?.nome;
    throw new ActionError(nome ? `A caixinha ${nome} está arquivada: tire-a da divisão.` : "Uma das caixinhas da divisão não existe mais.");
  }
}

export async function gravarRegra(p: {
  id?: string;
  nome: string;
  categoriasIds: string[];
  itens: ItemDeRegra[];
}): Promise<{ id: string }> {
  const motivo = motivoDaDivisao(p.itens);
  if (motivo) throw new ActionError(motivo);
  await conferirCaixinhasDosItens(prisma, p.itens);

  const repetida = await prisma.regraDistribuicao.findFirst({
    where: { nome: { equals: p.nome, mode: "insensitive" }, ...(p.id ? { id: { not: p.id } } : {}) },
    select: { id: true },
  });
  if (repetida) throw new ActionError("Já existe uma regra com esse nome.");

  if (p.categoriasIds.length) {
    const cats = await prisma.categoriaFinanceira.findMany({ where: { id: { in: p.categoriasIds }, tipo: "receita", ativo: true }, select: { id: true } });
    if (cats.length !== new Set(p.categoriasIds).size) throw new ActionError("Uma das categorias escolhidas não é uma receita ativa.");
  }

  return prisma.$transaction(async (tx) => {
    const itens = p.itens.map((i, ordem) => ({ caixinhaId: i.caixinhaId, bp: i.bp, ordem }));
    if (p.id) {
      const atual = await tx.regraDistribuicao.findUnique({ where: { id: p.id }, select: { id: true } });
      if (!atual) throw new ActionError("Regra não encontrada.");
      await tx.regraDistribuicaoItem.deleteMany({ where: { regraId: p.id } });
      await tx.regraDistribuicao.update({
        where: { id: p.id },
        data: { nome: p.nome, categoriasIds: [...new Set(p.categoriasIds)], itens: { create: itens } },
      });
      return { id: p.id };
    }
    // A primeira regra criada já nasce padrão: sem padrão, recebimento sem categoria citada ficaria sem sugestão.
    const jaTem = await tx.regraDistribuicao.count();
    const nova = await tx.regraDistribuicao.create({
      data: { nome: p.nome, categoriasIds: [...new Set(p.categoriasIds)], padrao: jaTem === 0, itens: { create: itens } },
      select: { id: true },
    });
    return nova;
  });
}

export async function tornarPadrao(id: string): Promise<void> {
  const r = await prisma.regraDistribuicao.findUnique({ where: { id }, select: { ativa: true } });
  if (!r) throw new ActionError("Regra não encontrada.");
  if (!r.ativa) throw new ActionError("Ative a regra antes de torná-la padrão.");
  await prisma.$transaction(async (tx) => {
    await tx.regraDistribuicao.updateMany({ where: { padrao: true, id: { not: id } }, data: { padrao: false } });
    await tx.regraDistribuicao.update({ where: { id }, data: { padrao: true } });
  });
}

export type ResultadoDistribuicao = { movimentos: number; reservado: number };

/**
 * Distribui um recebimento: confere de novo que ele ainda é elegível (outra aba pode ter tratado), rateia
 * pelo valor EFETIVAMENTE recebido e grava, numa transação só, a linha de controle e uma alocação por
 * caixinha. A parte "Operacional (livre)" não move nada. A linha de controle é única por lançamento:
 * duas confirmações simultâneas não duplicam o reservado.
 */
export async function distribuirRecebimento(p: {
  lancamentoId: string;
  regraId: string | null;
  itens: ItemDeRegra[];
  usuarioId: string;
}): Promise<ResultadoDistribuicao> {
  const motivo = motivoDaDivisao(p.itens);
  if (motivo) throw new ActionError(motivo);
  await conferirCaixinhasDosItens(prisma, p.itens);
  const l = await lerElegivel(prisma, p.lancamentoId);
  const partes = ratear(l.valor, p.itens);
  const reservar = partesDeCaixinha(partes);
  const hoje = new Date(`${isoDeDataDoBanco(inicioDoDiaUtc())}T00:00:00.000Z`);

  try {
    return await prisma.$transaction(async (tx) => {
      const d = await tx.distribuicaoRecebimento.create({
        data: { lancamentoId: p.lancamentoId, regraId: p.regraId, situacao: "distribuida", data: hoje, autorId: p.usuarioId },
        select: { id: true },
      });
      for (const r of reservar) {
        await tx.movimentoCaixinha.create({
          data: {
            caixinhaId: r.caixinhaId,
            tipo: "alocacao",
            valor: r.valor / 100,
            data: hoje,
            descricao: `Distribuição de “${l.descricao}”`.slice(0, 200),
            distribuicaoId: d.id,
            autorId: p.usuarioId,
          },
        });
      }
      return { movimentos: reservar.length, reservado: reservar.reduce((s, r) => s + r.valor, 0) };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ActionError("Este recebimento já foi distribuído ou pulado por outra pessoa.");
    }
    throw e;
  }
}

export async function pularRecebimento(p: { lancamentoId: string; usuarioId: string }): Promise<void> {
  await lerElegivel(prisma, p.lancamentoId);
  try {
    await prisma.distribuicaoRecebimento.create({
      data: { lancamentoId: p.lancamentoId, situacao: "pulada", data: new Date(`${isoDeDataDoBanco(inicioDoDiaUtc())}T00:00:00.000Z`), autorId: p.usuarioId },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ActionError("Este recebimento já foi distribuído ou pulado por outra pessoa.");
    }
    throw e;
  }
}

/** Lê o recebimento (busca por id escreve `excluidoEm` à mão) e só devolve se ainda for elegível. */
async function lerElegivel(db: Db, id: string): Promise<{ valor: number; descricao: string }> {
  const l = await db.lancamento.findUnique({
    where: { id },
    select: {
      tipo: true,
      status: true,
      excluidoEm: true,
      descricao: true,
      valor: true,
      valorEfetivo: true,
      tags: true,
      dataConfirmacao: true,
      categoria: { select: { natureza: true } },
      distribuicao: { select: { id: true } },
    },
  });
  if (!l || l.excluidoEm) throw new ActionError("Recebimento não encontrado.");
  const { distribuirDesde } = await getConfigLiquidez();
  const ok = elegivelParaDistribuir(
    {
      tipo: l.tipo,
      status: l.status,
      natureza: l.categoria.natureza,
      dataConfirmacao: l.dataConfirmacao ? isoDeDataDoBanco(l.dataConfirmacao) : null,
      tags: l.tags,
      tratado: l.distribuicao != null,
    },
    distribuirDesde,
  );
  if (!ok) {
    throw new ActionError(l.distribuicao ? "Este recebimento já foi distribuído ou pulado." : "Este recebimento não está na lista de recebimentos a distribuir.");
  }
  return { valor: paraCentavos(l.valorEfetivo ?? l.valor), descricao: l.descricao };
}
