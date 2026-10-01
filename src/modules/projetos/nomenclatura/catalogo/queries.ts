import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { CatalogoSnap } from "./versao";

type Db = Prisma.TransactionClient | typeof prisma;

const LINHAS = { select: { id: true, sigla: true, oficial: true, versaoDesde: true, versaoAte: true } } as const;

/**
 * O catálogo global de nomenclatura inteiro (arquivados inclusos — contam na checagem de sigla,
 * como no diálogo "Siglas por versão"): cards, subs e fases/tipos sem projeto. Pequeno (dezenas
 * de itens), lido de uma vez para a tela "Catálogo da vN" e para planejar a importação. Aceita a
 * transação (o smoke lê dentro dela); por isso as três consultas vão em sequência, não em
 * `Promise.all` (uma transação tem uma conexão só).
 */
export async function carregarCatalogoSnap(db: Db = prisma): Promise<CatalogoSnap> {
  const cards = await db.disciplinaCatalogo.findMany({
    select: {
      id: true,
      nome: true,
      codigo: true,
      sinonimos: true,
      categoria: true,
      ativo: true,
      ordem: true,
      versaoDesde: true,
      versaoAte: true,
      siglas: LINHAS,
    },
  });
  const subs = await db.subdisciplinaCatalogo.findMany({
    select: {
      id: true,
      disciplinaCatalogoId: true,
      nome: true,
      ativo: true,
      ordem: true,
      versaoDesde: true,
      versaoAte: true,
      siglas: LINHAS,
    },
  });
  const itens = await db.pranchaCatalogo.findMany({
    where: { projetoId: null, categoria: { in: ["fase", "tipo"] } },
    select: {
      id: true,
      categoria: true,
      sigla: true,
      nome: true,
      sinonimos: true,
      ativo: true,
      ordem: true,
      versaoDesde: true,
      versaoAte: true,
      siglas: LINHAS,
    },
  });
  return {
    cards,
    subs: subs.map(({ disciplinaCatalogoId, ...s }) => ({ ...s, cardId: disciplinaCatalogoId })),
    itens: itens.map((i) => ({ ...i, categoria: i.categoria as "fase" | "tipo" })),
  };
}

/** Números das versões cadastradas (rascunho incluso). */
export async function numerosDasVersoes(): Promise<number[]> {
  const v = await prisma.nomenclaturaVersao.findMany({ select: { numero: true }, orderBy: { numero: "asc" } });
  return v.map((x) => x.numero);
}

/**
 * Uso das subs (documentos que apontam para ela) e das fases (etapas de disciplina), por id — o que
 * trava "Excluir" na lente Todas. Em sequência, não em `Promise.all` (pode rodar numa transação).
 */
export async function usoDoCatalogo(db: Db = prisma): Promise<{ subs: Record<string, number>; fases: Record<string, number> }> {
  const subs = await db.documentoDisciplina.groupBy({
    by: ["subdisciplinaId"],
    where: { subdisciplinaId: { not: null } },
    _count: { _all: true },
  });
  const fases = await db.disciplinaEtapa.groupBy({ by: ["etapaId"], _count: { _all: true } });
  const mapa = (linhas: { id: string | null; n: number }[]) =>
    Object.fromEntries(linhas.filter((l): l is { id: string; n: number } => l.id !== null).map((l) => [l.id, l.n]));
  return {
    subs: mapa(subs.map((l) => ({ id: l.subdisciplinaId, n: l._count._all }))),
    fases: mapa(fases.map((l) => ({ id: l.etapaId, n: l._count._all }))),
  };
}
