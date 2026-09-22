import "server-only";
import { prisma } from "@/lib/prisma";
import type { CatalogosNomenclatura } from "./vocabulario";
import { catalogosDaVersao } from "./siglas-versao";
import type { ExtensaoDef } from "./extensoes";

/**
 * Carrega os catálogos (disciplina/fase/tipo, com sinônimos) na forma que a função pura
 * `montarVocabulario()` espera. Só ativos — item arquivado não deve mais ser reconhecido no
 * nome, mesmo que documentos antigos ainda apontem para ele.
 *
 * `disciplinas` não filtra por projeto: `DisciplinaCatalogo` é sempre global (não existe versão
 * por projeto, ao contrário de `PranchaCatalogo`). Fase/tipo trazem global + o que for específico
 * de `projetoId` — a precedência (projeto vence global) é resolvida dentro de `montarVocabulario`.
 */
export async function carregarCatalogosNomenclatura(projetoId: string | null): Promise<CatalogosNomenclatura> {
  const [disciplinas, pranchas, overridePorCatalogoId] = await Promise.all([
    prisma.disciplinaCatalogo.findMany({
      where: { ativo: true },
      select: { id: true, codigo: true, numeracao: true, numeracaoFim: true, sinonimos: true },
    }),
    prisma.pranchaCatalogo.findMany({
      where: {
        ativo: true,
        categoria: { in: ["fase", "tipo"] },
        OR: [{ projetoId: null }, ...(projetoId ? [{ projetoId }] : [])],
      },
      select: { id: true, categoria: true, sigla: true, sinonimos: true, projetoId: true },
    }),
    faixasDoProjeto(projetoId),
  ]);

  return {
    disciplinas: disciplinas.map((d) => {
      const override = overridePorCatalogoId.get(d.id);
      return {
        id: d.id,
        codigo: d.codigo,
        numeracao: override ? override.inicio : d.numeracao,
        numeracaoFim: override ? override.fim : d.numeracaoFim,
        sinonimos: d.sinonimos,
      };
    }),
    fases: pranchas
      .filter((p) => p.categoria === "fase")
      .map((p) => ({ id: p.id, sigla: p.sigla, sinonimos: p.sinonimos, projetoId: p.projetoId })),
    tipos: pranchas
      .filter((p) => p.categoria === "tipo")
      .map((p) => ({ id: p.id, sigla: p.sigla, sinonimos: p.sinonimos, projetoId: p.projetoId })),
  };
}

/**
 * Faixa por projeto (2026-09-16): SÓ este projeto pode sobrescrever o início/fim do catálogo
 * global — não afeta a faixa reconhecida em nenhum outro projeto.
 */
async function faixasDoProjeto(projetoId: string | null): Promise<Map<string, { inicio: number; fim: number }>> {
  if (!projetoId) return new Map();
  const overrides = await prisma.disciplina.findMany({
    where: {
      projetoId,
      disciplinaId: { not: null },
      numeracaoInicioProjeto: { not: null },
      numeracaoFimProjeto: { not: null },
    },
    select: { disciplinaId: true, numeracaoInicioProjeto: true, numeracaoFimProjeto: true },
  });
  return new Map(
    overrides.map((o) => [o.disciplinaId as string, { inicio: o.numeracaoInicioProjeto!, fim: o.numeracaoFimProjeto! }]),
  );
}

const SIGLA_SELECT = { select: { sigla: true, oficial: true, versaoDesde: true, versaoAte: true } } as const;

/**
 * Mesmo resultado de `carregarCatalogosNomenclatura`, mas lendo as siglas de
 * `SiglaNomenclatura` para UMA versão do padrão (D4/D11 da spec de nomenclatura versionada).
 * Mesmos filtros: só ativos, fase/tipo global + do próprio projeto, faixa por projeto aplicada.
 * A F2 troca os consumidores para esta leitura; até lá ela só é conferida contra a antiga
 * (`scripts/verificar-siglas-versao.ts`).
 */
