import { DESTINO_OUTROS, DESTINO_REUNIOES, DESTINO_SEM_PROJETO } from "@/modules/rh/produtividade/horas";

export function rotuloDia(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function rotuloHoras(horas: number): string {
  return `${horas.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;
}

/**
 * Uma cor por pessoa comparada / por projeto (até 5). Tokens, nunca hex. O slate `--chart-2` fica de
 * fora de propósito: é quase o cinza de "Sem projeto"; o roxo entra no lugar.
 */
export const CORES_COMPARACAO = [
  "var(--chart-1)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--status-aguardando)",
];

/**
 * Pilha por destino: os 5 projetos usam a paleta acima; os grupos fixos têm cor que não se repete nela
 * (`--info` é o mesmo azul de `--chart-3`, por isso Reuniões não o usa). Outros e Sem projeto são cinzas
 * de claridade diferente — não são projetos, não disputam atenção.
 */
export function corDoDestino(chave: string, indice: number): string {
  if (chave === DESTINO_REUNIOES) return "var(--status-revisao)";
  if (chave === DESTINO_SEM_PROJETO) return "var(--muted-foreground)";
  if (chave === DESTINO_OUTROS) return "color-mix(in oklch, var(--muted-foreground) 40%, var(--card))";
  return CORES_COMPARACAO[indice % CORES_COMPARACAO.length];
}

/**
 * Teclado no gráfico: uma parada de Tab só (roving tabindex); setas andam entre os dias/semanas,
 * Home/End vão às pontas. `null` = tecla que não é do gráfico.
 */
export function proximoFoco(atual: number, tecla: string, total: number): number | null {
  if (tecla === "ArrowRight") return Math.min(total - 1, atual + 1);
  if (tecla === "ArrowLeft") return Math.max(0, atual - 1);
  if (tecla === "Home") return 0;
  if (tecla === "End") return total - 1;
  return null;
}
