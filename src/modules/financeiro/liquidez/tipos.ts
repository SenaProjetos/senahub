/**
 * Tipos do planejador de caixa (motor de liquidez). Puro: sem Prisma, sem Next.
 * Contrato: docs/superpowers/specs/2026-09-30-planejador-financeiro.md.
 *
 * Convenções: datas são `YYYY-MM-DD` em string (nunca `Date`), valores são centavos inteiros e
 * sempre positivos — o sentido vem de `tipo`.
 */

/** Data-calendário `YYYY-MM-DD`. */
export type DataIso = string;
/** Valor em centavos inteiros. */
export type Centavos = number;

export type Prioridade = "p1" | "p2" | "p3" | "p4";
/** Confiança numa entrada PENDENTE (ADR-0007). Não é status: nada aqui diz que o dinheiro entrou. */
export type Confianca = "confirmada_cliente" | "provavel" | "estimada" | "incerta";
/** Natureza da categoria (ADR-0008). */
export type Natureza = "resultado" | "fora_do_resultado" | "transferencia";
export type TipoMovimento = "receita" | "despesa";

/** Status do lançamento. `confirmado` = realizado (dinheiro já se moveu). */
export type StatusLancamento = "previsto" | "aguardando_aprovacao" | "confirmado" | "cancelado" | "previsao";
/** Os status que o motor projeta. */
export type StatusPendente = "previsto" | "aguardando_aprovacao" | "previsao";

/** Outra perna viva (não cancelada, não excluída) de uma transferência. */
export type Contraparte = { id: string; realizada: boolean; data: DataIso };

/** Lançamento como chega da consulta: valores já em centavos, datas já em string. */
export type LancamentoEntrada = {
  id: string;
  tipo: TipoMovimento;
  status: StatusLancamento;
  /** Excluído logicamente (`excluidoEm`); a consulta já filtra, o motor confere de novo. */
  excluido?: boolean;
  valor: Centavos;
  data: DataIso;
  vencimento: DataIso | null;
  descricao: string;
  favorecido?: string | null;
  projeto?: string | null;
  prioridade: Prioridade | null;
  confianca: Confianca | null;
  categoria: {
    natureza: Natureza;
    prioridadePadrao: Prioridade | null;
    prioridadePadraoPai: Prioridade | null;
  };
  caixinhaId?: string | null;
  /** Lançamento da taxa (ou reembolso) de uma ART: a data é regravada pelo sync da ART. */
  ehTaxaArt?: boolean;
  /** Só em categoria de natureza `transferencia`. */
  transferencia?: { id: string | null; contrapartes: Contraparte[] } | null;
};

export type OrigemEvento = "lancamento" | "programado" | "simulado";

/** Um movimento pendente, pronto para o motor. */
export type EventoCaixa = {
  id: string;
  origem: OrigemEvento;
  tipo: TipoMovimento;
  natureza: Natureza;
  valor: Centavos;
  /** `vencimento ?? data`. */
  data: DataIso;
  /** `data < hoje`: vai para o grupo Vencidos e, se incluído, é aplicado no início de hoje. */
  vencido: boolean;
  descricao: string;
  favorecido: string | null;
  projeto: string | null;
  status: StatusPendente | null;
  /** Efetiva (só despesa). */
  prioridade: Prioridade | null;
  /** Efetiva (só receita). */
  confianca: Confianca | null;
  caixinhaId: string | null;
  /** Motivo quando a data não pode ser reprogramada; `null` = programável. */
  naoProgramavel: string | null;
  transferencia: { id: string | null; contrapartes: Contraparte[] } | null;
};
