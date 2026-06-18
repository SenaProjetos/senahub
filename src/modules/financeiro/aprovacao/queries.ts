import "server-only";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/roles";
import type { FaixaAlcada } from "@/modules/financeiro/aprovacao/niveis";

export const CHAVE_LIMITE_APROVACAO = "financeiro.limiteAprovacao";
export const CHAVE_NIVEIS_APROVACAO = "financeiro.niveisAprovacao";

/**
 * Níveis de alçada (faixas de valor → papéis aprovadores). Se não configurado,
 * deriva do limite único legado (até o limite = automático; acima = admin/supervisor).
 */
export async function getNiveisAprovacao(): Promise<FaixaAlcada[]> {
  const [c, limite] = await Promise.all([
    prisma.configSistema.findUnique({ where: { chave: CHAVE_NIVEIS_APROVACAO } }),
    limiteAprovacao(),
  ]);
  if (c && Array.isArray(c.valor)) {
    return (c.valor as unknown[]).map((f) => {
      const o = (f ?? {}) as Record<string, unknown>;
      return {
        ate: typeof o.ate === "number" ? o.ate : null,
        papeis: Array.isArray(o.papeis) ? (o.papeis as unknown[]).filter((p): p is string => typeof p === "string") : [],
      };
    });
  }
  if (limite > 0) return [{ ate: limite, papeis: [] }, { ate: null, papeis: ["admin", "supervisor"] }];
  return [{ ate: null, papeis: [] }];
}

/** Ids de usuários ativos cujos papéis estão na lista (destinatários da aprovação). */
export async function aprovadoresPorPapeis(papeis: string[]): Promise<string[]> {
  if (papeis.length === 0) return [];
  const us = await prisma.user.findMany({ where: { ativo: true, role: { in: papeis as Role[] } }, select: { id: true } });
  return us.map((u) => u.id);
}

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
