/**
 * Dias até um vencimento e a gravidade disso — puro, espelhando `lib/aging.ts`.
 *
 * `aging.ts` classifica o que JÁ venceu (dias de atraso, faixas de cobrança). Este classifica o
 * que ainda VAI vencer, que é a pergunta de contrato, certidão e prazo legal de RH.
 *
 * ## O que este módulo unifica — e o que deliberadamente NÃO unifica
 *
 * Unifica o cálculo "faltam quantos dias, e isso é grave?", que estava inline em cada tela (o
 * badge de contrato tinha o seu `new Date(x) < new Date()` solto).
 *
 * NÃO unifica a ESTRATÉGIA DE DISPARO dos alertas, que é diferente por bom motivo:
 * `alertaCertidoes` dispara em dia exato (30/15/7, via `diaAlvo`) e pode avisar três vezes;
 * `alertaContratosEquipeVencendo` usa janela + marca de compare-and-swap e avisa uma vez só.
 * Forçar as duas no mesmo formato mudaria o comportamento de um alerta que funciona, sem ganho.
 */

/** Milissegundos num dia. */
const MS_DIA = 86_400_000;

export type SituacaoVencimento =
  /** Data já passou. */
  | "vencido"
  /** Vence em até 7 dias. */
  | "critico"
  /** Vence em até 30 dias. */
  | "atencao"
  /** Mais de 30 dias — nada a fazer agora. */
  | "ok";

export const SITUACAO_LABEL: Record<SituacaoVencimento, string> = {
  vencido: "Vencido",
  critico: "Vence em breve",
  atencao: "Vence em menos de um mês",
  ok: "Em dia",
};

/** Tom do `StatusBadge`/`IndicadorCritico` — mantém a cor consistente onde quer que apareça. */
export const SITUACAO_TONE: Record<SituacaoVencimento, "danger" | "warning" | "success"> = {
  vencido: "danger",
  critico: "danger",
  atencao: "warning",
  ok: "success",
};

export const DIAS_CRITICO = 7;
export const DIAS_ATENCAO = 30;

/**
 * Dias inteiros até a data. Negativo = já venceu; 0 = vence hoje.
 *
 * Compara por DIA CIVIL, não por instante: um vencimento hoje às 00:00 e "agora" às 14:00 são o
 * mesmo dia e devem dar 0, não -1. Sem isso, todo `@db.Date` (que chega meia-noite UTC) apareceria
 * como vencido a partir do meio-dia.
 */
export function diasAteVencimento(vencimento: Date, hoje: Date = new Date()): number {
  const a = Date.UTC(vencimento.getUTCFullYear(), vencimento.getUTCMonth(), vencimento.getUTCDate());
  const b = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return Math.round((a - b) / MS_DIA);
}

/** Gravidade do vencimento. `null` (sem data) devolve `ok`: sem prazo não há o que cobrar. */
export function situacaoVencimento(vencimento: Date | null, hoje: Date = new Date()): SituacaoVencimento {
  if (!vencimento) return "ok";
  const dias = diasAteVencimento(vencimento, hoje);
  if (dias < 0) return "vencido";
  if (dias <= DIAS_CRITICO) return "critico";
  if (dias <= DIAS_ATENCAO) return "atencao";
  return "ok";
}

/** Está dentro da janela de aviso de `dias`? Vencido também está — continua exigindo ação. */
export function dentroDaJanela(vencimento: Date | null, dias: number, hoje: Date = new Date()): boolean {
  if (!vencimento) return false;
  return diasAteVencimento(vencimento, hoje) <= dias;
}

/** Texto curto pt-BR: "vence em 12 dias", "vence hoje", "vencido há 3 dias". */
export function rotuloVencimento(vencimento: Date | null, hoje: Date = new Date()): string {
  if (!vencimento) return "sem prazo";
  const dias = diasAteVencimento(vencimento, hoje);
  if (dias === 0) return "vence hoje";
  if (dias < 0) {
    const n = Math.abs(dias);
    return `vencido há ${n} ${n === 1 ? "dia" : "dias"}`;
  }
  return `vence em ${dias} ${dias === 1 ? "dia" : "dias"}`;
}
