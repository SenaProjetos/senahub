/**
 * Dispatcher de desenho DXF por ferramenta. Puro (sem server-only).
 * Retorna a string DXF ou null se a ferramenta não gera desenho.
 */

import { calcular as calcularSecao, entradaSchema as secaoSchema } from "../calc/section-properties";
import { entradaSchema as vigaSchema } from "../calc/concrete-beam-flexure";
import { entradaSchema as pilarSchema } from "../calc/concrete-column";
import { entradaSchema as lajeSchema } from "../calc/slab-bares";
import { desenharSecao } from "./section";
import { desenharVigaSecao } from "./beam-section";
import { desenharPilarSecao } from "./column-section";
import { desenharLajePainel } from "./slab-panel";

export function desenharDxf(ferramenta: string, entradas: unknown): string | null {
  switch (ferramenta) {
    case "U02":
      return desenharSecao(calcularSecao(secaoSchema.parse(entradas))).toString();
    case "E01":
      return desenharVigaSecao(vigaSchema.parse(entradas)).toString();
    case "E04":
      return desenharPilarSecao(pilarSchema.parse(entradas)).toString();
    case "E05":
      return desenharLajePainel(lajeSchema.parse(entradas)).toString();
    default:
      return null;
  }
}
