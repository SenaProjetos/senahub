import { diaDeSaoPaulo } from "@/lib/data";
import type { StatusBriefing } from "@/modules/inputs/briefing-schema";

/**
 * Frases do card "Briefing do projeto" no portal do cliente. Puro: sem Prisma, sem Next.
 */

/** "3 de 8 obrigatórias respondidas"; sem pergunta obrigatória não há o que contar (vazio). */
export function fraseProgressoBriefing(p: { preenchidos: number; total: number }): string | null {
  if (p.total <= 0) return null;
  return `${p.preenchidos} de ${p.total} ${p.total === 1 ? "obrigatória respondida" : "obrigatórias respondidas"}`;
}

/** Dia do encerramento no calendário de São Paulo ("dd/mm/aaaa"), pelo mesmo dia-SP do resto do sistema. */
export function fraseEncerradoPelaEquipe(em: Date): string {
  const [ano, mes, dia] = diaDeSaoPaulo(em).split("-");
  return `Encerrado pela equipe em ${dia}/${mes}/${ano}.`;
}

type ExtraRespondivel = { resposta: string | null };

const respondida = (e: ExtraRespondivel) => (e.resposta ?? "").trim() !== "";

/**
 * Status do card do portal. O status do briefing só enxerga os campos do modelo; um projeto que só tem perguntas
 * extras (nenhum campo visível) ficaria "Não iniciado" para sempre. Nesse caso o status vem das extras: nenhuma
 * respondida, algumas ou todas. Com campo visível, vale o do briefing.
 */
export function statusDoFormulario(e: {
  status: StatusBriefing;
  temCampoVisivel: boolean;
  extras: readonly ExtraRespondivel[];
}): StatusBriefing {
  if (e.temCampoVisivel || e.extras.length === 0) return e.status;
  const respondidas = e.extras.filter(respondida).length;
  if (respondidas === 0) return "nao_iniciado";
  return respondidas === e.extras.length ? "completo" : "em_preenchimento";
}

/** "2 de 3 perguntas respondidas" (projeto só com perguntas extras); sem pergunta não há o que contar. */
export function fraseProgressoExtras(extras: readonly ExtraRespondivel[]): string | null {
  if (extras.length === 0) return null;
  const n = extras.filter(respondida).length;
  return `${n} de ${extras.length} ${extras.length === 1 ? "pergunta respondida" : "perguntas respondidas"}`;
}
