import "server-only";
import { prisma } from "@/lib/prisma";
import { whereAudiencia } from "@/lib/audiencias";

export async function listarFolhas() {
  const folhas = await prisma.folhaPagamento.findMany({
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
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
          user: { select: { id: true, name: true, email: true, role: true } },
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
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { folha, rubricas, elegiveis };
}

export type FolhaResumo = Awaited<ReturnType<typeof listarFolhas>>[number];
export type FolhaDetalhe = NonNullable<Awaited<ReturnType<typeof obterFolha>>>;

/**
 * A partir de quando a assinatura do holerite passa a BLOQUEAR o acesso ao sistema.
 *
 * É a data em que a migration `20260913150000_folha_clt_import_assinatura` criou a coluna
 * `assinadoEm`: antes disso assinar era impossível, então exigir assinatura de folha fechada
 * lá atrás seria cobrar algo que o sistema nunca ofereceu — e jogaria todo o histórico na fila
 * do funcionário no primeiro login depois do deploy.
 *
 * Não impede ninguém de assinar holerite antigo por vontade própria: `assinarHolerite` não
 * filtra por data e a ficha (`minha-ficha`) continua oferecendo o botão. Esta constante governa
 * só o que TRANCA o acesso. Mover a data para trás passa a exigir folhas mais antigas; mover
 * para frente afrouxa — é o único ponto a mexer.
 */
export const ASSINATURA_HOLERITE_OBRIGATORIA_DESDE = new Date("2026-09-13T15:00:00.000Z");

/**
 * Gate de acesso: roda no `(dashboard)/layout.tsx` a CADA navegação, de TODO usuário — inclusive
 * a maioria que não tem holerite nenhum. Por isso é `findFirst` + `select: { id: true }`: o
 * índice `[userId, assinadoEm]` resolve a parte cara e nada de item é carregado aqui.
 * A lista com valores é outra função (`holeritesPendentesDeAssinatura`), usada só pela tela.
 *
 * Folha reaberta volta a `status: "aberta"` e some da fila — quem teve a assinatura revogada
 * por `reabrirFolha` só é cobrado de novo quando o RH fechar a folha outra vez.
 */
export async function precisaAssinarHolerite(user: { id: string }): Promise<boolean> {
  const pendente = await prisma.holerite.findFirst({
    where: {
      userId: user.id,
      assinadoEm: null,
      folha: { status: "fechada", fechadaEm: { gte: ASSINATURA_HOLERITE_OBRIGATORIA_DESDE } },
    },
    select: { id: true },
  });
  return pendente !== null;
}

/** Fila da tela `/assinar-holerite` — mesma regra do gate, agora com os valores a assinar. */
export async function holeritesPendentesDeAssinatura(user: { id: string }) {
  const rows = await prisma.holerite.findMany({
    where: {
      userId: user.id,
      assinadoEm: null,
      folha: { status: "fechada", fechadaEm: { gte: ASSINATURA_HOLERITE_OBRIGATORIA_DESDE } },
    },
    orderBy: [{ folha: { ano: "asc" } }, { folha: { mes: "asc" } }],
    select: {
      id: true,
      folha: { select: { ano: true, mes: true, fechadaEm: true } },
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
      fechadaEm: h.folha.fechadaEm?.toISOString() ?? null,
      itens,
      proventos,
      descontos,
      liquido: proventos - descontos,
    };
  });
}
export type HoleritePendente = Awaited<ReturnType<typeof holeritesPendentesDeAssinatura>>[number];
