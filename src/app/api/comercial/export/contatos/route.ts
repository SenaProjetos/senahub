import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { lerFiltros } from "@/modules/comercial/filtros";
import { contatosParaExport } from "@/modules/comercial/exportacao";
import { arquivoCsv, headersDownloadCsv } from "@/lib/export/csv";

/**
 * Export CSV de Contatos (F4.6) — "lista de abordagem": pessoas alcançáveis por uma
 * prospecção que bate nos filtros ATIVOS do board (mesmas chaves de URL de `/comercial/prospeccao`).
 * Não existe uma tela "lista de contatos" solta — o recorte que faz sentido pra exportar é
 * justamente esse (ver docblock de `WHERE_PODE_ABORDAR`: "toda query que monta lista de
 * abordagem OU exportação de prospecção").
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await can(session.user, "comercial", "gerir"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const filtros = lerFiltros(Object.fromEntries(new URL(req.url).searchParams));
  const contatos = await contatosParaExport(filtros, new Date());

  const headers = ["Nome", "Cargo", "E-mail", "Telefone", "Empresa"];
  const linhas = contatos.map((c) => [c.nome, c.cargo, c.email, c.telefone, c.cliente.nome]);

  return new NextResponse(arquivoCsv(headers, linhas), { headers: headersDownloadCsv("contatos.csv") });
}
