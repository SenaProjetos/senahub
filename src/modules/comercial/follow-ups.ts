/**
 * Agrupamento da tela de Follow-ups do Comercial. Puro: sem Prisma, sem relógio (o `agora` vem
 * de fora), no mesmo espírito de `frescor.ts`.
 *
 * Os cortes são por dia-calendário LOCAL, o mesmo do Meu Dia da Home: "hoje" é o dia inteiro,
 * não as próximas 24h — uma ação marcada para as 9h e vista às 15h ainda é "de hoje", não atrasada.
 */
export type GrupoFollowUp = "atrasados" | "hoje" | "proximos" | "depois";

export const ROTULO_GRUPO_FOLLOWUP: Record<GrupoFollowUp, string> = {
  atrasados: "Atrasados",
  hoje: "Hoje",
  proximos: "Próximos 7 dias",
  depois: "Mais adiante",
};

export const ORDEM_GRUPOS_FOLLOWUP: readonly GrupoFollowUp[] = ["atrasados", "hoje", "proximos", "depois"];

export function grupoDoFollowUp(inicio: Date, agora: Date): GrupoFollowUp {
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  const inicioAmanha = inicioHoje + 86_400_000;
  const fimProximos = inicioAmanha + 7 * 86_400_000;
  const t = inicio.getTime();
  if (t < inicioHoje) return "atrasados";
  if (t < inicioAmanha) return "hoje";
  if (t < fimProximos) return "proximos";
  return "depois";
}

/** Agrupa preservando a ordem de entrada dentro de cada grupo (a query já vem por data). */
export function agruparFollowUps<T extends { inicio: string }>(
  itens: readonly T[],
  agora: Date,
): Record<GrupoFollowUp, T[]> {
  const grupos: Record<GrupoFollowUp, T[]> = { atrasados: [], hoje: [], proximos: [], depois: [] };
  for (const item of itens) grupos[grupoDoFollowUp(new Date(item.inicio), agora)].push(item);
  return grupos;
}
