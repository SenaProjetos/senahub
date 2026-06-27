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
import { entradaSchema as sapataSchema } from "../calc/footing";
import { entradaSchema as sapataExcSchema } from "../calc/eccentric-footing";
import { desenharSecao } from "./section";
import { desenharVigaSecao } from "./beam-section";
import { desenharPilarSecao } from "./column-section";
import { desenharLajePainel } from "./slab-panel";
import { desenharEscadaPerfil } from "./stair-section";
import { desenharSapata } from "./footing";
import { desenharSapataExc } from "./eccentric-footing";

/** Monta o documento DXF (geometria) da ferramenta, ou null. Lança se as entradas forem inválidas. */
export function documentoDxf(ferramenta: string, entradas: unknown): DxfDocumento | null {
  switch (ferramenta) {
    case "propriedades-secao":
      return desenharSecao(calcularSecao(secaoSchema.parse(entradas)));
    case "viga-concreto":
      return desenharVigaSecao(vigaSchema.parse(entradas));
    case "pilar-concreto":
      return desenharPilarSecao(pilarSchema.parse(entradas));
    case "laje-macica":
      return desenharLajePainel(lajeSchema.parse(entradas));
    case "escada":
      return desenharEscadaPerfil(escadaSchema.parse(entradas));
    case "sapata-isolada":
      return desenharSapata(sapataSchema.parse(entradas));
    case "sapata-excentrica":
      return desenharSapataExc(sapataExcSchema.parse(entradas));
    default:
      return null;
  }
}

export function desenharDxf(ferramenta: string, entradas: unknown): string | null {
  return documentoDxf(ferramenta, entradas)?.toString() ?? null;
}
