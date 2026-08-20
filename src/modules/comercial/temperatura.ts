import type { Temperatura } from "@/generated/prisma/client";

/**
 * Temperatura da prospecção/negociação (F2.12) — **manual**, sem IA e sem scoring automático
 * (veredito do dono no roadmap A–F). Puro e client-safe: o card e o dialog consomem daqui.
 *
 * `null` é um estado legítimo e distinto de `FRIO`: significa "ninguém classificou ainda". O card
 * não pinta nada nesse caso. Tratar null como frio faria todo lead novo nascer azul e a cor
 * perderia o significado justamente por excesso de uso.
 */
export const TEMPERATURAS: readonly Temperatura[] = ["FRIO", "MORNO", "QUENTE"] as const;

export const TEMPERATURA_LABEL: Record<Temperatura, string> = {
  FRIO: "Frio",
  MORNO: "Morno",
  QUENTE: "Quente",
};

/**
 * Classe do badge. Tokens semânticos do design system (`info`/`warning`/`destructive`), nunca hex
 * — é a regra do projeto, e é o que faz o tema escuro funcionar sem uma segunda tabela de cores.
 *
 * O mapeamento não é arbitrário: frio → `info` (azul, calmo), morno → `warning` (âmbar, atenção),
 * quente → `destructive` (vermelho, urgência). Quente usar a cor de "destrutivo" pode soar
 * estranho fora de contexto, mas num funil é exatamente a leitura desejada: é o que exige ação
 * agora.
 */
export const TEMPERATURA_CLASS: Record<Temperatura, string> = {
  FRIO: "text-info border-info/40",
  MORNO: "text-warning border-warning/40",
  QUENTE: "text-destructive border-destructive/40",
};

/** Emoji de apoio — a cor sozinha não pode carregar o significado (acessibilidade). */
export const TEMPERATURA_ICONE: Record<Temperatura, string> = {
  FRIO: "❄",
  MORNO: "🌤",
  QUENTE: "🔥",
};

export function ehTemperatura(v: string | null | undefined): v is Temperatura {
  return v != null && (TEMPERATURAS as readonly string[]).includes(v);
}
