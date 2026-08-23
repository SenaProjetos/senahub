import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { arquivoCsv, headersDownloadCsv } from "@/lib/export/csv";
import { lerFiltrosInteligencia } from "@/modules/comercial/inteligencia/filtros";
import { linhasInteligenciaParaCsv, CABECALHO_CSV_INTELIGENCIA } from "@/modules/comercial/inteligencia/exportacao";
import { inteligenciaComercial } from "@/modules/comercial/inteligencia/queries";

/** F6.9 — mesmo parser, DTO e fórmulas da página; a URL do download é o recorte exportado. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await can(session.user, "comercial", "gerir"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const filtros = lerFiltrosInteligencia(Object.fromEntries(new URL(req.url).searchParams));
  const dados = await inteligenciaComercial(filtros, new Date());
  return new NextResponse(arquivoCsv(CABECALHO_CSV_INTELIGENCIA, linhasInteligenciaParaCsv(dados)), {
    headers: headersDownloadCsv("inteligencia-comercial.csv"),
  });
}
