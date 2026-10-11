import "server-only";
import { prisma } from "@/lib/prisma";
import { whereAudiencia } from "@/lib/audiencias";
import { diaDeSaoPaulo } from "@/lib/data";
import { montarRevisao } from "@/modules/rh/folha/revisao";
import { assinaturaJaDevida } from "@/modules/rh/folha/assinatura-prazo";

export async function listarFolhas() {
  const folhas = await prisma.folhaPagamento.findMany({
    orderBy: [{ ano: "desc" }, { mes: "desc" }, { tipo: "asc" }],
    include: { holerites: { include: { itens: true } } },
  });
  return folhas.map((f) => {
    let proventos = 0;
    let descontos = 0;
    for (const h of f.holerites) {
      for (const it of h.itens) {
        if (it.tipo === "provento") proventos += Number(it.valor);
        else descontos += Number(it.valor);
      }
    }
    return {
      id: f.id,
      ano: f.ano,
      mes: f.mes,
      tipo: f.tipo,
      status: f.status,
      fechadaEm: f.fechadaEm,
      holerites: f.holerites.length,
      proventos,
      descontos,
      liquido: proventos - descontos,
    };
  });
}

export async function obterFolha(id: string) {
  const folha = await prisma.folhaPagamento.findUnique({
    where: { id },
    include: {
      holerites: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          itens: { orderBy: { descricao: "asc" } },
          assinante: { select: { name: true } },
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!folha) return null;

  const [rubricas, elegiveis] = await Promise.all([
    prisma.rubricaFolha.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" } }),
    prisma.user.findMany({
      where: whereAudiencia("clt"),
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { folha, rubricas, elegiveis };
}

export type FolhaResumo = Awaited<ReturnType<typeof listarFolhas>>[number];
export type FolhaDetalhe = NonNullable<Awaited<ReturnType<typeof obterFolha>>>;

/**
 * A partir de quando a assinatura do holerite passa a ser COBRADA (tarja na barra superior).
 *
 * É a data em que a migration `20260913150000_folha_clt_import_assinatura` criou a coluna
 * `assinadoEm`: antes disso assinar era impossível, então exigir assinatura de folha fechada
 * lá atrás seria cobrar algo que o sistema nunca ofereceu — e jogaria todo o histórico na fila
 * do funcionário no primeiro login depois do deploy.
 *
 * Não impede ninguém de assinar holerite antigo por vontade própria: `assinarHolerite` não
 * filtra por data e a ficha (`minha-ficha`) continua oferecendo o botão. Esta constante governa
 * só o que a tarja COBRA. Mover a data para trás passa a cobrar folhas mais antigas; mover
 * para frente afrouxa — é o único ponto a mexer.
 */
export const ASSINATURA_HOLERITE_OBRIGATORIA_DESDE = new Date("2026-09-13T15:00:00.000Z");

/**
 * Pendência de assinatura para a TARJA da barra superior: roda no `(dashboard)/layout.tsx` a CADA
 * navegação, de TODO usuário — inclusive a maioria que não tem holerite nenhum. Por isso só lê
 * colunas: o índice `[userId, assinadoEm]` resolve a parte cara e nenhum item é carregado aqui. A
 * lista com valores é outra função (`holeritesPendentesDeAssinatura`), usada só pela tela.
 * Só cobra a partir do dia do pagamento da folha (`assinaturaJaDevida`), não ao fechar.
 * Não trava nada: quem quiser assina pela tarja, quem não quiser segue trabalhando.
 *
 * `revisados` = quantos desses holerites já tinham sido assinados e foram corrigidos pelo RH
 * (reabrir e fechar de novo) — a tarja avisa que é uma reassinatura.
 *
 * Folha reaberta volta a `status: "aberta"` e some da conta — quem teve a assinatura revogada
 * por `reabrirFolha` só é cobrado de novo quando o RH fechar a folha outra vez.
 */
export async function pendenciaDeAssinaturaHolerite(user: { id: string }): Promise<{ total: number; revisados: number }> {
  const rows = await prisma.holerite.findMany({
    where: whereHoleritePendente(user.id),
    select: { assinaturaAnteriorEm: true, folha: { select: { lancamentoId: true } } },
  });
  const devidos = await soDevidos(rows);
  return { total: devidos.length, revisados: devidos.filter((r) => r.assinaturaAnteriorEm !== null).length };
}

/** Folha fechada (a partir do corte) e holerite ainda não assinado — antes do filtro do dia do pagamento. */
function whereHoleritePendente(userId: string) {
  return {
    userId,
    assinadoEm: null,
    folha: { status: "fechada" as const, fechadaEm: { gte: ASSINATURA_HOLERITE_OBRIGATORIA_DESDE } },
  };
}

/**
 * A cobrança só começa no dia do pagamento da folha (`assinaturaJaDevida`). `FolhaPagamento.lancamentoId`
 * não tem relação no schema, então a conta é lida à parte — e só quando existe pendência, pra não
 * pesar a navegação de quem não tem.
 */
async function soDevidos<T extends { folha: { lancamentoId: string | null } }>(rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows;
  const ids = [...new Set(rows.map((r) => r.folha.lancamentoId).filter((x): x is string => !!x))];
  const contas = ids.length
    ? await prisma.lancamento.findMany({
        where: { id: { in: ids }, excluidoEm: null },
        select: { id: true, status: true, vencimento: true },
      })
    : [];
  const porId = new Map(contas.map((c) => [c.id, c]));
  const hoje = diaDeSaoPaulo();
  return rows.filter((r) => {
    const c = r.folha.lancamentoId ? porId.get(r.folha.lancamentoId) : undefined;
    return assinaturaJaDevida(
      !!r.folha.lancamentoId,
      c ? { status: c.status, vencimento: c.vencimento ? c.vencimento.toISOString().slice(0, 10) : null } : null,
      hoje,
    );
  });
}

/**
 * Fila da tela `/assinar-holerite`: TODOS os holerites de folha fechada ainda sem assinatura, com os
 * valores. Sem o filtro do dia do pagamento — esse vale só para a tarja COBRAR; quem chega aqui por
 * vontade própria (a ficha manda um holerite corrigido para cá) assina o que já está fechado.
 */
export async function holeritesPendentesDeAssinatura(user: { id: string }) {
  const rows = await prisma.holerite.findMany({
    where: whereHoleritePendente(user.id),
    orderBy: [{ folha: { ano: "asc" } }, { folha: { mes: "asc" } }],
    select: {
      id: true,
      assinaturaAnteriorEm: true,
      itensAssinadosAntes: true,
      folha: { select: { ano: true, mes: true, tipo: true, fechadaEm: true } },
      itens: { select: { descricao: true, tipo: true, valor: true }, orderBy: { descricao: "asc" } },
    },
  });
  return rows.map((h) => {
    const itens = h.itens.map((it) => ({
      descricao: it.descricao,
      tipo: it.tipo,
      valor: Number(it.valor),
    }));
    const proventos = itens.reduce((s, it) => s + (it.tipo === "provento" ? it.valor : 0), 0);
    const descontos = itens.reduce((s, it) => s + (it.tipo === "desconto" ? it.valor : 0), 0);
    return {
      id: h.id,
      ano: h.folha.ano,
      mes: h.folha.mes,
      tipo: h.folha.tipo,
      fechadaEm: h.folha.fechadaEm?.toISOString() ?? null,
      itens,
      proventos,
      descontos,
      liquido: proventos - descontos,
      revisao: montarRevisao(h.assinaturaAnteriorEm, h.itensAssinadosAntes, itens),
    };
  });
}
export type HoleritePendente = Awaited<ReturnType<typeof holeritesPendentesDeAssinatura>>[number];
