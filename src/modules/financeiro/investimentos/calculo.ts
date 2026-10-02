/**
 * Carteira de investimentos (M4). Puro, sem I/O, dinheiro em centavos e datas `YYYY-MM-DD`.
 *
 * Os movimentos de um ativo NÃO têm tabela: são os lançamentos realizados da conta do ativo, e o tipo é lido deles
 * (spec §1). Perna de transferência que entra = aporte, que sai = resgate; receita comum = rendimento; despesa comum =
 * imposto (IR/IOF). O valor atual é o saldo da conta.
 */

export type TipoDeMovimento = "aporte" | "resgate" | "rendimento" | "imposto";

export type LancamentoDoAtivo = {
  id: string;
  tipo: "receita" | "despesa";
  /** Centavos, o realizado (`valorEfetivo ?? valor`). */
  valor: number;
  data: string;
  /** Perna de transferência (aporte/resgate). */
  transferenciaId: string | null;
  descricao: string;
};

export type MovimentoDoAtivo = LancamentoDoAtivo & { movimento: TipoDeMovimento; efeito: number };

export function tipoDoMovimento(l: Pick<LancamentoDoAtivo, "tipo" | "transferenciaId">): TipoDeMovimento {
  if (l.transferenciaId) return l.tipo === "receita" ? "aporte" : "resgate";
  return l.tipo === "receita" ? "rendimento" : "imposto";
}

export function movimentosDoAtivo(ls: readonly LancamentoDoAtivo[]): MovimentoDoAtivo[] {
  return [...ls]
    .sort((a, b) => (a.data === b.data ? a.id.localeCompare(b.id) : a.data.localeCompare(b.data)))
    .map((l) => ({ ...l, movimento: tipoDoMovimento(l), efeito: l.tipo === "receita" ? l.valor : -l.valor }));
}

export type PosicaoDoAtivo = {
  /** Σ aportes − Σ resgates: o que a empresa pôs e ainda não tirou. */
  aplicado: number;
  rendimentoBruto: number;
  impostos: number;
  /** Saldo da conta do ativo = aplicado + rendimento − impostos. */
  valorAtual: number;
  /** Valor atual − aplicado (líquido de IR). */
  rendimentoLiquido: number;
  /** Data do primeiro aporte (conta o prazo do IR). */
  primeiroAporte: string | null;
};

export function posicaoDoAtivo(ls: readonly LancamentoDoAtivo[]): PosicaoDoAtivo {
  let aportes = 0;
  let resgates = 0;
  let rendimento = 0;
  let impostos = 0;
  let primeiro: string | null = null;
  for (const m of movimentosDoAtivo(ls)) {
    if (m.movimento === "aporte") {
      aportes += m.valor;
      if (!primeiro || m.data < primeiro) primeiro = m.data;
    } else if (m.movimento === "resgate") resgates += m.valor;
    else if (m.movimento === "rendimento") rendimento += m.valor;
    else impostos += m.valor;
  }
  const aplicado = aportes - resgates;
  const valorAtual = aplicado + rendimento - impostos;
  return { aplicado, rendimentoBruto: rendimento, impostos, valorAtual, rendimentoLiquido: valorAtual - aplicado, primeiroAporte: primeiro };
}

const MS_DIA = 86_400_000;
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / MS_DIA);
}

/** Tabela regressiva do IR sobre renda fixa, em pontos-base (2250 = 22,5%). */
export function aliquotaIR(dias: number): number {
  if (dias <= 180) return 2250;
  if (dias <= 360) return 2000;
  if (dias <= 720) return 1750;
  return 1500;
}

export function faixaDoIR(dias: number): string {
  if (dias <= 180) return "22,5% (até 180 dias)";
  if (dias <= 360) return "20% (181 a 360 dias)";
  if (dias <= 720) return "17,5% (361 a 720 dias)";
  return "15% (mais de 720 dias)";
}

export type SugestaoDeRendimento = {
  /** Rendimento do período: bruto informado − bruto que o sistema já tinha. */
  rendimento: number;
  /** IR a provisionar agora (o devido sobre todo o rendimento, menos o já provisionado). */
  ir: number;
  aliquotaBp: number;
  dias: number;
};

export const MOTIVO_BRUTO_MENOR =
  "O valor informado é menor que o que o sistema já tem para este ativo. Se houve perda, ela entra no resgate.";
export const MOTIVO_SEM_APORTE = "Este ativo ainda não tem aporte: aporte antes de registrar rendimento.";

