import { type NextRequest } from "next/server";
import { abrirCalculo } from "@/modules/ferramentas/queries";
import { desenharDxf } from "@/modules/ferramentas/dxf";
import { slugCalculo } from "@/modules/ferramentas/export-util";

/** DXF do desenho da ferramenta (dispatcher por ferramenta). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const calc = await abrirCalculo(id);
    if (!calc) return new Response("Cálculo não encontrado.", { status: 404 });

    const dxf = desenharDxf(calc.ferramenta, calc.entradasJson);
    if (dxf == null) return new Response("Esta ferramenta não gera DXF.", { status: 400 });

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
