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
 *
 * A marca de ETAPA DE TERCEIRO (o recurso "Externo", decisão #1) É copiada, ao contrário das
 * pessoas: ela diz o que a linha É — "esperar a prefeitura" continua sendo esperar a prefeitura no
 * projeto novo —, não quem a faz. Sem isso a linha clonada voltaria a contar como trabalho da casa,
 * ganhando card e responsável herdado.
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
  /** Tem o recurso "Externo" (etapa de terceiro)? Calculado com `ehEtapaDeTerceiro`. */
  deTerceiro: boolean;
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
): {
  linhas: Prisma.EapTarefaCreateManyInput[];
  dependencias: Prisma.EapDependenciaCreateManyInput[];
  atribuicoesExternas: Prisma.EapAtribuicaoCreateManyInput[];
} {
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

  const atribuicoesExternas = linhas
    .filter((t) => t.deTerceiro)
    .map((t): Prisma.EapAtribuicaoCreateManyInput => ({
      tarefaId: ctx.novaLinha.get(t.id)!.id,
      papel: "ext",
      horasPrevistas: 0,
    }));

  return { linhas: novasLinhas, dependencias, atribuicoesExternas };
}
