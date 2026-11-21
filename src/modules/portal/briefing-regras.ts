import { diaDeSaoPaulo } from "@/lib/data";

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
