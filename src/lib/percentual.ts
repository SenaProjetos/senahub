/**
 * Núcleo puro para entrada de percentuais (escala 0–100).
 *
 * ## Por que NÃO reaproveita `lib/moeda.ts`
 *
 * Moeda usa buffer de dígitos e cresce da direita para a esquerda (imita a maquininha).
 * Percentual não tem esse costume: digitar `25` significa 25%, não 0,25%. E formatar a
 * cada tecla tornaria `25,5` indigitável — a vírgula seria reescrita antes do `5` chegar.
 * Por isso aqui o campo guarda o **texto cru** enquanto está em foco e só normaliza no
 * blur. O que os dois compartilham é convenção, não código: alinhamento à direita,
 * `tabular-nums`, `inputMode="decimal"`, número cru no formulário e `null ≠ 0`.
 *
 * Escala: o sistema guarda percentual em 0–100 (`z.number().min(0).max(100)`), não em
 * fração. Campo documentado como fração 0–1 (ex.: `fatorAviso`) NÃO é percentual e não
 * deve usar este núcleo.
 */

/** Casas decimais aceitas por padrão. */
export const DECIMAIS_PERCENTUAL_PADRAO = 2;

/** Só o que pode compor um número em pt-BR (dígitos, vírgula, ponto, sinal). */
const LIXO = /[^\d,.\-]/g;

/**
 * Texto digitado → número. Aceita vírgula ou ponto como decimal.
 * Retorna `null` para vazio e para texto que ainda não forma número ("-", ",", "-,").
 */
export function parsePercentual(texto: string): number | null {
  const limpo = texto.replace(LIXO, "");
  if (!limpo || !/\d/.test(limpo)) return null;
  const negativo = limpo.startsWith("-");
  // Vírgula é o decimal em pt-BR; ponto também é aceito (colagem/teclado numérico).
  const corpo = limpo.replace(/-/g, "").replace(/\./g, ",");
  const [inteira, ...resto] = corpo.split(",");
  const decimal = resto.join("");
  const n = Number(`${inteira || "0"}.${decimal || "0"}`);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

/** Número → texto pt-BR sem zeros finais: 25 → "25", 25.5 → "25,5", 7.25 → "7,25". */
export function formatarPercentual(valor: number, decimais = DECIMAIS_PERCENTUAL_PADRAO): string {
  const n = arredondar(valor, decimais) || 0; // `|| 0` mata o -0
  const fixo = n.toFixed(Math.max(0, decimais));
  // Só corta zero final DEPOIS da vírgula — senão "10" com decimais:0 viraria "1".
  const enxuto = fixo.includes(".") ? fixo.replace(/0+$/, "").replace(/\.$/, "") : fixo;
  return enxuto.replace(".", ",");
}

/** Arredonda para N casas sem o ruído de `toFixed` em números grandes. */
export function arredondar(valor: number, decimais = DECIMAIS_PERCENTUAL_PADRAO): number {
  const f = 10 ** Math.max(0, decimais);
  return Math.round(valor * f) / f;
}

/**
 * Normaliza o texto do campo ao sair do foco: `"25,"` → `"25"`, `"25,50"` → `"25,5"`,
 * `"007"` → `"7"`. Texto sem número vira `""` (campo vazio, distinto de 0).
 */
export function normalizarPercentual(texto: string, decimais = DECIMAIS_PERCENTUAL_PADRAO): string {
  const n = parsePercentual(texto);
  return n === null ? "" : formatarPercentual(n, decimais);
}

/**
 * Filtra o que o usuário pode digitar: dígitos, um separador decimal e (se permitido) o
 * sinal na frente. Limita as casas decimais em tempo real — `decimais: 0` bloqueia a
 * vírgula, para os campos que o schema exige inteiros.
 */
export function limparEntradaPercentual(
  texto: string,
  decimais = DECIMAIS_PERCENTUAL_PADRAO,
  permiteNegativo = false,
): string {
  let s = texto.replace(LIXO, "").replace(/\./g, ",");
  const negativo = permiteNegativo && s.startsWith("-");
  s = s.replace(/-/g, "");
  if (decimais <= 0) {
    s = s.replace(/,.*$/, "");
  } else {
    // Mantém só a primeira vírgula e corta o excesso de casas.
    const [inteira, ...resto] = s.split(",");
    if (resto.length > 0) s = inteira + "," + resto.join("").slice(0, decimais);
  }
  return negativo ? "-" + s : s;
}
