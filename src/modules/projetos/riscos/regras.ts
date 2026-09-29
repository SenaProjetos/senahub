/**
 * Registro de riscos do projeto (painel "Riscos em destaque" da Visão Geral e a janela com a
 * lista inteira). Regras puras, client-safe: o painel e a janela precisam classificar e ordenar
 * do mesmo jeito, senão o "destaque" deixa de ser o topo da lista.
 */

export const STATUS_RISCO = ["aberto", "mitigado", "aceito"] as const;
export type StatusRisco = (typeof STATUS_RISCO)[number];

export const STATUS_RISCO_LABEL: Record<StatusRisco, string> = {
  aberto: "Aberto",
  mitigado: "Mitigado",
  aceito: "Aceito",
};

/** Probabilidade e impacto vão de 1 a 3. */
export const GRAU_RISCO_LABEL: Record<number, string> = { 1: "Baixo", 2: "Médio", 3: "Alto" };

export type NivelRisco = "alto" | "medio" | "baixo";

export const NIVEL_RISCO_LABEL: Record<NivelRisco, string> = { alto: "Alto", medio: "Médio", baixo: "Baixo" };

/** Nível pela matriz 3×3: produto ≥ 6 é alto, ≥ 3 é médio, o resto é baixo. */
export function nivelRisco(probabilidade: number, impacto: number): NivelRisco {
  const pontos = probabilidade * impacto;
  if (pontos >= 6) return "alto";
  if (pontos >= 3) return "medio";
  return "baixo";
}

/**
 * Abertos primeiro (mitigado e aceito já têm destino) e, dentro de cada grupo, o mais grave
 * primeiro. Empate mantém a ordem recebida — a consulta traz do mais antigo ao mais novo.
 */
export function ordenarRiscos<T extends { status: string; probabilidade: number; impacto: number }>(
  riscos: readonly T[],
): T[] {
  return [...riscos].sort((a, b) => {
    const abertoA = a.status === "aberto";
    const abertoB = b.status === "aberto";
    if (abertoA !== abertoB) return abertoA ? -1 : 1;
    return b.probabilidade * b.impacto - a.probabilidade * a.impacto;
  });
}
