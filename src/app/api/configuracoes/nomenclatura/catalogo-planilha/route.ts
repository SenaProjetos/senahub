import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { lerPlanilha, IMPORT_TAMANHO_MAX } from "@/lib/import/planilha";
import { lerPlanilhaCatalogo } from "@/modules/projetos/nomenclatura/catalogo/planilha";
import { planejarImportacao } from "@/modules/projetos/nomenclatura/catalogo/importacao";
import { carregarCatalogoSnap, numerosDasVersoes } from "@/modules/projetos/nomenclatura/catalogo/queries";

/**
 * Lê a planilha do padrão de disciplinas (CARD/SUB) e devolve a PRÉVIA do que a importação faria na
 * versão — não grava nada. Quem grava é a action `aplicarImportacaoCatalogo`, que recalcula o plano
 * a partir das linhas lidas aqui. Rota própria só porque é upload (multipart); `/api` fica fora do
 * middleware, então a rota se autentica sozinha.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await can(session.user, "configuracoes", "gerir"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const versao = Number(form.get("versao"));
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie um arquivo .xlsx ou .csv." }, { status: 400 });
  }
  if (file.size > IMPORT_TAMANHO_MAX) {
    return NextResponse.json({ error: "Arquivo grande demais (máx. 20 MB)." }, { status: 413 });
  }
  if (!Number.isInteger(versao) || !(await prisma.nomenclaturaVersao.findUnique({ where: { numero: versao }, select: { id: true } }))) {
    return NextResponse.json({ error: "Versão do padrão não encontrada." }, { status: 400 });
  }

  let matriz: string[][];
  try {
    const planilha = await lerPlanilha(Buffer.from(await file.arrayBuffer()), file.name);
    matriz = [planilha.headers, ...planilha.rows];
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao ler a planilha." }, { status: 422 });
  }

  const lida = lerPlanilhaCatalogo(matriz);
  const [snap, versoes] = await Promise.all([carregarCatalogoSnap(), numerosDasVersoes()]);
  const plano = planejarImportacao(snap, versao, lida, { versoesExistentes: versoes });
  return NextResponse.json({
    nomeArquivo: file.name,
    linhas: lida.linhas,
    plano: { ...plano, erros: [...lida.erros, ...plano.erros] },
  });
}
