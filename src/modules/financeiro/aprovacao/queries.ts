import "server-only";
import { prisma } from "@/lib/prisma";

export const CHAVE_LIMITE_APROVACAO = "financeiro.limiteAprovacao";

/** Limite de alçada (R$) acima do qual despesas exigem aprovação. 0 = desligado. */
export async function limiteAprovacao(): Promise<number> {
  const c = await prisma.configSistema.findUnique({ where: { chave: CHAVE_LIMITE_APROVACAO } });
  return typeof c?.valor === "number" ? c.valor : Number(c?.valor ?? 0);
}

/** Usuários que podem aprovar (admin/supervisor) — destinatários das notificações. */
export async function aprovadores(): Promise<string[]> {
  const us = await prisma.user.findMany({
    where: { ativo: true, role: { in: ["admin", "supervisor"] } },
    select: { id: true },
  });
  return us.map((u) => u.id);
}

/** Despesas aguardando aprovação, com nomes resolvidos. */
export async function lancamentosAguardando() {
  const ls = await prisma.lancamento.findMany({
    where: { status: "aguardando_aprovacao" },
    orderBy: { createdAt: "desc" },
    include: {
      categoria: { select: { codigo: true, nome: true } },
      fornecedor: { select: { nome: true } },
      projeto: { select: { codigo: true } },
      autor: { select: { name: true } },
    },
  });
  return ls.map((l) => ({
    id: l.id,
    descricao: l.descricao,
    valor: Number(l.valor),
    categoria: `${l.categoria.codigo} ${l.categoria.nome}`,
    fornecedor: l.fornecedor?.nome ?? null,
    projeto: l.projeto?.codigo ?? null,
    autor: l.autor.name,
    vencimento: l.vencimento ? l.vencimento.toISOString().slice(0, 10) : null,
    criadoEm: l.createdAt.toISOString(),
  }));
}

export async function totalAguardando(): Promise<number> {
  return prisma.lancamento.count({ where: { status: "aguardando_aprovacao" } });
}
