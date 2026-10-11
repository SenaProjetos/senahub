/**
 * Leitura dos números digitados no formulário da tabela de encargos. PURO. Devolve `null` para o
 * que não dá para ler — o formulário mostra uma frase em português em vez do erro do Zod.
 */

/** "8" → 800 pontos-base; "2,5" → 250. Só 0 a 100%. */
export function lerPontosBase(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const bp = Math.round(Number(t) * 100);
  return bp >= 0 && bp <= 10000 ? bp : null;
}

/** "1.250,50" → 125050 centavos; "85" → 8500. Sem sinal, sem símbolo. */
export function lerCentavos(texto: string): number | null {
  const t = texto.trim();
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t.replace(/\./g, "").replace(",", ".")) * 100);
}
