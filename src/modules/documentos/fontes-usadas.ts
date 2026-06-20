/**
 * Conjunto de fontes usadas por um modelo (puro — sem server-only; reutilizável
 * no editor client e no server).
 *
 * MULTI-COLEÇÃO: um modelo combina a fonte PRIMÁRIA (`modelo.fonte`) com as
 * fontes distintas declaradas em `banda.fonteId` (sub-relatórios). Esta função
 * deriva o conjunto a partir do schema + da fonte primária — não há lista
 * persistida no schemaJson (retrocompat com modelos antigos).
 */

import type { DocSchema } from "@/modules/documentos/schema";

/** Bandas que iteram a coleção e, portanto, podem ter `fonteId` próprio. */
const BANDAS_COM_FONTE = new Set(["detalhe", "grupoCabecalho", "grupoRodape"]);

/**
 * Retorna os ids de fonte usados pelo modelo, na ordem: primária primeiro,
 * depois os `fonteId` distintos das bandas (de detalhe/grupo). Valores vazios
 * são ignorados. Sem nenhum `fonteId` → só a primária (se houver).
 */
export function fontesUsadasNoSchema(
  fontePrimaria: string | null | undefined,
  schema: DocSchema,
): string[] {
  const out: string[] = [];
  const visto = new Set<string>();
  const add = (id: string | null | undefined) => {
    const v = (id ?? "").trim();
    if (!v || visto.has(v)) return;
    visto.add(v);
    out.push(v);
  };
  add(fontePrimaria);
  for (const b of schema.bandas) {
    if (BANDAS_COM_FONTE.has(b.tipo)) add(b.fonteId);
  }
  return out;
}

/** A banda itera a coleção e pode ter fonte própria? */
export function bandaTemFontePropria(tipo: string): boolean {
  return BANDAS_COM_FONTE.has(tipo);
}
