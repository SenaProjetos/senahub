import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { salvarArquivo, slug, nomeArquivoLimpo } from "@/lib/storage";
import { lerPlanilha, IMPORT_TAMANHO_MAX } from "@/lib/import/planilha";
import { autoMapear } from "@/lib/import/mapeamento";

/** Upload + parse da planilha (preview). Persiste o arquivo e devolve cabeçalhos + auto-mapeamento. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await can(session.user.role, "financeiro", "gerir"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie um arquivo .xlsx ou .csv." }, { status: 400 });
  }
  if (file.size > IMPORT_TAMANHO_MAX) {
    return NextResponse.json({ error: "Arquivo grande demais (máx. 20 MB)." }, { status: 413 });
  }

  const nomeArquivo = nomeArquivoLimpo(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  let planilha;
  try {
    planilha = await lerPlanilha(buffer, nomeArquivo);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao ler a planilha." },
      { status: 422 },
    );
  }
  if (planilha.headers.length === 0 || planilha.rows.length === 0) {
    return NextResponse.json({ error: "Planilha sem cabeçalho ou sem linhas." }, { status: 422 });
  }

  const caminho = `financeiro/importacao/${randomUUID()}__${slug(nomeArquivo)}`;
  await salvarArquivo(caminho, buffer);

  return NextResponse.json({
    nomeArquivo,
    caminho,
    sheets: planilha.sheets,
    headers: planilha.headers,
    totalLinhas: planilha.rows.length,
    sample: planilha.rows.slice(0, 20),
    autoMap: autoMapear(planilha.headers),
  });
}
