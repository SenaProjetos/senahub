import "server-only";

import { prisma } from "@/lib/prisma";
import { fasesParaNascer } from "@/modules/projetos/etapas-padrao";
import type { UsoDoTipo } from "./regras";

export type TipoEmpreendimentoItem = {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
  /** O que está gravado (vazio = padrão do sistema). */
  etapasPadraoIds: string[];
  /** O que a disciplina de fato recebe hoje (o gravado, ou o padrão do sistema), já na ordem do catálogo. */
  etapasEfetivasIds: string[];
  uso: UsoDoTipo;
};

export type FaseDoCatalogoItem = { id: string; sigla: string; nome: string; ordem: number };

/** Fases globais ativas do catálogo — as opções de "etapas em que a disciplina nasce". */
export async function fasesDoCatalogoAtivas(): Promise<FaseDoCatalogoItem[]> {
  return prisma.pranchaCatalogo.findMany({
    where: { categoria: "fase", projetoId: null, ativo: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    select: { id: true, sigla: true, nome: true, ordem: true },
  });
}

/** Todos os tipos (ativos e inativos), na ordem de cadastro, com a contagem de uso para a tela explicar a exclusão. */
export async function listarTiposEmpreendimento(): Promise<{ tipos: TipoEmpreendimentoItem[]; fases: FaseDoCatalogoItem[] }> {
  const [fases, linhas] = await Promise.all([
    fasesDoCatalogoAtivas(),
    prisma.tipoEmpreendimento.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      select: {
        id: true,
        nome: true,
        ordem: true,
        ativo: true,
        etapasPadraoIds: true,
        _count: { select: { projetos: true, negociacoes: true, modelosEap: true } },
      },
    }),
  ]);
  const tipos = linhas.map((t) => ({
    id: t.id,
    nome: t.nome,
    ordem: t.ordem,
    ativo: t.ativo,
    etapasPadraoIds: t.etapasPadraoIds,
    etapasEfetivasIds: fasesParaNascer({ tipoProjeto: "particular", idsDoTipo: t.etapasPadraoIds, catalogo: fases }),
    uso: { projetos: t._count.projetos, negociacoes: t._count.negociacoes, modelos: t._count.modelosEap },
  }));
  return { tipos, fases };
}
