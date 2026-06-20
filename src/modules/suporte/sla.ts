import { differenceInBusinessDays, formatDistanceStrict } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Status considerados "encerrados" para fins de SLA (sem mais espera). */
const STATUS_ENCERRADOS = new Set(["resolvido"]);

/** Limite (em dias úteis) a partir do qual um ticket aberto vira alerta. */
export const SLA_ALERTA_DIAS_UTEIS = 3;

export type SlaInfo = {
  /** true se o ticket ainda está em aberto/atendimento. */
  emAberto: boolean;
  /** Rótulo curto p/ exibir (ex.: "aberto há 3 dias" ou "resolvido em 2 dias"). */
  rotulo: string;
  /** true quando aberto há mais que o limite de dias úteis (cor de alerta). */
  alerta: boolean;
};

/**
 * Deriva o SLA de um ticket apenas de createdAt / updatedAt / status — sem
 * campo dedicado no schema.
 *
 * - Em aberto: tempo decorrido desde a abertura (createdAt → agora).
 * - Encerrado: tempo até a resolução (createdAt → updatedAt, que é a última
 *   alteração de status registrada pelo Prisma @updatedAt).
 */
export function calcularSla(
  criadoEm: string | Date,
  atualizadoEm: string | Date,
  status: string,
  agora: Date = new Date(),
): SlaInfo {
  const criado = typeof criadoEm === "string" ? new Date(criadoEm) : criadoEm;
  const encerrado = STATUS_ENCERRADOS.has(status);

  if (encerrado) {
    const fim = typeof atualizadoEm === "string" ? new Date(atualizadoEm) : atualizadoEm;
    const dur = formatDistanceStrict(criado, fim, { locale: ptBR });
    return { emAberto: false, rotulo: `resolvido em ${dur}`, alerta: false };
  }

  const decorrido = formatDistanceStrict(criado, agora, { locale: ptBR, addSuffix: false });
  const diasUteis = differenceInBusinessDays(agora, criado);
  return {
    emAberto: true,
    rotulo: `aberto há ${decorrido}`,
    alerta: diasUteis > SLA_ALERTA_DIAS_UTEIS,
  };
}
