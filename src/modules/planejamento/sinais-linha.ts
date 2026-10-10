/**
 * Sinais visuais da linha da EAP (reunião de 08/10/2026, decisão 2). Regras puras, sem I/O.
 *
 *  - VERDE ("validar"): o responsável marcou o card como concluído e a linha ainda não está em
 *    100% — falta o gestor validar. Quem informa o % continua sendo o coordenador (D19); o sinal só
 *    o lembra.
 *  - VERMELHO ("atrasada"): o término ATUAL (o do motor, que o gestor vê na tela) já passou e a
 *    linha não chegou a 100%. É o término atual de propósito, e não a linha de base: a Saúde e o
 *    filtro "Atrasadas" seguem medindo contra o combinado.
 *
 * Verde vence vermelho: com o card concluído, o que falta é validar, não cobrar a pessoa.
 * Resumo não tem sinal (o % dele vem dos filhos), nem linha encerrada.
 */
export type SinalLinha = "validar" | "atrasada";

const ENCERRADAS = new Set(["con", "can", "arq"]);

export function sinalDaLinha(
  l: { ehResumo: boolean; progresso: number; status: string; fimPrevisto: string; cardConcluidoEm: string | null },
  hoje: string,
): SinalLinha | null {
  if (l.ehResumo || l.progresso >= 100 || ENCERRADAS.has(l.status)) return null;
  if (l.cardConcluidoEm != null) return "validar";
  if (l.fimPrevisto < hoje) return "atrasada";
  return null;
}

export const ROTULO_SINAL: Record<SinalLinha, string> = {
  validar: "Concluída pelo responsável — falta validar",
  atrasada: "Passou do término previsto",
};
