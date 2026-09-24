/**
 * Verificador de qualidade do cronograma (Doc 03 §33).
 *
 * PURO: sem I/O. Recebe as linhas, o resultado do motor e a Data de Status, e devolve os
 * achados. É o que impede um cronograma mal montado de virar relatório bonito e errado.
 *
 * Todas as regras são OBJETIVAS de propósito — "marco com duração diferente de zero" ou
 * "concluída sem término real" são verdade ou mentira, sem calibração. É por isso que ele
 * entra oficial desde já, enquanto a Saúde do Cronograma (`saude.ts`), que PONDERA estes
 * achados, nasce marcada como provisória.
 *
 * A distinção entre ATRASADA e NÃO APURADA é o motivo de a Data de Status existir (Doc 03
 * §21 e §26): sem ela, linha que ninguém atualizou há três semanas apareceria como
 * atrasada, e as duas coisas pedem ações opostas — uma é replanejar, a outra é ligar para
 * o coordenador.
 */
import type { Dia } from "@/lib/calendario-trabalho";

export type Severidade = "erro" | "alerta" | "info";

/** Chave estável da regra. NUNCA renomear: a Saúde e os filtros da tela referenciam isto. */
export type RegraQualidade =
  | "sem_responsavel"
  | "sem_duracao"
  | "sem_predecessora"
  | "sem_sucessora"
  | "atrasada"
  | "critica_atrasada"
  | "bloqueada"
  | "duracao_excessiva"
  | "marco_com_duracao"
  | "vinculo_circular"
  | "concluida_sem_termino_real"
  | "iniciada_sem_inicio_real"
  | "futura_com_avanco"
  | "excesso_de_restricoes"
  | "sem_data_status";

export type Achado = {
  regra: RegraQualidade;
  severidade: Severidade;
  /** `null` quando o achado é do cronograma inteiro, não de uma linha. */
  tarefaId: string | null;
  mensagem: string;
};

export type LinhaQualidade = {
  id: string;
  nome: string;
  /** `atv` e `mrc` são as que o verificador cobra; resumo e agrupadores são poupados. */
  tipoEap: "prj" | "fas" | "pct" | "disc" | "loc" | "sis" | "res" | "atv" | "mrc";
  duracaoDias: number;
  status: "nin" | "and" | "agu" | "blq" | "rev" | "apr" | "con" | "sus" | "can" | "arq";
  progresso: number;
  inicioPrevisto: Dia;
  fimPrevisto: Dia;
  inicioReal: Dia | null;
  fimReal: Dia | null;
  temResponsavel: boolean;
  temRestricao: boolean;
  temPredecessora: boolean;
  temSucessora: boolean;
  ehResumo: boolean;
  critica: boolean;
};

export type EntradaQualidade = {
  linhas: LinhaQualidade[];
  /** Data de corte da análise. `null` = cronograma nunca apurado. */
  dataStatus: Dia | null;
  ciclos: { tarefaId: string; predecessoraId: string }[];
};

/**
 * Duração a partir da qual uma atividade vira alerta.
 *
 * O Doc 03 §10 pede granularidade que permita gestão: "Fazer projeto elétrico — 30 dias"
 * é o exemplo do que evitar. 20 dias úteis é um mês de trabalho — acima disso a linha
 * deixa de responder "o que está pronto?" entre uma reunião e outra.
 */
const DURACAO_EXCESSIVA = 20;

/**
 * Proporção de linhas com restrição a partir da qual o cronograma perde a capacidade de
 * recalcular (Doc 03 §17). Não é o número absoluto: 3 restrições em 10 linhas é rigidez,
 * 3 em 200 é normal.
 */
const LIMITE_RESTRICOES = 0.2;

/** Só atividade e marco são cobrados. Resumo deriva dos filhos e não tem vida própria. */
const executavel = (l: LinhaQualidade) => !l.ehResumo && (l.tipoEap === "atv" || l.tipoEap === "mrc");

