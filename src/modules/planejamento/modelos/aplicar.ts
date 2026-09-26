/**
 * Aplicar um modelo de EAP num projeto — PURO: recebe a estrutura gravada e o que o projeto tem, e
 * devolve o que gravar. Quem escreve é `modelos/service.ts`.
 *
 * Mesma divisão de `projetos/duplicar-eap.ts` (clonagem), e pelo mesmo motivo: a regra do que vira o
 * quê é testável sem banco, e o I/O fica num lugar só.
 *
 * Três decisões que não são óbvias:
 *
 * 1. **Disciplina que o projeto não tem é PODADA, com o galho inteiro.** O modelo é da casa e traz
 *    todas as disciplinas que ela faz; o projeto contratou algumas. Criar a linha sem disciplina
 *    pareceria trabalho a fazer e entraria no prazo; criar a `Disciplina` no projeto seria pior — ela
 *    carrega valor, responsáveis e pagamento de projetista. Então sai, e a tela DIZ o que saiu.
 * 2. **Datas são provisórias.** Toda linha nasce na âncora do cronograma, porque quem manda nas datas
 *    é o motor (duração + vínculo + calendário). Gravar data "do modelo" traria o cronograma de outro
 *    projeto.
 * 3. **A fase só acompanha a disciplina que a tem** (mesma regra da clonagem): o campo Fase do editor
 *    só aparece para disciplina com etapas cadastradas, e uma fase fora dessa lista ficaria invisível
 *    e sem como corrigir.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { EstruturaModelo, LinhaModelo } from "./estrutura";

export type ContextoAplicacao = {
  projetoId: string;
  /** Disciplina do CATÁLOGO → `Disciplina.id` deste projeto. O que não está aqui é podado. */
  disciplinaDoProjeto: ReadonlyMap<string, string>;
  /** Fases (etapas) cadastradas em cada disciplina DO PROJETO. */
  fasesDaDisciplina: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * D38: quando o modelo traz percentual por fase, aplicar CADASTRA as fases das disciplinas que ainda
   * não têm nenhuma — e por isso a linha guarda a fase que está sendo criada na mesma transação. Sem
   * isto, projeto novo (que nunca tem fase cadastrada) perderia a fase de toda linha.
   */
  cadastrarFases: boolean;
  /** Linha do modelo → id e ID corporativo reservados (D29: identidade nova, nunca a do modelo). */
  novaLinha: ReadonlyMap<string, { id: string; idCorporativo: string }>;
  /** Data provisória de toda linha — a âncora do cronograma do projeto. */
  ancora: Date;
};

export type LinhaPodada = {
  nome: string;
  /** Nome da disciplina do modelo que o projeto não tem, quando é esse o motivo. */
  motivo: "disciplina_fora_do_projeto" | "pai_podado";
  disciplinaCatalogoId: string | null;
};

export type ResultadoAplicacao = {
  linhas: Prisma.EapTarefaCreateManyInput[];
  dependencias: Prisma.EapDependenciaCreateManyInput[];
  /** Etapas de terceiro: nascem com o recurso "Externo" (decisão #1). */
  atribuicoesExternas: Prisma.EapAtribuicaoCreateManyInput[];
  /**
   * D38 — fases a cadastrar na disciplina DO PROJETO, com o percentual do modelo. Só para disciplina
   * que ainda não tem fase nenhuma: quem já tem fase cadastrada não é tocado (o valor pode já estar
   * repartido, e a primeira liberação fixa se a disciplina paga inteira ou por fase).
   */
  etapasParaCriar: Prisma.DisciplinaEtapaCreateManyInput[];
  /** Disciplinas do projeto que ficam SEM fase — a linha delas perde a fase (o marco não fecha nada). */
  disciplinasSemFase: string[];
  podadas: LinhaPodada[];
  /** Vínculos descartados porque uma das pontas foi podada. */
  vinculosDescartados: number;
};

