import { DESTINO_OUTROS, DESTINO_REUNIOES, DESTINO_SEM_PROJETO } from "@/modules/rh/produtividade/horas";

export function rotuloDia(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function rotuloHoras(horas: number): string {
  return `${horas.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;
}

/** Uma cor por pessoa comparada (até 5). Tokens, nunca hex. */
export const CORES_COMPARACAO = ["var(--chart-1)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-2)"];

/** Pilha por destino: os 5 projetos usam a paleta; os grupos fixos têm cor própria e neutra. */
export function corDoDestino(chave: string, indice: number): string {
  if (chave === DESTINO_REUNIOES) return "var(--info)";
  if (chave === DESTINO_SEM_PROJETO) return "var(--muted-foreground)";
  if (chave === DESTINO_OUTROS) return "color-mix(in oklch, var(--muted-foreground) 45%, var(--card))";
  return CORES_COMPARACAO[indice % CORES_COMPARACAO.length];
}