export function verificarCronograma(entrada: EntradaQualidade): Achado[] {
  const { linhas, dataStatus, ciclos } = entrada;
  const achados: Achado[] = [];
  const add = (
    regra: RegraQualidade,
    severidade: Severidade,
    tarefaId: string | null,
    mensagem: string,
  ) => achados.push({ regra, severidade, tarefaId, mensagem });

  if (linhas.length === 0) return achados;

  if (!dataStatus) {
    add(
      "sem_data_status",
      "alerta",
      null,
      "Cronograma sem Data de Status: não dá para separar o que está atrasado do que só não foi apurado.",
    );
  }

  for (const c of ciclos) {
    add(
      "vinculo_circular",
      "erro",
      c.tarefaId,
      "Dependência circular: o vínculo foi ignorado pelo motor para o cronograma continuar calculável.",
    );
  }

  const comRestricao = linhas.filter((l) => l.temRestricao).length;
  if (linhas.length >= 5 && comRestricao / linhas.length > LIMITE_RESTRICOES) {
    add(
      "excesso_de_restricoes",
      "alerta",
      null,
      `${comRestricao} de ${linhas.length} linhas têm data fixada. ` +
        "Restrição demais tira do cronograma a capacidade de recalcular impacto sozinho.",
    );
  }

  for (const l of linhas) {
    // ── Regras que valem para QUALQUER linha ──────────────────────────────
    if (l.tipoEap === "mrc" && l.duracaoDias !== 0) {
      add("marco_com_duracao", "erro", l.id, `"${l.nome}" é marco mas tem duração ${l.duracaoDias}. Marco tem duração 0.`);
    }

    if (l.status === "con" && !l.fimReal) {
      add(
        "concluida_sem_termino_real",
        "erro",
        l.id,
        `"${l.nome}" está concluída sem data de término real — o realizado fica sem prova.`,
      );
    }

    if ((l.status === "and" || l.status === "con") && !l.inicioReal) {
      add(
        "iniciada_sem_inicio_real",
        "alerta",
        l.id,
        `"${l.nome}" está em andamento sem data de início real.`,
      );
    }

    if (l.status === "blq") {
      add("bloqueada", "alerta", l.id, `"${l.nome}" está bloqueada.`);
    }

    // ── Regras só para o que é executável ─────────────────────────────────
    if (!executavel(l)) continue;

    if (!l.temResponsavel) {
      add("sem_responsavel", "alerta", l.id, `"${l.nome}" não tem responsável.`);
    }

    if (l.tipoEap === "atv" && l.duracaoDias <= 0) {
      add("sem_duracao", "erro", l.id, `"${l.nome}" é atividade e está sem duração.`);
    }

    if (l.tipoEap === "atv" && l.duracaoDias > DURACAO_EXCESSIVA) {
      add(
        "duracao_excessiva",
        "alerta",
        l.id,
        `"${l.nome}" dura ${l.duracaoDias} dias. Acima de ${DURACAO_EXCESSIVA} a linha deixa de permitir acompanhamento.`,
      );
    }

    if (!l.temPredecessora) {
      add(
        "sem_predecessora",
        "info",
        l.id,
        `"${l.nome}" não depende de nada: fica presa à data de início do projeto.`,
      );
    }

    if (!l.temSucessora) {
      add(
        "sem_sucessora",
        "info",
        l.id,
        `"${l.nome}" não alimenta nada: atrasar não move o projeto, e isso costuma ser um vínculo esquecido.`,
      );
    }

    // ── Regras que dependem da Data de Status ─────────────────────────────
    if (!dataStatus) continue;

    // ATRASADA (Doc 03 §26): já passou do término planejado e não está concluída.
    const encerrada = l.status === "con" || l.status === "can" || l.status === "arq";
    if (!encerrada && l.fimPrevisto < dataStatus && l.progresso < 100) {
      const regra = l.critica ? "critica_atrasada" : "atrasada";
      add(
        regra,
        l.critica ? "erro" : "alerta",
        l.id,
        `"${l.nome}" deveria ter terminado em ${l.fimPrevisto} e está com ${l.progresso}%` +
          (l.critica ? " — e está no caminho crítico, então o atraso é do projeto inteiro." : "."),
      );
    }

    // Avanço informado em linha que nem começou: o número não pode ter vindo de lugar nenhum.
    if (l.inicioPrevisto > dataStatus && l.progresso > 0) {
      add(
        "futura_com_avanco",
        "erro",
        l.id,
        `"${l.nome}" só começa em ${l.inicioPrevisto} e já tem ${l.progresso}% informado.`,
      );
    }
  }

  return achados;
}

/** Quantos achados de cada severidade — o resumo que a tela mostra no topo. */
export function contarPorSeveridade(achados: Achado[]): Record<Severidade, number> {
  return achados.reduce(
    (acc, a) => {
      acc[a.severidade]++;
      return acc;
    },
    { erro: 0, alerta: 0, info: 0 } as Record<Severidade, number>,
  );
}

/** Agrupa por regra, para a tela listar "12 linhas sem responsável" em vez de 12 linhas. */
export function agruparPorRegra(achados: Achado[]): Map<RegraQualidade, Achado[]> {
  const mapa = new Map<RegraQualidade, Achado[]>();
  for (const a of achados) {
    const lista = mapa.get(a.regra);
    if (lista) lista.push(a);
    else mapa.set(a.regra, [a]);
  }
  return mapa;
}
