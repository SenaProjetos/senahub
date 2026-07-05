import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { salvarArquivo, nomeArquivoLimpo } from "@/lib/storage";
import { TAMANHO_MAX, TAMANHO_MAX_LABEL } from "@/modules/uploads/limites";

/**
 * Upload multipart de um documento do cliente. Grava em disco e devolve `meta`
 * (a action `criarDocumento`/`adicionarVersaoDocumento` cria o registro). Agrupa
 * o arquivo por cliente no disco quando a âncora é conhecida.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  // Fase 1: gate reusa `comercial:gerir` (mesma regra dos antigos anexos de proposta).
  if (!(await can(session.user.role, "comercial", "gerir"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Falha ao receber o arquivo." }, { status: 413 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  if (file.size > TAMANHO_MAX) {
    return NextResponse.json({ error: `Arquivo excede ${TAMANHO_MAX_LABEL}.` }, { status: 413 });
  }

  // Resolve o cliente (p/ agrupar em disco) a partir da âncora, se veio.
  const propostaId = String(form.get("propostaId") ?? "");
  const projetoId = String(form.get("projetoId") ?? "");
  let clienteId = String(form.get("clienteId") ?? "");
  if (!clienteId && propostaId) {
    clienteId = (await prisma.proposta.findUnique({ where: { id: propostaId }, select: { clienteId: true } }))?.clienteId ?? "";
  }
  if (!clienteId && projetoId) {
    clienteId = (await prisma.projeto.findUnique({ where: { id: projetoId }, select: { clienteId: true } }))?.clienteId ?? "";
  }

  const nome = nomeArquivoLimpo(file.name || "arquivo");
  const ext = nome.includes(".") ? nome.slice(nome.lastIndexOf(".")) : "";
  const rel = `documentos/${clienteId || "geral"}/${randomBytes(12).toString("hex")}${ext}`;
  const salvo = await salvarArquivo(rel, Buffer.from(await file.arrayBuffer()));

  return NextResponse.json({
    caminho: salvo.caminho,
    nomeArquivo: nome,
    mime: file.type || "application/octet-stream",
    tamanho: salvo.tamanho,
    hashSha256: salvo.hashSha256,
  });
}
