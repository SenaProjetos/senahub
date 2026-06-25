/**
 * Dispatcher de desenho DXF por ferramenta. Puro (sem server-only).
 * `documentoDxf` retorna o DxfDocumento (geometria estruturada, reusável p/ preview SVG);
 * `desenharDxf` serializa em string DXF (ou null se a ferramenta não gera desenho).
 */

import type { DxfDocumento } from "@/lib/dxf";
import { calcular as calcularSecao, entradaSchema as secaoSchema } from "../calc/section-properties";
import { entradaSchema as vigaSchema } from "../calc/concrete-beam-flexure";
import { entradaSchema as pilarSchema } from "../calc/concrete-column";
import { entradaSchema as lajeSchema } from "../calc/slab-bares";
import { entradaSchema as escadaSchema } from "../calc/stair";
import { desenharSecao } from "./section";
import { desenharVigaSecao } from "./beam-section";
import { desenharPilarSecao } from "./column-section";
import { desenharLajePainel } from "./slab-panel";
import { desenharEscadaPerfil } from "./stair-section";

/** Monta o documento DXF (geometria) da ferramenta, ou null. Lança se as entradas forem inválidas. */
export function documentoDxf(ferramenta: string, entradas: unknown): DxfDocumento | null {
  switch (ferramenta) {
    case "U02":
      return desenharSecao(calcularSecao(secaoSchema.parse(entradas)));
    case "E01":
      return desenharVigaSecao(vigaSchema.parse(entradas));
    case "E04":
      return desenharPilarSecao(pilarSchema.parse(entradas));
    case "E05":
      return desenharLajePainel(lajeSchema.parse(entradas));
    case "E08":
      return desenharEscadaPerfil(escadaSchema.parse(entradas));
    default:
      return null;
  }
}

export function desenharDxf(ferramenta: string, entradas: unknown): string | null {
  return documentoDxf(ferramenta, entradas)?.toString() ?? null;
}
