/**
 * Impacto de uma ausência aprovada na carteira (Gestão de Pessoas F1.5).
 *
 * Quando o RH aprova férias ou um abono, a coordenação precisa saber se a pessoa estava
 * alocada no período — para revisar a alocação ANTES da semana chegar. Esta regra só
 * descreve o conflito: nunca altera alocação (D5 do spec: o sistema recomenda, o
 * responsável confirma).
 *
 * PURO. Datas são `YYYY-MM-DD`, limites inclusivos. As duas fontes de carga são as mesmas
 * de `cargaDaEquipe` (D17): alocação DIGITADA nos projetos sem cronograma aprovado e horas
 * das linhas nos aprovados — quem chama já separou uma da outra.
 */

export type Dia = string;
export type Periodo = { inicio: Dia; fim: Dia };

export type TipoAusencia = "ferias" | "ausencia";

/**
 * O pedaço da ausência que ainda importa para o planejamento: de hoje em diante. Ausência
 * que já terminou não tem o que revisar (`null`) — o RH lança férias passadas para acertar
 * o ponto, e isso não pode virar aviso de carteira.
 */
export function janelaDeImpacto(ausencia: Periodo, hoje: Dia): Periodo | null {
  if (ausencia.fim < ausencia.inicio || ausencia.fim < hoje) return null;
  return { inicio: ausencia.inicio > hoje ? ausencia.inicio : hoje, fim: ausencia.fim };
}

export type AlocacaoDigitada = { projetoId: string; percentual: number; inicio: Dia | null; fim: Dia | null };

/** Horas planejadas da pessoa num projeto aprovado, já distribuídas por dia útil. */
export type HorasPlanejadas = { projetoId: string; porDia: ReadonlyMap<Dia, number> };

export type ImpactoProjeto = {
  projetoId: string;
  /** Soma do % digitado que vale dentro da janela (0 quando o projeto só tem cronograma). */
  percentual: number;
  /** Horas do cronograma dentro da janela, 1 casa decimal (0 quando só há alocação digitada). */
  horas: number;
  /** Trecho da janela em que o projeto conta com a pessoa. */
  inicio: Dia;
  fim: Dia;
};

/**
 * Projetos que contavam com a pessoa dentro da janela. Alocação sem início vale "desde
 * sempre" e sem fim vale "até quando durar" — a mesma leitura de `diaEstaNaFaixa`.
 */
export function impactoDaAusencia(
  janela: Periodo,
  alocacoes: readonly AlocacaoDigitada[],
  horas: readonly HorasPlanejadas[],
): ImpactoProjeto[] {
  const porProjeto = new Map<string, ImpactoProjeto>();
  const juntar = (projetoId: string, parte: Omit<ImpactoProjeto, "projetoId">) => {
    const atual = porProjeto.get(projetoId);
    if (!atual) {
      porProjeto.set(projetoId, { projetoId, ...parte });
      return;
    }
    atual.percentual += parte.percentual;
    atual.horas += parte.horas;
    if (parte.inicio < atual.inicio) atual.inicio = parte.inicio;
    if (parte.fim > atual.fim) atual.fim = parte.fim;
  };

  for (const a of alocacoes) {
    if (!(a.percentual > 0)) continue;
    const inicio = a.inicio && a.inicio > janela.inicio ? a.inicio : janela.inicio;
    const fim = a.fim && a.fim < janela.fim ? a.fim : janela.fim;
    if (inicio > fim) continue;
    juntar(a.projetoId, { percentual: a.percentual, horas: 0, inicio, fim });
  }

  for (const h of horas) {
    let soma = 0;
    let inicio: Dia | null = null;
    let fim: Dia | null = null;
    for (const [dia, valor] of h.porDia) {
      if (dia < janela.inicio || dia > janela.fim || !(valor > 0)) continue;
      soma += valor;
      if (inicio == null || dia < inicio) inicio = dia;
      if (fim == null || dia > fim) fim = dia;
    }
    if (inicio == null || fim == null) continue;
    juntar(h.projetoId, { percentual: 0, horas: soma, inicio, fim });
  }

  return [...porProjeto.values()]
    .map((p) => ({ ...p, horas: Math.round(p.horas * 10) / 10 }))
    .filter((p) => p.percentual > 0 || p.horas > 0)
    .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.projetoId.localeCompare(b.projetoId));
}

const dataBr = (dia: Dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;

/**
 * Título e corpo do aviso. Abono sai como "ausência", sem o motivo: o motivo pode ser
 * atestado, e a coordenação só precisa saber que a pessoa não estará lá.
 */
export function textoDoImpacto(dados: {
  nome: string;
  tipo: TipoAusencia;
  janela: Periodo;
  projetos: readonly { codigo: string; percentual: number; horas: number }[];
}): { titulo: string; corpo: string } {
  const oque = dados.tipo === "ferias" ? "Férias" : "Ausência";
  const periodo =
    dados.janela.inicio === dados.janela.fim
      ? `em ${dataBr(dados.janela.inicio)}`
      : `de ${dataBr(dados.janela.inicio)} a ${dataBr(dados.janela.fim)}`;
  const itens = dados.projetos.map((p) => {
    const partes = [p.percentual > 0 ? `${p.percentual}%` : null, p.horas > 0 ? `${String(p.horas).replace(".", ",")} h no cronograma` : null]
      .filter(Boolean)
      .join(" + ");
    return `${p.codigo} (${partes})`;
  });
  const ferias = dados.tipo === "ferias";
  return {
    titulo: `${ferias ? "Férias afetam" : "Ausência afeta"} alocação: ${dados.nome}`,
    corpo: `${oque} de ${dados.nome} ${ferias ? "aprovadas" : "aprovada"} ${periodo}. No período há alocação em ${itens.join(", ")}. Revise a alocação em Recursos — nada foi alterado automaticamente.`,
  };
}
