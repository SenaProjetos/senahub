import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { salvarArquivo, nomeArquivoLimpo } from "@/lib/storage";
import { montarChunksEm, limparChunks } from "@/lib/upload-chunks";
import { TAMANHO_MAX, TAMANHO_MAX_LABEL } from "@/modules/uploads/limites";
import { podeGerirDocumento } from "@/modules/documentos-cliente/acesso";

/**
 * Upload multipart de um documento do cliente. Grava em disco e devolve `meta`
 * (a action `criarDocumento`/`adicionarVersaoDocumento` cria o registro). Agrupa
 * o arquivo por cliente no disco quando a âncora é conhecida.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Falha ao receber o arquivo." }, { status: 413 });
  }

  // Acesso por âncora (proposta → comercial; projeto → membro interno/global).
  // `origem=interno` (repositório "Geral") gateia por `arquivos_gerais` — ver acesso.ts.
  const propostaId = String(form.get("propostaId") ?? "");
  const projetoId = String(form.get("projetoId") ?? "");
  const origem = String(form.get("origem") ?? "") || undefined;
  if (!(await podeGerirDocumento(session.user, { propostaId: propostaId || null, projetoId: projetoId || null }, origem))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  // Modo chunked (arquivos grandes) traz metadados nos campos; o modo direto traz o File.
  const sessaoId = String(form.get("sessaoId") ?? "");
  const file = form.get("file");
  const chunked = !!sessaoId;
  if (!chunked && !(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });

  const nomeOriginal = chunked ? String(form.get("nome") ?? "") : (file as File).name;
  const mime = chunked ? String(form.get("mime") ?? "") || "application/octet-stream" : (file as File).type || "application/octet-stream";
  const tamanhoDireto = chunked ? Number(form.get("tamanho")) : (file as File).size;
  if (Number.isFinite(tamanhoDireto) && tamanhoDireto > TAMANHO_MAX) {
    if (chunked) await limparChunks(session.user.id, sessaoId);
    return NextResponse.json({ error: `Arquivo excede ${TAMANHO_MAX_LABEL}.` }, { status: 413 });
  }

  // Resolve o cliente (p/ agrupar em disco) a partir da âncora, se veio.
  let clienteId = String(form.get("clienteId") ?? "");
  if (!clienteId && propostaId) {
    clienteId = (await prisma.proposta.findUnique({ where: { id: propostaId }, select: { clienteId: true } }))?.clienteId ?? "";
  }
  if (!clienteId && projetoId) {
    clienteId = (await prisma.projeto.findUnique({ where: { id: projetoId }, select: { clienteId: true } }))?.clienteId ?? "";
  }

  const nome = nomeArquivoLimpo(nomeOriginal || "arquivo");
  const ext = nome.includes(".") ? nome.slice(nome.lastIndexOf(".")) : "";
  const rel = `documentos/${clienteId || "geral"}/${randomBytes(12).toString("hex")}${ext}`;

  let salvo;
  try {
    salvo = chunked
      ? await montarChunksEm(rel, { userId: session.user.id, sessaoId, total: Number(form.get("total")) })
      : await salvarArquivo(rel, Buffer.from(await (file as File).arrayBuffer()));
  } catch (err) {
    console.error("[documentos] falha ao gravar:", err);
    if (chunked) await limparChunks(session.user.id, sessaoId);
    return NextResponse.json({ error: "Falha ao gravar o arquivo enviado." }, { status: 500 });
  }

  return NextResponse.json({
    caminho: salvo.caminho,
    nomeArquivo: nome,
    mime,
    tamanho: salvo.tamanho,
    hashSha256: salvo.hashSha256,
  });
}
