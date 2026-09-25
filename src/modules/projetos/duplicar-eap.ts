import type { Prisma, PrioridadeEap, TipoEap, TipoVinculoEap } from "@/generated/prisma/client";

/**
 * Cópia da EAP ao duplicar um projeto — PURA: recebe as linhas de origem e devolve o que gravar.
 *
 * Copia a ESTRUTURA do plano: árvore, tipo da linha (marco continua marco), duração em dias úteis,
 * prioridade, disciplina (a do clone), fase (se a disciplina do clone a tem) e classificadores, e o
 * tipo e a defasagem de cada dependência. Cada linha ganha um id e um ID corporativo NOVOS (D29): a identidade é da linha, não
 * do plano de onde ela veio.
 *
 * NÃO copia o que é do projeto de origem: avanço, situação, datas reais, bloqueio, linha de base,
 * horas e pessoas (a equipe do clone é outra decisão) e restrições de data — elas são datas
 * absolutas, e num projeto que começa em outro dia viram travas sem sentido. As datas previstas
 * copiadas são só o ponto de partida: o motor as recalcula a partir do início do cronograma novo.
 */

export type LinhaEapOrigem = {
  id: string;
  parentId: string | null;
  disciplinaId: string | null;
  nome: string;
  ordem: number;
  tipoEap: TipoEap;
  duracaoDias: Prisma.Decimal | number | string;
  prioridade: PrioridadeEap;
  etapaId: string | null;
  tipoAtividadeId: string | null;
  sistemaId: string | null;
  localizacaoId: string | null;
  origemId: string | null;
  inicioPrevisto: Date;
  fimPrevisto: Date;
  predecessoras: { predecessoraId: string; tipo: TipoVinculoEap; lagDias: Prisma.Decimal | number | string }[];
};

export type ContextoClonagemEap = {
  projetoId: string;
  /** Disciplina de origem → disciplina do clone. */
  disciplinaNova: ReadonlyMap<string, string>;
  /**
   * Fases (etapas) que cada disciplina do CLONE tem. A linha só leva a fase se a disciplina dela a tem:
   * o campo Fase do editor só aparece para disciplina com etapas, e uma fase sem etapa ficaria invisível
   * e sem como editar.
   */
  fasesDaDisciplina: ReadonlyMap<string, ReadonlySet<string>>;
  /** Linha de origem → id e ID corporativo da linha nova. */
  novaLinha: ReadonlyMap<string, { id: string; idCorporativo: string }>;
  /** Ids de classificador que valem em QUALQUER projeto — os do projeto de origem não. */
  catalogosGlobais: ReadonlySet<string>;
};

export function clonarEap(
  linhas: readonly LinhaEapOrigem[],
  ctx: ContextoClonagemEap,
): { linhas: Prisma.EapTarefaCreateManyInput[]; dependencias: Prisma.EapDependenciaCreateManyInput[] } {
  const global = (id: string | null) => (id && ctx.catalogosGlobais.has(id) ? id : null);

  const novasLinhas = linhas.map((t): Prisma.EapTarefaCreateManyInput => {
    const nova = ctx.novaLinha.get(t.id)!;
    const disciplinaId = t.disciplinaId ? (ctx.disciplinaNova.get(t.disciplinaId) ?? null) : null;
    return {
      id: nova.id,
      idCorporativo: nova.idCorporativo,
      projetoId: ctx.projetoId,
      parentId: t.parentId ? (ctx.novaLinha.get(t.parentId)?.id ?? null) : null,
      disciplinaId,
      nome: t.nome,
      ordem: t.ordem,
      tipoEap: t.tipoEap,
      duracaoDias: t.duracaoDias,
      prioridade: t.prioridade,
      etapaId: disciplinaId && t.etapaId && ctx.fasesDaDisciplina.get(disciplinaId)?.has(t.etapaId) ? t.etapaId : null,
      tipoAtividadeId: global(t.tipoAtividadeId),
      sistemaId: global(t.sistemaId),
      localizacaoId: global(t.localizacaoId),
      origemId: global(t.origemId),
      progresso: 0,
      inicioPrevisto: t.inicioPrevisto,
      fimPrevisto: t.fimPrevisto,
    };
  });

  const dependencias: Prisma.EapDependenciaCreateManyInput[] = [];
  for (const t of linhas) {
    const tarefa = ctx.novaLinha.get(t.id);
    for (const dep of t.predecessoras) {
      const predecessora = ctx.novaLinha.get(dep.predecessoraId);
      if (tarefa && predecessora) {
        dependencias.push({ tarefaId: tarefa.id, predecessoraId: predecessora.id, tipo: dep.tipo, lagDias: dep.lagDias });
      }
    }
  }

  return { linhas: novasLinhas, dependencias };
}
