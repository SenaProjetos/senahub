/**
 * Regras puras do desligamento: quando o vínculo acaba e quando o login cai.
 *
 * As duas datas são DIA-CALENDÁRIO inclusivo, gravadas como meia-noite UTC (`@db.Date`):
 * - `Vinculo.dataFim` = último dia trabalhado — a pessoa ainda bate ponto nele;
 * - `User.acessoAte` = último dia com login — ela ainda entra no sistema nele.
 * Nos dois casos o efeito vale a partir do dia SEGUINTE. A comparação é contra
 * `inicioDoDiaUtc(agora)` pela mesma razão de `lib/data.ts`: meia-noite local (03:00Z) faria a
 * data de hoje contar como vencida.
 */
import { inicioDoDiaUtc } from "@/lib/data";

/** O dia informado (inclusivo) já passou? `null` = nunca passa. */
export function diaEncerrado(dia: Date | null | undefined, agora: Date = new Date()): boolean {
  if (!dia) return false;
  return dia.getTime() < inicioDoDiaUtc(agora).getTime();
}

/** Login recusado: usuário desativado, ou `acessoAte` já passou. */
export function acessoBloqueado(
  u: { ativo: boolean; acessoAte: Date | null | undefined },
  agora: Date = new Date(),
): boolean {
  return !u.ativo || diaEncerrado(u.acessoAte, agora);
}

export const MOTIVOS_DESLIGAMENTO = [
  "rescisao_sem_justa_causa",
  "rescisao_com_justa_causa",
  "pedido_demissao",
  "acordo",
  "fim_contrato",
  "fim_estagio",
  "distrato",
  "outro",
] as const;
export type MotivoDesligamento = (typeof MOTIVOS_DESLIGAMENTO)[number];

export const MOTIVO_DESLIGAMENTO_LABELS: Record<MotivoDesligamento, string> = {
  rescisao_sem_justa_causa: "Rescisão sem justa causa",
  rescisao_com_justa_causa: "Rescisão com justa causa",
  pedido_demissao: "Pedido de demissão",
  acordo: "Acordo (art. 484-A)",
  fim_contrato: "Fim do contrato",
  fim_estagio: "Fim do estágio",
  distrato: "Distrato (PJ)",
  outro: "Outro",
};

/**
 * Valida as datas do desligamento. Devolve a mensagem para o usuário, ou `null`.
 * O login pode cair antes ou depois do fim do vínculo: aviso prévio indenizado corta o acesso
 * antes, e passagem de trabalho pode mantê-lo alguns dias depois. Ambos são escolha do RH.
 */
export function validarDesligamento(d: { dataInicioVinculo: Date; dataFim: Date }): string | null {
  if (d.dataFim.getTime() < d.dataInicioVinculo.getTime()) {
    return "A data de saída não pode ser anterior ao início do vínculo.";
  }
  return null;
}