export async function carregarCatalogosNomenclaturaDaVersao(
  projetoId: string | null,
  versao: number,
): Promise<CatalogosNomenclatura> {
  const [disciplinas, pranchas, overridePorCatalogoId] = await Promise.all([
    prisma.disciplinaCatalogo.findMany({
      where: { ativo: true },
      select: {
        id: true,
        numeracao: true,
        numeracaoFim: true,
        versaoDesde: true,
        versaoAte: true,
        siglas: SIGLA_SELECT,
      },
    }),
    prisma.pranchaCatalogo.findMany({
      where: {
        ativo: true,
        categoria: { in: ["fase", "tipo"] },
        OR: [{ projetoId: null }, ...(projetoId ? [{ projetoId }] : [])],
      },
      select: { id: true, categoria: true, projetoId: true, versaoDesde: true, versaoAte: true, siglas: SIGLA_SELECT },
    }),
    faixasDoProjeto(projetoId),
  ]);

  return catalogosDaVersao(
    {
      disciplinas: disciplinas.map((d) => {
        const override = overridePorCatalogoId.get(d.id);
        return {
          ...d,
          numeracao: override ? override.inicio : d.numeracao,
          numeracaoFim: override ? override.fim : d.numeracaoFim,
        };
      }),
      pranchas,
    },
    versao,
  );
}

/** Catálogo de extensões ativo, na forma que `classificarExtensao()` consome. */
export async function carregarExtensoesNomenclatura(): Promise<ExtensaoDef[]> {
  const rows = await prisma.extensaoArquivo.findMany({
    where: { ativo: true },
    select: { extensao: true, categoria: true, software: true, ehBackup: true, ehTemporario: true, ehConteiner: true },
  });
  return rows;
}

/**
 * `Disciplina.id` → id do `DisciplinaCatalogo` correspondente, para o diálogo de envio avisar
 * quando o nome indica outra disciplina. A FK é `Disciplina.disciplinaId` e é NULLABLE (ainda há
 * disciplina ligada ao catálogo só por texto) — sem ela, o motor simplesmente não compara.
 */
export async function catalogoPorDisciplinaDoProjeto(projetoId: string): Promise<Record<string, string | null>> {
  const rows = await prisma.disciplina.findMany({
    where: { projetoId },
    select: { id: true, disciplinaId: true },
  });
  return Object.fromEntries(rows.map((r) => [r.id, r.disciplinaId]));
}

/** Catálogo completo (ativas + inativas) para a tela de administração. */
export async function listarExtensoesAdmin() {
  return prisma.extensaoArquivo.findMany({ orderBy: [{ categoria: "asc" }, { ordem: "asc" }] });
}

export type ExtensaoArquivoRow = Awaited<ReturnType<typeof listarExtensoesAdmin>>[number];

/**
 * Extensões que aparecem em uploads ativos mas não estão no catálogo — para a tela de admin
 * ("extensões desconhecidas no acervo"). Não lê o conteúdo dos arquivos, só o nome; `.0001.rvt`
 * etc. contam junto com `.rvt` aqui (o backup numerado do Revit só é distinguido pelo motor de
 * nomenclatura, não por esta consulta simples de agregação).
 */
export async function extensoesDesconhecidasNoAcervo(): Promise<{ extensao: string; quantidade: number }[]> {
  const rows = await prisma.$queryRaw<{ extensao: string; quantidade: bigint }[]>`
    select lower(substring(u."nomeArquivo" from '\.([^.]+)$')) as extensao, count(*)::bigint as quantidade
    from "upload" u
    where u."excluidoEm" is null
      and u."nomeArquivo" ~ '\.[^.]+$'
      and not exists (
        select 1 from "extensao_arquivo" e where e."extensao" = lower(substring(u."nomeArquivo" from '\.([^.]+)$'))
      )
    group by 1
    order by quantidade desc
    limit 50
  `;
  return rows.map((r) => ({ extensao: r.extensao, quantidade: Number(r.quantidade) }));
}