/** Ids do modelo, em ordem de árvore (pai antes do filho) — é a ordem em que `ordem` faz sentido. */
export function emOrdemDeArvore(linhas: readonly LinhaModelo[]): LinhaModelo[] {
  const filhos = new Map<string | null, LinhaModelo[]>();
  for (const l of linhas) {
    const lista = filhos.get(l.parentId) ?? [];
    lista.push(l);
    filhos.set(l.parentId, lista);
  }
  const saida: LinhaModelo[] = [];
  const descer = (pai: string | null, profundidade: number) => {
    if (profundidade > 20) return; // ciclo em dado gravado: para em vez de travar
    for (const l of (filhos.get(pai) ?? []).sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id))) {
      saida.push(l);
      descer(l.id, profundidade + 1);
    }
  };
  descer(null, 0);
  // Linha cujo pai não existe (dado gravado inconsistente) não pode desaparecer: entra como raiz.
  if (saida.length < linhas.length) {
    const vistos = new Set(saida.map((l) => l.id));
    for (const l of linhas) if (!vistos.has(l.id)) saida.push({ ...l, parentId: null });
  }
  return saida;
}

/**
 * Quais linhas do modelo ficam de fora: as de disciplina que o projeto não tem, e tudo dentro delas.
 * Exportada porque a TELA mostra isto antes de aplicar — "o que este modelo vai criar" é a pergunta
 * que a pessoa faz antes de clicar.
 */
export function podar(
  estrutura: EstruturaModelo,
  disciplinaDoProjeto: ReadonlyMap<string, string>,
): { manter: LinhaModelo[]; podadas: LinhaPodada[] } {
  const ordenadas = emOrdemDeArvore(estrutura.linhas);
  const fora = new Set<string>();
  const podadas: LinhaPodada[] = [];

  for (const l of ordenadas) {
    if (l.parentId != null && fora.has(l.parentId)) {
      fora.add(l.id);
      podadas.push({ nome: l.nome, motivo: "pai_podado", disciplinaCatalogoId: l.disciplinaCatalogoId });
      continue;
    }
    // Só a linha que DEFINE a disciplina (a `disc`) é o galho a podar. Uma folha que herdou a
    // disciplina cai junto pelo pai — e uma folha com disciplina cujo pai não a define (modelo montado
    // de outro jeito) também sai, senão sobraria linha de uma disciplina que o projeto não contratou.
    if (l.disciplinaCatalogoId != null && !disciplinaDoProjeto.has(l.disciplinaCatalogoId)) {
      fora.add(l.id);
      podadas.push({ nome: l.nome, motivo: "disciplina_fora_do_projeto", disciplinaCatalogoId: l.disciplinaCatalogoId });
      continue;
    }
  }

  return { manter: ordenadas.filter((l) => !fora.has(l.id)), podadas };
}

/**
 * O que gravar para aplicar o modelo. `novaLinha` precisa ter id + ID corporativo para CADA linha que
 * sobrar da poda (quem chama reserva os ids depois de `podar`, para não queimar ID corporativo em
 * linha que não vai existir — o contador nunca reaproveita número, D29).
 */
