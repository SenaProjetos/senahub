import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { empresasParaExport } from "@/modules/comercial/exportacao";
import { arquivoCsv, headersDownloadCsv } from "@/lib/export/csv";
import type { StatusComercialCliente } from "@/generated/prisma/client";

/**
 * Export CSV de Empresas (F4.6) — mesmos filtros de `/clientes` (mesmas chaves de URL).
 *
 * Gate é `clientes:gerir`, NÃO `comercial:gerir` — de propósito, e diferente das outras 3
 * rotas deste F4.6. Os dados exportados são `Cliente` e o botão que dispara isto vive em
 * `clientes-view.tsx`, atrás de `can(user, "clientes", "gerir")`; gatear a ROTA por
 * `comercial:gerir` deixaria as duas pontas discordando — um papel com um dos dois recursos
 * mas não o outro veria o botão e cairia num 403 em JSON cru, ou o contrário. Se um dia esta
 * exportação ganhar filtro/coluna vindo do domínio Comercial, revisitar os dois lados juntos.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await can(session.user, "clientes", "gerir"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const tipo = sp.get("tipo");
  const situacao = sp.get("situacao");
  const clientes = await empresasParaExport({
    q: sp.get("q") || undefined,
    tipo: tipo === "PF" || tipo === "PJ" ? tipo : undefined,
    uf: sp.get("uf") || undefined,
    cidade: sp.get("cidade") || undefined,
    categoria: sp.get("categoria") || undefined,
    situacao: situacao === "ativo" || situacao === "inativo" ? situacao : undefined,
    segmentoId: sp.get("segmentoId") || undefined,
    status: (sp.get("status") as StatusComercialCliente | null) || undefined,
    listaSalesNavigator: sp.get("listaSN") === "1" ? true : undefined,
    // Mesma regra de `/clientes/page.tsx`: sem `situacao` na URL, a TELA mostra ativos e
    // inativos — sem isto o export divergiria do que a pessoa está olhando (o ponto inteiro
    // do F4.6 é "respeita o filtro ativo", nunca menos linhas que a tela por um default diferente).
    incluirInativos: true,
    sort: sp.get("sort") || undefined,
    dir: sp.get("dir") === "desc" ? "desc" : "asc",
  });

  // Só campos da EMPRESA — nenhuma coluna de contato aqui de propósito (F4.6/advisor): um
  // "contato principal" nesta lista seria uma leitura aninhada de `ContatoCliente` fora da
  // extensão de soft delete E fora do gate de opt-out — a exportação de PESSOAS é a rota
  // `/export/contatos`, que já nasce com os dois cuidados.
  const headers = ["Nome", "Documento", "Tipo", "Status comercial", "Cidade", "UF", "E-mail", "Telefone", "Lista SN"];
  const linhas = clientes.map((c) => [
    c.nome,
    c.documento,
    c.tipo,
    c.status,
    c.cidade,
    c.uf,
    c.email,
    c.telefone,
    c.listaSalesNavigator,
  ]);

  return new NextResponse(arquivoCsv(headers, linhas), { headers: headersDownloadCsv("empresas.csv") });
}
