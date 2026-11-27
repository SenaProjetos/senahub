/**
 * "Completar a equipe na linha de base" (pedido do Ryan, decisão do dono em 26/11/2026). PURO: sem I/O.
 *
 * O cronograma é aprovado com quem já está definido (sem pessoa é só alerta) e as pessoas entram depois — o plano
 * aprovado deixa mudar pessoas e horas. Mas a linha de base congelou as HORAS e o CUSTO de quem estava escalado no dia
 * da aprovação, e é desse número que saem o orçado de "Horas por disciplina" e o custo planejado do Valor Agregado:
 * quem entra depois apareceria como estouro. "Nova linha de base" não serve, porque copia as datas de HOJE e o atraso
 * entraria no combinado.
 *
 * Esta regra recalcula SÓ horas e custo da linha de base em vigor, e SÓ nas atividades que ainda não começaram
 * (decisão do dono: o que já está em andamento fica com o orçamento original, para ninguém ajustar o orçamento depois de
 * ver o realizado). Início, término, duração e % planejado nunca mudam. É a única exceção à regra de que a linha de base
 * não é reescrita (Doc 03 §20), e por isso sai com motivo e registro de antes/depois.
 *
 * Os agrupamentos da linha de base são refeitos pela soma das atividades de dentro com a MESMA regra do motor e de
 * `custo.ts`: desconhecido (nulo) não vira zero — um filho sem estimativa deixa o agrupamento sem estimativa.
 */

/** Status em que a atividade ainda não começou. `and`, `rev`, `apr`, `con` já andaram; `sus`, `can`, `arq` saíram do plano. */
const STATUS_NAO_INICIADA = new Set(["nin", "agu", "blq"]);

/** Não iniciada = sem início real, 0% e num status de antes do começo. A 1ª hora de ponto grava o início real. */
export function atividadeNaoIniciada(t: { status: string; progresso: number; inicioReal: unknown }): boolean {
  return t.inicioReal == null && t.progresso === 0 && STATUS_NAO_INICIADA.has(t.status);
}

export type LinhaDaBase = {
  /** Id da linha da linha de base (`EapBaselineLinha.id`). */
  id: string;
  tarefaId: string | null;
  nome: string;
  resumo: boolean;
  trabalhoHoras: number | null;
  custoPrevisto: number | null;
};

export type LinhaDeHoje = {
  id: string;
  parentId: string | null;
  nome: string;
  ehResumo: boolean;
  naoIniciada: boolean;
  /** Horas do motor hoje (`LinhaAgendada.trabalhoHoras`). */
  trabalhoHoras: number | null;
  /** Custo previsto hoje (`custosDoProjeto`). */
  custo: number | null;
};

export type MudancaNaBase = {
  linhaBaseId: string;
  tarefaId: string;
  nome: string;
  resumo: boolean;
  antes: { horas: number | null; custo: number | null };
  depois: { horas: number | null; custo: number | null };
};

export type PlanoDaBase = {
  mudancas: MudancaNaBase[];
  /** Atividades cuja equipe de hoje difere da linha de base, mas que já começaram (ficam como estão). */
  iniciadasDiferentes: number;
  /** Atividades que vão mudar (sem contar os agrupamentos, que acompanham). */
  atividadesAtualizadas: number;
};

const horas2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
const centavos = (v: number) => Math.round(v * 100);
const reais2 = (v: number | null) => (v == null ? null : centavos(v) / 100);
const igual = (a: number | null, b: number | null) => (a == null || b == null ? a === b : Math.abs(a - b) < 0.005);

/**
 * O que muda na linha de base. `base` = as linhas da linha de base em vigor; `hoje` = a EAP de hoje (a mesma árvore:
 * o plano aprovado trava a estrutura, e quem chama recusa com a revisão aberta).
 */