export function aplicarModelo(estrutura: EstruturaModelo, ctx: ContextoAplicacao): ResultadoAplicacao {
  const { manter, podadas } = podar(estrutura, ctx.disciplinaDoProjeto);
  const ids = new Map<string, { id: string; idCorporativo: string }>();
  for (const l of manter) {
    const novo = ctx.novaLinha.get(l.id);
    if (novo) ids.set(l.id, novo);
  }

  // D38 — quais fases cadastrar: por disciplina do projeto que ficou com linha, as fases que essas
  // linhas usam, desde que a disciplina não tenha NENHUMA fase hoje e o modelo tenha o percentual.
  const percentuais = estrutura.percentuaisPorFase ?? {};
  const fasesPorDisciplina = new Map<string, Set<string>>();
  for (const l of manter) {
    if (!l.disciplinaCatalogoId || !l.etapaId) continue;
    const disciplinaId = ctx.disciplinaDoProjeto.get(l.disciplinaCatalogoId);
    if (!disciplinaId) continue;
    const jaTem = ctx.fasesDaDisciplina.get(disciplinaId);
    if (jaTem && jaTem.size > 0) continue;
    if (!(l.etapaId in percentuais)) continue;
    const s = fasesPorDisciplina.get(disciplinaId) ?? new Set<string>();
    s.add(l.etapaId);
    fasesPorDisciplina.set(disciplinaId, s);
  }

  const etapasParaCriar: Prisma.DisciplinaEtapaCreateManyInput[] = [];
  const criando = new Map<string, Set<string>>();
  if (ctx.cadastrarFases) {
    for (const [disciplinaId, fases] of fasesPorDisciplina) {
      // Ordem pela ordem em que a fase aparece no modelo (Básico antes de Executivo, como no arquivo).
      const ordemNoModelo = manter.filter((l) => l.etapaId && fases.has(l.etapaId)).map((l) => l.etapaId!);
      const unicas = [...new Set(ordemNoModelo)];
      unicas.forEach((etapaId, i) => {
        etapasParaCriar.push({ disciplinaId, etapaId, percentual: percentuais[etapaId], ordem: i });
      });
      criando.set(disciplinaId, new Set(unicas));
    }
  }

  const temFase = (disciplinaId: string, etapaId: string) =>
    ctx.fasesDaDisciplina.get(disciplinaId)?.has(etapaId) === true || criando.get(disciplinaId)?.has(etapaId) === true;

  // Ordem por irmão, recontada depois da poda: um galho que saiu no meio deixaria buracos, e a ordem
  // é o que o `calcularCodigos` usa para escrever 1.1, 1.2…
  const ordemPorPai = new Map<string | null, number>();
  const linhas: Prisma.EapTarefaCreateManyInput[] = [];
  const atribuicoesExternas: Prisma.EapAtribuicaoCreateManyInput[] = [];

  for (const l of manter) {
    const novo = ids.get(l.id);
    if (!novo) continue; // sem id reservado: quem chama errou; melhor faltar linha que gravar sem identidade
    const paiId = l.parentId != null ? (ids.get(l.parentId)?.id ?? null) : null;
    const chavePai = paiId;
    const ordem = ordemPorPai.get(chavePai) ?? 0;
    ordemPorPai.set(chavePai, ordem + 1);

    const disciplinaId = l.disciplinaCatalogoId ? (ctx.disciplinaDoProjeto.get(l.disciplinaCatalogoId) ?? null) : null;
    const etapaId = disciplinaId && l.etapaId && temFase(disciplinaId, l.etapaId) ? l.etapaId : null;

    linhas.push({
      id: novo.id,
      idCorporativo: novo.idCorporativo,
      projetoId: ctx.projetoId,
      parentId: paiId,
      disciplinaId,
      etapaId,
      nome: l.nome,
      ordem,
      tipoEap: l.tipoEap,
      duracaoDias: l.tipoEap === "mrc" ? 0 : l.duracaoDias,
      progresso: 0,
      // Provisórias: o motor recalcula tudo no reagendamento que vem logo depois.
      inicioPrevisto: ctx.ancora,
      fimPrevisto: ctx.ancora,
    });

    if (l.deTerceiro && (l.tipoEap === "atv" || l.tipoEap === "mrc")) {
      atribuicoesExternas.push({ tarefaId: novo.id, papel: "ext", horasPrevistas: 0 });
    }
  }

  const dependencias: Prisma.EapDependenciaCreateManyInput[] = [];
  let vinculosDescartados = 0;
  for (const l of manter) {
    const alvo = ids.get(l.id);
    for (const v of l.predecessoras) {
      const pred = ids.get(v.id);
      if (!alvo || !pred || pred.id === alvo.id) {
        vinculosDescartados++;
        continue;
      }
      dependencias.push({ tarefaId: alvo.id, predecessoraId: pred.id, tipo: v.tipo, lagDias: v.lagDias });
    }
  }

  // Disciplina que ficou com linha mas sem fase nenhuma: a linha dela perde a fase, e o marco dessa
  // disciplina não vai marcar fase como Entregue. Quem chama mostra isso ANTES de aplicar.
  const disciplinasSemFase = [
    ...new Set(
      linhas
        .filter((l) => l.disciplinaId && !l.etapaId)
        .map((l) => l.disciplinaId as string)
        .filter((disciplinaId) => (ctx.fasesDaDisciplina.get(disciplinaId)?.size ?? 0) === 0 && !criando.has(disciplinaId)),
    ),
  ];

  return { linhas, dependencias, atribuicoesExternas, etapasParaCriar, disciplinasSemFase, podadas, vinculosDescartados };
}
