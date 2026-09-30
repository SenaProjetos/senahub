/**
 * Largura das colunas da tabela do cronograma, ajustável pelo usuário (reunião de 29/09/2026). PURO: sem I/O.
 *
 * A preferência é do USUÁRIO (`UserPreference`), não do projeto: vale em qualquer cronograma e no editor de modelo,
 * que usam as mesmas colunas. Guarda só o que foi mexido (`{ id da coluna: px }`); coluna sem entrada usa a largura
 * padrão dela. O valor vem do banco/JSON, então tudo é revalidado aqui antes de virar `style.width`.
 */

export const CHAVE_PREF_LARGURAS_GANTT = "gantt_larguras_colunas";

/** Piso: abaixo disso nem o rótulo curto ("Nº", "%") cabe. */
export const LARGURA_MINIMA = 44;
/** Teto: largura absurda tira o gráfico da tela. */
export const LARGURA_MAXIMA = 640;
/** Passo do teclado (setas na alça da coluna). */
export const PASSO_TECLADO = 12;

export type Larguras = Record<string, number>;

/** Encaixa no piso e no teto e arredonda para pixel inteiro. Número inválido (`NaN`, infinito) devolve `null`. */
export function limitarLargura(px: number): number | null {
  if (!Number.isFinite(px)) return null;
  return Math.min(LARGURA_MAXIMA, Math.max(LARGURA_MINIMA, Math.round(px)));
}

/** Lê o que veio da preferência: ignora o que não for `{ string: número }` e encaixa cada valor nos limites. */
export function lerLarguras(valor: unknown): Larguras {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return {};
  const saida: Larguras = {};
  for (const [id, px] of Object.entries(valor)) {
    if (typeof px !== "number") continue;
    const w = limitarLargura(px);
    if (w != null) saida[id] = w;
  }
  return saida;
}

/** A largura efetiva da coluna: a escolhida pelo usuário ou a padrão. */
export function larguraDaColuna(id: string, padrao: number, escolhidas: Larguras): number {
  return escolhidas[id] ?? padrao;
}

/**
 * O mapa novo depois de mexer numa coluna. Voltar exatamente ao padrão apaga a entrada (a preferência guarda só o que
 * difere do padrão, e "restaurar" uma coluna é arrastá-la de volta).
 */
export function comLargura(escolhidas: Larguras, id: string, px: number, padrao: number): Larguras {
  const w = limitarLargura(px);
  const { [id]: _antiga, ...resto } = escolhidas;
  void _antiga;
  return w == null || w === padrao ? resto : { ...resto, [id]: w };
}