export function planejarEquipeNaBase(base: readonly LinhaDaBase[], hoje: readonly LinhaDeHoje[]): PlanoDaBase {
  const porTarefa = new Map(hoje.map((t) => [t.id, t]));
  const filhos = new Map<string, string[]>();
  for (const t of hoje) {
    if (t.parentId == null) continue;
    const l = filhos.get(t.parentId) ?? [];
    l.push(t.id);
    filhos.set(t.parentId, l);
  }
  const daBase = new Map<string, LinhaDaBase>();
  for (const b of base) if (b.tarefaId) daBase.set(b.tarefaId, b);

  // Valores novos das atividades (folhas): só as não iniciadas pegam o de hoje.
  const novo = new Map<string, { horas: number | null; custo: number | null }>();
  let iniciadasDiferentes = 0;
  for (const b of base) {
    if (b.resumo || !b.tarefaId) continue;
    const t = porTarefa.get(b.tarefaId);
    const antes = { horas: b.trabalhoHoras, custo: b.custoPrevisto };
    if (!t || t.ehResumo) {
      novo.set(b.tarefaId, antes);
      continue;
    }
    const deHoje = { horas: horas2(t.trabalhoHoras), custo: reais2(t.custo) };
    // O gatilho são as HORAS (gente entrou, saiu ou mudou de horas). Só a taxa mudar (reajuste do custo/hora) não reabre o
    // orçamento: o custo foi congelado justamente para a taxa nova não mexer no combinado (schema, `custoPrevisto`).
    // Quando as horas mudam, o custo vem junto, já na taxa de hoje. Hoje sem estimativa (ninguém com hora) não apaga um
    // número conhecido da linha de base.
    const difere = deHoje.horas != null && !igual(antes.horas, deHoje.horas);
    if (!t.naoIniciada) {
      if (difere) iniciadasDiferentes++;
      novo.set(b.tarefaId, antes);
      continue;
    }
    novo.set(b.tarefaId, difere ? deHoje : antes);
  }

  // Agrupamentos: soma dos filhos da árvore de hoje, com os valores (já atualizados) da linha de base. Desconhecido
  // contamina para cima; filho sem linha na base também é desconhecido (não deveria existir com a estrutura travada).
  const memo = new Map<string, { horas: number | null; custo: number | null }>();
  const visitando = new Set<string>();
  const valor = (tarefaId: string): { horas: number | null; custo: number | null } => {
    const pronto = memo.get(tarefaId) ?? novo.get(tarefaId);
    if (pronto) return pronto;
    const meus = filhos.get(tarefaId) ?? [];
    const b = daBase.get(tarefaId);
    if (meus.length === 0 || visitando.has(tarefaId)) {
      const v = b ? { horas: b.trabalhoHoras, custo: b.custoPrevisto } : { horas: null, custo: null };
      memo.set(tarefaId, v);
      return v;
    }
    visitando.add(tarefaId);
    let h: number | null = 0;
    let c: number | null = 0;
    for (const f of meus) {
      if (!daBase.has(f)) {
        h = null;
        c = null;
        continue;
      }
      const vf = valor(f);
      h = h == null || vf.horas == null ? null : h + vf.horas;
      c = c == null || vf.custo == null ? null : c + centavos(vf.custo);
    }
    visitando.delete(tarefaId);
    const v = { horas: horas2(h), custo: c == null ? null : c / 100 };
    memo.set(tarefaId, v);
    return v;
  };

  const mudancas: MudancaNaBase[] = [];
  let atividadesAtualizadas = 0;
  for (const b of base) {
    if (!b.tarefaId) continue;
    const v = b.resumo ? valor(b.tarefaId) : novo.get(b.tarefaId);
    if (!v) continue;
    if (igual(b.trabalhoHoras, v.horas) && igual(b.custoPrevisto, v.custo)) continue;
    if (!b.resumo) atividadesAtualizadas++;
    mudancas.push({
      linhaBaseId: b.id,
      tarefaId: b.tarefaId,
      nome: porTarefa.get(b.tarefaId)?.nome ?? b.nome,
      resumo: b.resumo,
      antes: { horas: b.trabalhoHoras, custo: b.custoPrevisto },
      depois: v,
    });
  }
  return { mudancas, iniciadasDiferentes, atividadesAtualizadas };
}

export const MOTIVO_BASE_SEM_APROVACAO = "Só há linha de base para completar depois de aprovar o cronograma.";
export const MOTIVO_BASE_EM_REVISAO =
  "Com a revisão aberta, a nova linha de base já vai congelar as horas e o custo de hoje — complete a equipe por ela.";
export const MOTIVO_BASE_SEM_MUDANCA =
  "Nada a completar: nas atividades que ainda não começaram, as horas e o custo de hoje já são os da linha de base.";
export const MOTIVO_BASE_MUDOU = "A linha de base mudou enquanto você conferia; abra de novo e confira.";
