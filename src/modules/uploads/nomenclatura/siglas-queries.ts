import "server-only";
import { prisma } from "@/lib/prisma";
import type { LinhaSigla } from "./publicacao";
import { intersecaoFaixas, type FaixaVersao } from "./siglas-versao";

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
 * `publicacao.ts`) e para qualquer tela que precise mostrar "esta sigla pertence a quem". A faixa
 * de cada linha já vem recortada pela validade do item (e do card-mãe, para sub): o `SEG` de um
 * CFTV encerrado na v1 não pode aparecer como dono do `SEG` na v2, senão a trava compara o card
 * antigo com ele mesmo e não avisa da redefinição.
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
    prisma.disciplinaCatalogo.findMany({ select: { id: true, nome: true, versaoDesde: true, versaoAte: true } }),
    prisma.subdisciplinaCatalogo.findMany({
      select: {
        id: true,
        nome: true,
        versaoDesde: true,
        versaoAte: true,
        disciplinaCatalogo: { select: { nome: true, versaoDesde: true, versaoAte: true } },
      },
    }),
    prisma.pranchaCatalogo.findMany({ select: { id: true, nome: true, versaoDesde: true, versaoAte: true } }),
  ]);
  type Alvo = { rotulo: string; faixas: FaixaVersao[] };
  const porDisc = new Map<string, Alvo>(disciplinas.map((d) => [d.id, { rotulo: d.nome, faixas: [d] }]));
  const porSub = new Map<string, Alvo>(
    subs.map((s) => [s.id, { rotulo: `${s.nome} (sub de ${s.disciplinaCatalogo.nome})`, faixas: [s, s.disciplinaCatalogo] }]),
  );
  const porPrancha = new Map<string, Alvo>(pranchas.map((p) => [p.id, { rotulo: p.nome, faixas: [p] }]));

  return siglas.flatMap((s): LinhaSigla[] => {
    const [alvoChave, alvo] = s.disciplinaCatalogoId
      ? [`disciplina:${s.disciplinaCatalogoId}`, porDisc.get(s.disciplinaCatalogoId)]
      : s.subdisciplinaId
        ? [`subdisciplina:${s.subdisciplinaId}`, porSub.get(s.subdisciplinaId)]
        : s.pranchaCatalogoId
          ? [`prancha:${s.pranchaCatalogoId}`, porPrancha.get(s.pranchaCatalogoId)]
          : [null, undefined];
    if (!alvoChave) return [];
    let faixa: FaixaVersao | null = { versaoDesde: s.versaoDesde, versaoAte: s.versaoAte };
    for (const f of alvo?.faixas ?? []) faixa = faixa && intersecaoFaixas(faixa, f);
    if (!faixa) return [];
    return [
      {
        sigla: s.sigla,
        categoria: s.categoria,
        oficial: s.oficial,
        versaoDesde: faixa.versaoDesde,
        versaoAte: faixa.versaoAte,
        alvoChave,
        alvoRotulo: alvo?.rotulo ?? "?",
      },
    ];
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
