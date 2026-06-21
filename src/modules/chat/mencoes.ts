/**
 * Utilitários de menção (@nome) para o chat.
 * Módulo puro (sem server-only/prisma) para ser testável diretamente.
 *
 * Usa a classe Unicode [\p{L}\p{N}_] com flag `u` para casar nomes acentuados
 * como @José, @Conceição, @João_Carlos.
 */

/** Casa uma menção no final do texto em edição (para autocomplete). */
export const REGEX_MENCAO_CURSOR = /(^|\s)@([\p{L}\p{N}_]*)$/u;

/** Casa todas as menções num texto completo (para realce e extração). */
const REGEX_MENCAO_GLOBAL = /(^|\s)(@[\p{L}\p{N}_]+)/giu;

/** Tokens especiais que mencionam todos os membros do canal. */
export const MENCAO_TODOS = ["@todos", "@all"] as const;

/** Indica se o texto contém uma menção a todos (@todos ou @all), case-insensitive. */
export function mencionouTodos(texto: string): boolean {
  return extrairMencoes(texto).some((t) =>
    (MENCAO_TODOS as readonly string[]).includes(t.toLowerCase()),
  );
}

/**
 * Extrai os tokens @nome presentes no texto (sem duplicatas, com @).
 * Ex.: "oi @João e @Maria" → ["@João", "@Maria"]
 */
export function extrairMencoes(texto: string): string[] {
  const encontradas = new Set<string>();
  for (const m of texto.matchAll(REGEX_MENCAO_GLOBAL)) {
    encontradas.add(m[2]);
  }
  return [...encontradas];
}

/**
 * Divide o texto em partes alternando texto normal e tokens @menção,
 * para que o componente renderize cada tipo diferente.
 * Ex.: "oi @João ok" → ["oi ", "@João", " ok"]
 */
export function partesComMencao(texto: string): string[] {
  return texto.split(/([\p{L}\p{N}_]*@[\p{L}\p{N}_]+)/u).filter(Boolean);
}

/**
 * Substitui a menção sendo digitada no final do input pelo nome escolhido.
 * Ex.: texto="olá @Jo", nome="João Silva" → "olá @João "
 * Usa apenas o primeiro token do nome para não quebrar menções com espaço.
 */
export function inserirMencaoNoTexto(texto: string, nome: string): string {
  const primeiroToken = nome.split(" ")[0];
  return texto.replace(REGEX_MENCAO_CURSOR, (_m, pre) => `${pre}@${primeiroToken} `);
}
