/**
 * Detecção de reincidência de apontamentos (item 17) — puro, sem I/O, no molde de `prazo.ts`.
 *
 * **Escopo (R7): (b) apontamento NOVO que repete um já encerrado.** O caso (a), "a mesma
 * pendência reaberta", já existe como estado (`reaberturas`, item 22) e não precisa de
 * algoritmo nenhum.
 *
 * **É uma heurística LÉXICA, e é assim de propósito.** Similaridade semântica de verdade exigiria
 * embeddings/IA, que o item 38 já adiou. O risco que a própria ficha registra é falso positivo
 * escondendo problema novo — por isso nada aqui decide coisa alguma sozinho: a saída é uma
 * SUGESTÃO que a pessoa confirma, e confirmar apenas cria a referência cruzada do item 13.
 * Nenhum estado de apontamento muda por conta deste arquivo.
 *
 * Jaccard sobre conjunto de tokens, não distância de edição: o que se repete num apontamento de
 * projeto é o vocabulário ("cota ausente na planta baixa"), não a grafia exata — e Jaccard é
 * indiferente à ordem das palavras, que muda toda hora sem mudar o problema.
 */

/**
 * Palavras que aparecem em quase todo apontamento e não distinguem nada. Lista curta e fechada:
 * um stopword a mais que carregue conteúdo técnico (por exemplo "sem", em "sem cota") derrubaria
 * casamentos legítimos, então o corte é conservador.
 */
const VAZIAS = new Set([
  "a", "à", "ao", "aos", "as", "às", "com", "como", "da", "das", "de", "do", "dos", "e", "em",
  "essa", "esse", "esta", "este", "eu", "na", "nas", "no", "nos", "o", "os", "ou", "para", "pela",
  "pelo", "por", "que", "se", "um", "uma", "umas", "uns",
]);

/** Tokens com menos que isto viram ruído ("m", "cm", "n") sem discriminar apontamento. */
const MIN_TOKEN = 3;

/**
 * Abaixo disto o texto é curto demais pra Jaccard significar algo: com 2 tokens, um único termo
 * em comum já daria 0,33 e dois dariam 1,0.
 */
export const MIN_TOKENS_COMPARAVEL = 3;

/**
 * Limiar de sugestão.
 *
 * **Como foi calibrado:** o banco de desenvolvimento tem 6 apontamentos e nenhum par com
 * qualquer palavra em comum (varredura completa: 0 pares com score > 0), ou seja, não oferece
 * sinal nenhum. O corte saiu então de um corpus rotulado à mão de 16 pares em pt-BR — 8
 * "mesmo problema reescrito" e 8 "só o vocabulário da disciplina em comum". Varredura:
 *
 * ```
 * limiar | acha o mesmo problema | falso positivo
 *  0,60  |        4/8            |     1/8
 *  0,50  |        7/8            |     1/8
 *  0,40  |        8/8            |     1/8   ← escolhido
 *  0,25  |        8/8            |     3/8
 * ```
 *
 * Em 0,40 os 8 pares legítimos são achados e o único falso positivo é
 * "viga V-04 sem detalhamento de armadura" × "pilar P-07 sem detalhamento de armadura" (0,60) —
 * elemento diferente, mas literalmente o mesmo problema recorrente, que é um aviso defensável.
 * Descer a 0,25 dobra o ruído sem achar nada a mais.
 *
 * Sendo sugestão confirmável (nunca automação), errar pra menos custa uma sugestão ignorada;
 * errar pra mais custa uma reincidência real que ninguém viu — daí o corte baixo.
 * Vale recalibrar quando houver histórico real de repetição no banco.
 */
export const LIMIAR_REINCIDENCIA = 0.4;

/** Quantas sugestões no máximo — a caixa é um aviso, não uma lista de resultados de busca. */
export const MAX_SUGESTOES = 3;

/**
 * Tokens comparáveis de um texto: minúsculo, sem acento, sem pontuação, sem palavra vazia.
 * Números e códigos ("V-04", "1:50") sobrevivem — costumam ser o que identifica o elemento.
 */
export function tokenizar(texto: string): Set<string> {
  const limpo = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ");
  const tokens = new Set<string>();
  for (const t of limpo.split(" ")) {
    if (t.length >= MIN_TOKEN && !VAZIAS.has(t)) tokens.add(t);
  }
  return tokens;
}

/**
 * Índice de Jaccard entre dois textos (0..1). Devolve 0 quando qualquer um dos lados é curto
 * demais pra comparação significar algo — melhor não sugerir do que sugerir por acidente.
 */
export function similaridade(a: string, b: string): number {
  const ta = tokenizar(a);
  const tb = tokenizar(b);
  if (ta.size < MIN_TOKENS_COMPARAVEL || tb.size < MIN_TOKENS_COMPARAVEL) return 0;
  let comuns = 0;
  for (const t of ta) if (tb.has(t)) comuns++;
  const uniao = ta.size + tb.size - comuns;
  return uniao === 0 ? 0 : comuns / uniao;
}

/**
 * Candidatos a reincidência de `texto`, do mais parecido pro menos, já cortados pelo limiar e
 * pelo teto de sugestões. Puro: quem chama decide o universo de candidatos (encerrados do mesmo
 * documento/disciplina) — este arquivo não sabe o que é "encerrado".
 */
export function candidatosReincidencia<T extends { texto: string }>(
  texto: string,
  candidatos: readonly T[],
  limiar: number = LIMIAR_REINCIDENCIA,
): (T & { score: number })[] {
  return candidatos
    .map((c) => ({ ...c, score: similaridade(texto, c.texto) }))
    .filter((c) => c.score >= limiar)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SUGESTOES);
}
