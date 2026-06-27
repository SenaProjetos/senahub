import { type NextRequest, NextResponse } from "next/server";
import { Packer } from "docx";
import { memoriaDoCalculo } from "@/modules/ferramentas/queries";
import { renderMemoriaDocx } from "@/modules/ferramentas/memoria/render-docx";
import { slugCalculo } from "@/modules/ferramentas/export-util";

/** Memória de cálculo em Word (.docx). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const res = await memoriaDoCalculo(id);
    if (!res) return new Response("Cálculo não encontrado.", { status: 404 });
    const buffer = await Packer.toBuffer(renderMemoriaDocx(res.doc));
    return new NextResponse(buffer as unknown as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${slugCalculo(res.calc.titulo)}.docx"`,
      },
    });
  } catch {
    return new Response("Não autorizado.", { status: 401 });
  }
}
