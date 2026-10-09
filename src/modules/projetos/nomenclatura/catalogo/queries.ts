import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { projetosPorCard } from "@/modules/projetos/cadastro-disciplina";
import type { UsoItem } from "./todas";
import type { AlvoCatalogo, CatalogoSnap } from "./versao";

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
      exigeDwg: true,
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

/** Soma contagens agrupadas por id (ids nulos ficam de fora). */
function somar(alvo: Record<string, number>, linhas: { id: string | null; n: number }[]) {
  for (const l of linhas) if (l.id) alvo[l.id] = (alvo[l.id] ?? 0) + l.n;
}

/**
 * Registros de outras áreas presos a cada card (propostas, normas, padrões, negociações, tabela de
 * preço, modelos de EAP) e a cada fase (tarefas da EAP). Excluir os soltaria (`SetNull`) ou falharia
 * (`Restrict`); por isso entram no "pode excluir?" (`motivoExclusao`). Em sequência, não em
 * `Promise.all` (pode rodar numa transação).
 */
async function vinculosPorId(db: Db, filtro?: { cardId?: string; itemId?: string }): Promise<Record<string, number>> {
  const v: Record<string, number> = {};
  const porCard = filtro?.itemId ? undefined : filtro?.cardId;
  const soItem = !!filtro?.itemId;
  const ondeCard = (campo: string) => (porCard ? { [campo]: porCard } : { [campo]: { not: null } });
  if (!soItem) {
    const contar = <T extends { _count: { _all: number } }>(linhas: T[], chave: (l: T) => string | null) =>
      somar(v, linhas.map((l) => ({ id: chave(l), n: l._count._all })));
    contar(await db.padraoTecnico.groupBy({ by: ["disciplinaId"], where: ondeCard("disciplinaId"), _count: { _all: true } }), (l) => l.disciplinaId);
    contar(await db.normaTecnicaDisciplina.groupBy({ by: ["disciplinaId"], where: porCard ? { disciplinaId: porCard } : {}, _count: { _all: true } }), (l) => l.disciplinaId);
    contar(await db.negociacaoDisciplina.groupBy({ by: ["disciplinaId"], where: porCard ? { disciplinaId: porCard } : {}, _count: { _all: true } }), (l) => l.disciplinaId);
    contar(await db.modeloEap.groupBy({ by: ["disciplinaCatalogoId"], where: ondeCard("disciplinaCatalogoId"), _count: { _all: true } }), (l) => l.disciplinaCatalogoId);
    contar(await db.itemTabelaPreco.groupBy({ by: ["disciplinaId"], where: ondeCard("disciplinaId"), _count: { _all: true } }), (l) => l.disciplinaId);
    contar(await db.clausulaProposta.groupBy({ by: ["disciplinaId"], where: ondeCard("disciplinaId"), _count: { _all: true } }), (l) => l.disciplinaId);
    contar(await db.propostaSecao.groupBy({ by: ["disciplinaId"], where: ondeCard("disciplinaId"), _count: { _all: true } }), (l) => l.disciplinaId);
    contar(await db.propostaItem.groupBy({ by: ["disciplinaId"], where: ondeCard("disciplinaId"), _count: { _all: true } }), (l) => l.disciplinaId);
  }
  if (!porCard) {
    const tarefas = await db.eapTarefa.groupBy({
      by: ["etapaId"],
      where: filtro?.itemId ? { etapaId: filtro.itemId } : { etapaId: { not: null } },
      _count: { _all: true },
    });
    somar(v, tarefas.map((l) => ({ id: l.etapaId, n: l._count._all })));
  }
  return v;
}

/** Documentos que apontam para fase, tipo ou formato de folha, por id do item. */
async function documentosPorItem(db: Db, itemId?: string): Promise<Record<string, number>> {
  const d: Record<string, number> = {};
  for (const campo of ["faseId", "tipoId", "tamanhoPapelId"] as const) {
    const linhas = await db.documentoDisciplina.groupBy({
      by: [campo],
      where: itemId ? { [campo]: itemId } : { [campo]: { not: null } },
      _count: { _all: true },
    });
    somar(d, linhas.map((l) => ({ id: (l as Record<string, unknown>)[campo] as string | null, n: l._count._all })));
  }
  return d;
}

/**
 * O que trava "Excluir" na lente Todas, por id: documentos das subs (`subs`), etapas de disciplina
 * das fases (`fases`), documentos de fase/tipo (`documentos`) e registros de outras áreas
 * (`vinculos`, de cards e fases). O uso do card em projetos vem de `catalogoDisciplinasAdmin`.
 */
export async function usoDoCatalogo(db: Db = prisma): Promise<{
  subs: Record<string, number>;
  fases: Record<string, number>;
  documentos: Record<string, number>;
  vinculos: Record<string, number>;
}> {
  const subs: Record<string, number> = {};
  const porSub = await db.documentoDisciplina.groupBy({ by: ["subdisciplinaId"], where: { subdisciplinaId: { not: null } }, _count: { _all: true } });
  somar(subs, porSub.map((l) => ({ id: l.subdisciplinaId, n: l._count._all })));
  const fases: Record<string, number> = {};
  const etapas = await db.disciplinaEtapa.groupBy({ by: ["etapaId"], _count: { _all: true } });
  somar(fases, etapas.map((l) => ({ id: l.etapaId, n: l._count._all })));
  return { subs, fases, documentos: await documentosPorItem(db), vinculos: await vinculosPorId(db) };
}

/** Projetos distintos que usam o card (nome sem caixa/acento ou FK) — a pasta dos arquivos e o excluir dependem disto. */
export async function projetosDoCard(db: Db, card: { id: string; nome: string }): Promise<number> {
  const linhas = await db.disciplina.findMany({ select: { disciplinaTextoLegado: true, projetoId: true, disciplinaId: true } });
  return projetosPorCard([card], linhas).get(card.id) ?? 0;
}

/** O mesmo `UsoItem` que a tela monta, lido do banco do momento — para o servidor recusar com a mesma frase. */
export async function usoParaExcluir(db: Db, alvo: AlvoCatalogo, nome: string): Promise<UsoItem> {
  if (alvo.tipo === "disciplina") {
    const documentos = await db.documentoDisciplina.count({ where: { subdisciplina: { disciplinaCatalogoId: alvo.id } } });
    const vinculos = (await vinculosPorId(db, { cardId: alvo.id }))[alvo.id] ?? 0;
    return { uso: await projetosDoCard(db, { id: alvo.id, nome }), documentos, vinculos };
  }
  if (alvo.tipo === "subdisciplina") {
    return { uso: await db.documentoDisciplina.count({ where: { subdisciplinaId: alvo.id } }) };
  }
  const uso = await db.disciplinaEtapa.count({ where: { etapaId: alvo.id } });
  const documentos = (await documentosPorItem(db, alvo.id))[alvo.id] ?? 0;
  const vinculos = (await vinculosPorId(db, { itemId: alvo.id }))[alvo.id] ?? 0;
  return { uso, documentos, vinculos };
}
