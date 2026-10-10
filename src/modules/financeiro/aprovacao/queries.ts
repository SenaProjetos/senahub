import "server-only";
import { prisma } from "@/lib/prisma";
import { motivoParaNaoAprovar } from "@/modules/financeiro/aprovacao/niveis";
import type { Prisma } from "@/generated/prisma/client";
import { wherePermissao } from "@/lib/audiencias";
import type { Role } from "@/lib/roles";
import type { FaixaAlcada } from "@/modules/financeiro/aprovacao/niveis";

export const CHAVE_NIVEIS_APROVACAO = "financeiro.niveisAprovacao";

/**
 * Níveis de alçada (faixas de valor → papéis aprovadores). Sem configuração, nada exige aprovação.
 * O "limite único" antigo (≥ limite exige) saiu no N3: a migração `20261002160000_alcada_unica`
 * transformou o limite salvo em faixas.
 *
 * O default deixou de incluir `supervisor` em 2026-09-02 (decisão do dono). Ele nomeava
 * admin+supervisor como aprovadores, mas o coordenador nunca conseguiu aprovar: o gate de
 * entrada `financeiro:aprovar` não existia no catálogo, então só `superUsuario` passava. O
 * resultado era o pior dos dois mundos — o coordenador **recebia** a notificação "aprove este
 * lançamento" e levava 403 no clique. Some-se a isso o recorte do Coordenador (dono,
 * 2026-07-27), que tirou financeiro daquele perfil de propósito.
 *
 * ⚠️ Isto é só o DEFAULT — vale quando `ConfigSistema` não tem linha de níveis. Onde a alçada
 * já foi configurada pela tela (Financeiro → Configurações), a linha salva continua mandando e
 * esta mudança não tem efeito: lá, tirar o coordenador é edição na tela, não deploy.
 */
export async function getNiveisAprovacao(): Promise<FaixaAlcada[]> {
  const c = await prisma.configSistema.findUnique({ where: { chave: CHAVE_NIVEIS_APROVACAO } });
  if (c && Array.isArray(c.valor)) {
    return (c.valor as unknown[]).map((f) => {
      const o = (f ?? {}) as Record<string, unknown>;
      return {
        ate: typeof o.ate === "number" ? o.ate : null,
        papeis: Array.isArray(o.papeis) ? (o.papeis as unknown[]).filter((p): p is string => typeof p === "string") : [],
      };
    });
  }
  return [{ ate: null, papeis: [] }];
}

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Valor que a alçada avalia para um lançamento (N3): o TOTAL das ocorrências do mesmo parcelamento
 * (`recorrenciaGrupo`), não a parcela. `valorNovo` substitui o desta linha (edição em andamento).
 */
export async function valorParaAlcada(
  db: Db,
  l: { id: string; valor: Prisma.Decimal | number; recorrenciaGrupo: string | null },
  valorNovo?: number,
): Promise<number> {
  const desta = Math.round((valorNovo ?? Number(l.valor)) * 100);
  if (!l.recorrenciaGrupo) return desta / 100;
  const outras = await db.lancamento.findMany({
    where: { recorrenciaGrupo: l.recorrenciaGrupo, id: { not: l.id }, tipo: "despesa", status: { not: "cancelado" } },
    select: { valor: true },
  });
  return (desta + outras.reduce((s, o) => s + Math.round(Number(o.valor) * 100), 0)) / 100;
}

/**
 * Ids de usuários ativos cujos papéis estão na lista (destinatários da aprovação), recortados
 * por quem tem `financeiro:aprovar` — o gate de `/financeiro/aprovacoes`. Sem o recorte, uma
 * alçada salva pela tela com `supervisor` mandava "despesa — R$" ao Coordenador, que não tem
 * financeiro e leva 403 no clique (ver `getNiveisAprovacao`).
 */
export async function aprovadoresPorPapeis(papeis: string[]): Promise<string[]> {
  if (papeis.length === 0) return [];
  const us = await prisma.user.findMany({
    where: { ...wherePermissao("financeiro", "aprovar"), role: { in: papeis as Role[] } },
    select: { id: true },
  });
  return us.map((u) => u.id);
}

/**
 * Despesas aguardando aprovação, com nomes resolvidos. `bloqueio` é a MESMA regra que
 * `aprovarLancamento` aplica (`motivoParaNaoAprovar`: autoaprovação, faixa pelo total do
 * parcelamento × papel, admin decide tudo): a tela desabilita o item com o motivo.
 */
export async function lancamentosAguardando(quem?: { id: string; role: string; superUsuario: boolean }) {
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
  // Alçada pelo total do parcelamento (N3): soma dos grupos de uma vez.
  const grupos = [...new Set(ls.map((l) => l.recorrenciaGrupo).filter((g): g is string => g != null))];
  const somas = grupos.length
    ? await prisma.lancamento.groupBy({
        by: ["recorrenciaGrupo"],
        where: { recorrenciaGrupo: { in: grupos }, tipo: "despesa", status: { not: "cancelado" } },
        _sum: { valor: true },
      })
    : [];
  const totalDoGrupo = new Map(somas.map((g) => [g.recorrenciaGrupo, Number(g._sum.valor ?? 0)]));
  const faixas = quem ? await getNiveisAprovacao() : null;
  const bloqueio = (l: (typeof ls)[number]) =>
    quem && faixas
      ? motivoParaNaoAprovar({
          valorAlcada: l.recorrenciaGrupo ? (totalDoGrupo.get(l.recorrenciaGrupo) ?? Number(l.valor)) : Number(l.valor),
          faixas,
          aprovador: quem,
          autorId: l.autorId,
        })
      : null;
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
    /** A frase com que `aprovarLancamento` recusaria ESTE usuário (`null` = pode decidir). */
    bloqueio: bloqueio(l),
  }));
}

export async function totalAguardando(): Promise<number> {
  return prisma.lancamento.count({ where: { status: "aguardando_aprovacao" } });
}
