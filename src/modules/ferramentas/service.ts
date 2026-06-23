/**
 * Orquestra cálculos e montagem de snapshots.
 * Sem dependências de Next/HTTP — reutilizável por actions e futuros jobs.
 */

import { converter, entradaSchema } from "./calc/unit-convert";
import type { ResultadoBase, SnapshotCalculo } from "./types";

/** Calcula o resultado para a ferramenta informada e retorna ResultadoBase. */
export function calcular(ferramenta: string, entradas: Record<string, unknown>): ResultadoBase {
  switch (ferramenta) {
    case "U01": {
      const parsed = entradaSchema.parse(entradas);
      const resultado = converter(parsed);
      return {
        campos: {
          valor: resultado.valor,
          de: resultado.de,
          para: resultado.para,
          fator: resultado.fator,
        },
      };
    }
    default:
      throw new Error(`Ferramenta desconhecida: "${ferramenta}"`);
  }
}

/** Monta o snapshot pronto para persistir em CalculoFerramenta. */
export function snapshotParaSalvar(
  ferramenta: string,
  titulo: string,
  norma: string | undefined,
  versaoCalc: number,
  entradas: Record<string, unknown>,
  resultado: ResultadoBase,
): SnapshotCalculo {
  return {
    ferramenta,
    titulo,
    norma,
    versaoCalc,
    entradasJson: entradas,
    resultadoJson: resultado,
  };
}
