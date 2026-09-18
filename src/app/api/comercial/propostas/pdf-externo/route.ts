import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/session";
import { salvarArquivo, nomeArquivoLimpo } from "@/lib/storage";
import { PASTA_PDF_EXTERNO, ehPdf } from "@/modules/comercial/proposta-externa";

const MAX = 25 * 1024 * 1024;

/**
 * Recebe o PDF de uma proposta montada fora do sistema (ADR-0005) e devolve os metadados para a
 * action `registrarVersaoExterna` gravar na versão. Só PDF — conferido pelo CONTEÚDO (`%PDF-`),
 * não pelo `type` que o navegador informa. Gate: `comercial:gerir`.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { can } = await import("@/lib/permissions");
  if (!(await can(session.user, "comercial", "gerir"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Arquivo muito grande (máx 25 MB)." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!ehPdf(buffer)) {
    return NextResponse.json({ error: "Envie o arquivo em PDF. Exporte o Word como PDF antes de anexar." }, { status: 400 });
  }

  const salvo = await salvarArquivo(`${PASTA_PDF_EXTERNO}${randomBytes(12).toString("hex")}.pdf`, buffer);
  return NextResponse.json({
    caminho: salvo.caminho,
    nomeArquivo: nomeArquivoLimpo(file.name || "proposta.pdf"),
    tamanho: salvo.tamanho,
    hashSha256: salvo.hashSha256,
  });
}
