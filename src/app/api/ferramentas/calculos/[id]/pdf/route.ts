import { type NextRequest, NextResponse } from "next/server";
import { memoriaDoCalculo } from "@/modules/ferramentas/queries";
import { renderMemoriaHtml } from "@/modules/ferramentas/memoria/render-html";
import { htmlParaPdf } from "@/modules/ferramentas/memoria/render-pdf";
import { respostaDeErroDeExportacao, slugCalculo } from "@/modules/ferramentas/export-util";

/** PDF da memória de cálculo (puppeteer + setContent). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let html: string;
  let nome: string;
  try {
    const res = await memoriaDoCalculo(id);
    if (!res) return new Response("Cálculo não encontrado.", { status: 404 });
    html = renderMemoriaHtml(res.doc);
    nome = slugCalculo(res.calc.titulo);
  } catch (e) {
    return respostaDeErroDeExportacao(e);
  }

  const pdf = await htmlParaPdf(html);
  if (!pdf) return new Response("Não foi possível gerar o PDF neste servidor. Avise a equipe de TI.", { status: 503 });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nome}.pdf"`,
    },
  });
}
