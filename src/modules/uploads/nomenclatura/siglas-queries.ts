import "server-only";
import { prisma } from "@/lib/prisma";
import type { LinhaSigla } from "./publicacao";

export type AlvoSigla =
  | { tipo: "disciplina"; id: string }
  | { tipo: "subdisciplina"; id: string }
  | { tipo: "prancha"; id: string };

function whereDoAlvo(alvo: AlvoSigla) {
  if (alvo.tipo === "disciplina") return { disciplinaCatalogoId: alvo.id };
  if (alvo.tipo === "subdisciplina") return { subdisciplinaId: alvo.id };
  return { pranchaCatalogoId: alvo.id };
}

/** Siglas de UM item (card, sub ou item da Lista Mestre), mais recente primeiro dentro de cada faixa. */
export async function siglasDoAlvo(alvo: AlvoSigla) {
  return prisma.siglaNomenclatura.findMany({
    where: whereDoAlvo(alvo),
    orderBy: [{ versaoDesde: "asc" }, { oficial: "desc" }],
  });
}

export type SiglaDoAlvo = Awaited<ReturnType<typeof siglasDoAlvo>>[number];

/**
 * Todas as siglas do sistema, com o rótulo legível do alvo — para a trava de publicação (D5,
 * `publicacao.ts`) e para qualquer tela que precise mostrar "esta sigla pertence a quem".
 */
export async function todasAsSiglasComRotulo(): Promise<LinhaSigla[]> {
  const [siglas, disciplinas, subs, pranchas] = await Promise.all([
    prisma.siglaNomenclatura.findMany({
      select: {
        sigla: true,
        categoria: true,
        oficial: true,
        versaoDesde: true,
        versaoAte: true,
        disciplinaCatalogoId: true,
        subdisciplinaId: true,
        pranchaCatalogoId: true,
      },
    }),
    prisma.disciplinaCatalogo.findMany({ select: { id: true, nome: true } }),
    prisma.subdisciplinaCatalogo.findMany({ select: { id: true, nome: true, disciplinaCatalogo: { select: { nome: true } } } }),
    prisma.pranchaCatalogo.findMany({ select: { id: true, nome: true } }),
  ]);
  const nomeDisc = new Map(disciplinas.map((d) => [d.id, d.nome]));
  const nomeSub = new Map(subs.map((s) => [s.id, `${s.nome} (sub de ${s.disciplinaCatalogo.nome})`]));
  const nomePrancha = new Map(pranchas.map((p) => [p.id, p.nome]));

  return siglas.flatMap((s): LinhaSigla[] => {
    const [alvoChave, alvoRotulo] = s.disciplinaCatalogoId
      ? [`disciplina:${s.disciplinaCatalogoId}`, nomeDisc.get(s.disciplinaCatalogoId) ?? "?"]
      : s.subdisciplinaId
        ? [`subdisciplina:${s.subdisciplinaId}`, nomeSub.get(s.subdisciplinaId) ?? "?"]
        : s.pranchaCatalogoId
          ? [`prancha:${s.pranchaCatalogoId}`, nomePrancha.get(s.pranchaCatalogoId) ?? "?"]
          : [null, null];
    if (!alvoChave) return [];
    return [{ sigla: s.sigla, categoria: s.categoria, oficial: s.oficial, versaoDesde: s.versaoDesde, versaoAte: s.versaoAte, alvoChave, alvoRotulo }];
  });
}

/**
 * Quantos documentos ativos do acervo têm a sigla como uma "palavra" no nome do arquivo
 * (separada por `-`, `_`, `.` ou espaço) — usado só para o AVISO do D5 ("também aparece em N
 * arquivos já enviados"), nunca para decidir automaticamente o que aquele arquivo significa.
 */
export async function contarAcervoPorSigla(sigla: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ total: bigint }[]>`
    select count(*)::bigint as total
    from "documento_disciplina" d
    where d."substituidoPorId" is null
      and d."nomeArquivo" ~* ('(^|[^A-Za-z0-9])' || ${sigla} || '([^A-Za-z0-9]|$)')
  `;
  return Number(rows[0]?.total ?? 0);
}
