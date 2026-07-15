/**
 * Lixeira de arquivos do projeto (soft delete de Upload). Puro, sem I/O — usado
 * pela action, pelo job de purga, pela query da lixeira e pela UI.
 */

/** Janela de retenção: arquivos na lixeira são purgados após este prazo. */
export const DIAS_LIXEIRA = 30;

const MS_DIA = 24 * 60 * 60 * 1000;

/** Data-limite de purga: itens com `excluidoEm` anterior a isso já venceram. */
export function limitePurga(agora: Date = new Date()): Date {
  return new Date(agora.getTime() - DIAS_LIXEIRA * MS_DIA);
}

/**
 * Dias restantes até a purga (arredonda p/ cima, mínimo 0). `excluidoEm` no futuro
 * (relógio torto) devolve DIAS_LIXEIRA. Item já vencido devolve 0.
 */
export function diasRestantesLixeira(excluidoEm: Date, agora: Date = new Date()): number {
  const decorridoMs = agora.getTime() - excluidoEm.getTime();
  if (decorridoMs <= 0) return DIAS_LIXEIRA;
  const restanteDias = DIAS_LIXEIRA - decorridoMs / MS_DIA;
  return Math.max(0, Math.ceil(restanteDias));
}
