import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { lerFiltros } from "@/modules/comercial/filtros";
import { prospeccoesParaExport } from "@/modules/comercial/exportacao";
import { arquivoCsv, headersDownloadCsv } from "@/lib/export/csv";

/**
 * Export CSV de Prospecções (F4.6) — mesmo `where` base do board (`funilProspeccao`) mais os
 * filtros da URL atual, mesmas chaves de `/comercial/prospeccao`.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await can(session.user, "comercial", "gerir"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const filtros = lerFiltros(Object.fromEntries(new URL(req.url).searchParams));
  const leads = await prospeccoesParaExport(filtros, new Date());

  const headers = ["Empresa", "Prospecção", "Status", "Temperatura", "Valor estimado", "Campanha", "Responsável", "Contato principal", "E-mail", "Criado em"];
  const linhas = leads.map((l) => [
    l.cliente?.nome ?? "",
    l.nome,
    l.status,
    l.temperatura,
    l.valorEstimado != null ? Number(l.valorEstimado) : null,
    l.campanha?.nome ?? "",
    l.responsavel?.name ?? "",
    l.contatos[0]?.contato.nome ?? "",
    l.contatos[0]?.contato.email ?? "",
    l.createdAt.toISOString().slice(0, 10),
  ]);

  return new NextResponse(arquivoCsv(headers, linhas), { headers: headersDownloadCsv("prospeccoes.csv") });
}
