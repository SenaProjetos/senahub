import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/session";
import { salvarArquivo, nomeArquivoLimpo } from "@/lib/storage";

const MAX = 25 * 1024 * 1024;

/**
 * Recebe um anexo de lead (proposta, e-mail de solicitação, referências) e
 * devolve os metadados para a action `adicionarAnexoLead` persistir. Guarda o
 * arquivo em `comercial/leads/` sob STORAGE_BASE_PATH. Gate: `comercial:gerir`.
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

  const nome = nomeArquivoLimpo(file.name || "arquivo");
  const ext = nome.includes(".") ? nome.slice(nome.lastIndexOf(".")) : "";
  const rel = `comercial/leads/${randomBytes(12).toString("hex")}${ext}`;
  const salvo = await salvarArquivo(rel, Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({
    caminho: salvo.caminho,
    nomeArquivo: nome,
    mime: file.type || "application/octet-stream",
    tamanho: salvo.tamanho,
    hashSha256: salvo.hashSha256,
  });
}
