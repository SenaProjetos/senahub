import type { NivelRisco } from "@/modules/projetos/riscos/regras";

/**
 * Cor do nível de risco, a mesma no painel "Riscos em destaque" (servidor) e na janela com a
 * lista inteira (cliente). Fica fora do arquivo "use client": constante exportada de lá chega ao
 * componente de servidor como referência de cliente, não como o objeto.
 */
export const NIVEL_RISCO_VISUAL: Record<NivelRisco, { badge: string; borda: string }> = {
  alto: { badge: "border-destructive/40 bg-destructive/10 text-destructive", borda: "border-l-destructive" },
  medio: { badge: "border-warning/40 bg-warning/10 text-warning", borda: "border-l-warning" },
  baixo: { badge: "border-muted-foreground/40 bg-muted text-muted-foreground", borda: "border-l-muted-foreground" },
};
