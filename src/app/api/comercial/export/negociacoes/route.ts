import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { lerFiltros } from "@/modules/comercial/filtros";
import { negociacoesParaExport } from "@/modules/comercial/exportacao";
import { arquivoCsv, headersDownloadCsv } from "@/lib/export/csv";

/**
 * Export CSV de Negociações (F4.6) — mesmo `where` do board (`whereNegociacao`), mesmas
 * chaves de URL de `/comercial/negociacoes`.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await can(session.user, "comercial", "gerir"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const filtros = lerFiltros(Object.fromEntries(new URL(req.url).searchParams));
  const negociacoes = await negociacoesParaExport(filtros, new Date());

  const headers = [
    "Empresa", "Negociação", "Estágio", "Temperatura", "Valor estimado", "Valor proposto",
    "Valor negociado", "Campanha", "Responsável", "Contato principal", "E-mail", "Criado em",
  ];
  const linhas = negociacoes.map((n) => [
    n.cliente.nome,
    n.titulo,
    n.estagio,
    n.temperatura,
    n.valorEstimado != null ? Number(n.valorEstimado) : null,
    n.valorProposto != null ? Number(n.valorProposto) : null,
    n.valorNegociado != null ? Number(n.valorNegociado) : null,
    n.campanha?.nome ?? "",
    n.responsavel?.name ?? "",
    n.contatos[0]?.contato.nome ?? "",
    n.contatos[0]?.contato.email ?? "",
    n.createdAt.toISOString().slice(0, 10),
  ]);

  return new NextResponse(arquivoCsv(headers, linhas), { headers: headersDownloadCsv("negociacoes.csv") });
}
