import { type NextRequest } from "next/server";
import { abrirCalculo } from "@/modules/ferramentas/queries";
import { calcular, entradaSchema } from "@/modules/ferramentas/calc/section-properties";
import { desenharSecao } from "@/modules/ferramentas/dxf/section";
import { slugCalculo } from "@/modules/ferramentas/export-util";

/** DXF do desenho da ferramenta. Hoje só U02 (seção). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const calc = await abrirCalculo(id);
    if (!calc) return new Response("Cálculo não encontrado.", { status: 404 });
    if (calc.ferramenta !== "U02") {
      return new Response("Esta ferramenta não gera DXF.", { status: 400 });
    }

    const entrada = entradaSchema.parse(calc.entradasJson);
    const dxf = desenharSecao(calcular(entrada)).toString();

    return new Response(dxf, {
      headers: {
        "Content-Type": "application/dxf",
        "Content-Disposition": `attachment; filename="${slugCalculo(calc.titulo)}.dxf"`,
      },
    });
  } catch {
    return new Response("Não autorizado.", { status: 401 });
  }
}
