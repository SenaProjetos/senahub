/**
 * Dispatcher de desenho DXF por ferramenta. Puro (sem server-only).
 * Retorna a string DXF ou null se a ferramenta não gera desenho.
 */

import { calcular as calcularSecao, entradaSchema as secaoSchema } from "../calc/section-properties";
import { entradaSchema as vigaSchema } from "../calc/concrete-beam-flexure";
import { desenharSecao } from "./section";
import { desenharVigaSecao } from "./beam-section";

export function desenharDxf(ferramenta: string, entradas: unknown): string | null {
  switch (ferramenta) {
    case "U02":
      return desenharSecao(calcularSecao(secaoSchema.parse(entradas))).toString();
    case "E01":
      return desenharVigaSecao(vigaSchema.parse(entradas)).toString();
    default:
      return null;
  }
}
