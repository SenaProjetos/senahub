import "server-only";
import { can, type SubjectAutorizacao } from "@/lib/permissions";

/**
 * Quem vê as DATAS do planejamento (decisão #3, 2026-09-25). O resto do perfil só de consulta
 * (`planejamento:ver`) vê a estrutura: a árvore, as pessoas, a duração e o avanço.
 *
 * Vê data quem monta o cronograma (`planejamento:gerir`), quem o consulta como cronograma
 * (`cronograma:ver`) ou quem o acompanha e aprova (`cronograma:executado`, `cronograma:aprovar`) —
 * pares que já existem, então nenhuma permissão nova nem migration. Admin passa por qualquer par.
 */
const PARES_COM_DATAS = [
  ["planejamento", "gerir"],
  ["cronograma", "ver"],
  ["cronograma", "executado"],
  ["cronograma", "aprovar"],
] as const;

export async function podeVerDatasDoPlanejamento(user: SubjectAutorizacao): Promise<boolean> {
  for (const [recurso, acao] of PARES_COM_DATAS) {
    if (await can(user, recurso, acao)) return true;
  }
  return false;
}