/**
 * A pessoa informa o VALOR BRUTO ATUAL que o banco mostra. O bruto do sistema é o saldo + o IR já provisionado
 * (o IR desconta o saldo, não o bruto). O IR sugerido é o devido sobre TODO o rendimento acumulado, pela alíquota do
 * prazo desde o primeiro aporte, menos o que já foi provisionado; isento sugere zero.
 */
export function sugerirRendimento(
  p: PosicaoDoAtivo,
  o: { brutoInformado: number; data: string; isentoIR: boolean },
): SugestaoDeRendimento | { erro: string } {
  if (!p.primeiroAporte) return { erro: MOTIVO_SEM_APORTE };
  const brutoDoSistema = p.valorAtual + p.impostos;
  const rendimento = o.brutoInformado - brutoDoSistema;
  if (rendimento < 0) return { erro: MOTIVO_BRUTO_MENOR };
  const dias = Math.max(0, diasEntre(p.primeiroAporte, o.data));
  const aliquotaBp = aliquotaIR(dias);
  if (o.isentoIR) return { rendimento, ir: 0, aliquotaBp: 0, dias };
  const devido = Math.round(((p.rendimentoBruto + rendimento) * aliquotaBp) / 10_000);
  return { rendimento, ir: Math.max(0, devido - p.impostos), aliquotaBp, dias };
}

export type PlanoDeResgate = {
  /** Diferença entre o que caiu na conta e o valor atual, gravada antes da transferência. */
  ajuste: { tipo: "rendimento" | "imposto"; valor: number } | null;
  transferencia: number;
  /** Resgate total: zera o ativo e arquiva. */
  total: boolean;
};

export const MOTIVO_RESGATE_MAIOR = "O resgate parcial não pode ser maior que o valor atual do ativo. Para tirar tudo, marque resgate total.";
export const MOTIVO_RESGATE_ZERO = "Informe quanto caiu na conta.";

/**
 * Resgate total: o que caiu na conta manda — a diferença para o valor atual vira rendimento (a mais) ou imposto (a
 * menos) e o ativo zera. Parcial: só a transferência, que não pode passar do valor atual.
 */
export function planejarResgate(p: PosicaoDoAtivo, o: { valorRecebido: number; total: boolean }): PlanoDeResgate | { erro: string } {
  if (!(o.valorRecebido > 0)) return { erro: MOTIVO_RESGATE_ZERO };
  if (!o.total) {
    if (o.valorRecebido > p.valorAtual) return { erro: MOTIVO_RESGATE_MAIOR };
    return { ajuste: null, transferencia: o.valorRecebido, total: false };
  }
  const diff = o.valorRecebido - p.valorAtual;
  return {
    ajuste: diff === 0 ? null : { tipo: diff > 0 ? "rendimento" : "imposto", valor: Math.abs(diff) },
    transferencia: o.valorRecebido,
    total: true,
  };
}

export type LiquidezDoAtivo = "diaria" | "d1" | "vencimento" | "outra";

/** "Disponível em até 1 dia" do mock: D+0 e D+1. */
export const liquidezImediata = (l: LiquidezDoAtivo) => l === "diaria" || l === "d1";

export const ROTULO_LIQUIDEZ: Record<LiquidezDoAtivo, string> = {
  diaria: "D+0",
  d1: "1 dia útil",
  vencimento: "No vencimento",
  outra: "Outra",
};

export const MOTIVO_EXCLUIR_COM_MOVIMENTO = "Tem movimentos: resgate tudo e arquive.";
export const MOTIVO_ARQUIVAR_COM_SALDO = "Ainda tem valor aplicado: resgate tudo antes de arquivar.";
export const MOTIVO_ARQUIVADO = "Este ativo está arquivado.";

export function motivoParaNaoExcluir(movimentos: number): string | null {
  return movimentos > 0 ? MOTIVO_EXCLUIR_COM_MOVIMENTO : null;
}

export function motivoParaNaoArquivar(p: Pick<PosicaoDoAtivo, "valorAtual">): string | null {
  return p.valorAtual !== 0 ? MOTIVO_ARQUIVAR_COM_SALDO : null;
}

/** O vencimento entra no planejador como entrada prevista (spec §4)? Só "no vencimento", dentro do horizonte, com valor. */
export function entraNoPlanejador(a: { liquidez: LiquidezDoAtivo; vencimento: string | null; arquivado: boolean }, valorAtual: number, hoje: string, fim: string): boolean {
  return !a.arquivado && a.liquidez === "vencimento" && a.vencimento != null && a.vencimento >= hoje && a.vencimento <= fim && valorAtual > 0;
}

export const MOTIVO_DATA_DO_VENCIMENTO = "É o vencimento da aplicação: a data muda no cadastro do ativo.";
