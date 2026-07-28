import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/session";
import { salvarArquivo, nomeArquivoLimpo } from "@/lib/storage";
import { IMPORT_TAMANHO_MAX } from "@/lib/import/planilha";

/**
 * Recebe o workbook "Referência" do SINAPI (.xlsx) e devolve o caminho salvo — a action
 * `iniciarImportacaoBase` enfileira o job a partir dele. Gate: `custos:bancos` (base
 * corrompida contamina todo orçamento, por isso separado de `custos:gerir`).
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { can } = await import("@/lib/permissions");
  if (!(await can(session.user.role, "custos", "bancos"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) {
    return NextResponse.json({ error: "Envie o arquivo .xlsx (workbook Referência do SINAPI)." }, { status: 400 });
  }
  if (file.size > IMPORT_TAMANHO_MAX) {
    return NextResponse.json({ error: "Arquivo grande demais (máx. 20 MB)." }, { status: 400 });
  }

  const nome = nomeArquivoLimpo(file.name);
  const rel = `custos/importacoes/${randomBytes(12).toString("hex")}.xlsx`;
  const salvo = await salvarArquivo(rel, Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ caminho: salvo.caminho, nomeArquivo: nome, tamanho: salvo.tamanho });
}
