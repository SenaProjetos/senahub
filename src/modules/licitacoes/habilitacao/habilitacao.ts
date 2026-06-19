/** Item de habilitação está atendido?
 *  - manual `atendido=true` → true;
 *  - senão, se há certidão vinculada, atende se a validade ≥ data de referência (sessão ou hoje).
 *  refISO e certidaoValidadeISO são "YYYY-MM-DD" (comparação lexical = cronológica). */
export function itemAtendido(
  item: { atendido: boolean; certidaoValidadeISO: string | null },
  refISO: string,
): boolean {
  if (item.atendido) return true;
  if (item.certidaoValidadeISO) return item.certidaoValidadeISO >= refISO;
  return false;
}
