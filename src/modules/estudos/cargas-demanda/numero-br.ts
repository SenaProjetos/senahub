/**
 * Número digitado em pt-BR — **puro**. A tela guarda número (ou `null`); aqui está só a leitura do que a pessoa
 * digita e a exibição com vírgula. "1,5" e "1.5" valem 1,5; "1.234,5" vale 1234,5; "1.234" (ponto como milhar,
 * grupos de 3) vale 1234; "12.5" vale 12,5.
 */

/** `null` = campo vazio; `undefined` = texto que não é número (a tela não grava e mostra o que foi digitado). */
export function lerNumeroBR(texto: string): number | null | undefined {
  const t = texto.replace(/\s+/g, "");
  if (t === "") return null;
  if (!/^[+-]?[\d.,]+$/.test(t)) return undefined;
  let normal: string;
  if (t.includes(",")) {
    // A vírgula é o decimal; o ponto, o milhar.
    if (t.indexOf(",") !== t.lastIndexOf(",")) return undefined;
    normal = t.replace(/\./g, "").replace(",", ".");
  } else if (/^[+-]?\d{1,3}(\.\d{3})+$/.test(t)) {
    normal = t.replace(/\./g, "");
  } else {
    if ((t.match(/\./g) ?? []).length > 1) return undefined;
    normal = t;
  }
  const n = Number(normal);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Exibição de um valor (milhar com ponto): sempre `casas` casas decimais no mínimo (1,00; 0,80); um valor com mais casas não perde
 * precisão ao ser mostrado (até `maximo`).
 */
export function formatarNumeroBR(valor: number | null | undefined, casas = 2, maximo = Math.max(casas, 6)): string {
  if (valor == null || !Number.isFinite(valor)) return "";
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: maximo, useGrouping: true });
}
