import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { salvarArquivo, removerArquivo, nomeArquivoLimpo, lerInicioArquivo } from "@/lib/storage";
import { montarChunksEm, limparChunks } from "@/lib/upload-chunks";
import { ATTACHMENT_EXTENSIONS, validateGeneralAttachment } from "@/lib/upload-policy";

const MAX = 500 * 1024 * 1024; // 500 MB

function extDe(nome: string): string {
  return (nome.includes(".") ? nome.slice(nome.lastIndexOf(".") + 1) : "").toLowerCase();
}

function erroTipo(ext: string) {
  return NextResponse.json(
    { error: `Tipo de arquivo não permitido (.${ext || "sem extensão"}). São aceitos: imagens, PDF, Office, CAD (DWG/DXF/IFC/RVT) e compactados.` },
    { status: 400 },
  );
}

/**
 * Upload de anexo de chat. Retorna metadados p/ enviarMensagem persistir.
 *
 * Dois modos:
 *  - Direto (multipart `file`): um POST só, para arquivos pequenos.
 *  - Chunked (`sessaoId` + `nome`/`total`/`tamanho`/`mime`): os pedaços já foram
 *    enviados para /api/uploads/chunk (por `lib/upload-grande.ts`); aqui só remontamos.
 *    Necessário porque o Cloudflare Tunnel corta requests > ~100 MB na borda.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (user.mustChangePassword || !user.ativo) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const form = await req.formData();
  const canalId = String(form.get("canalId") ?? "");
  if (!canalId) return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });

  const sessaoId = String(form.get("sessaoId") ?? "");

  const membro = await prisma.canalMembro.findUnique({
    where: { canalId_userId: { canalId, userId: user.id } },
  });
  if (!membro) {
    if (sessaoId) await limparChunks(user.id, sessaoId);
    return NextResponse.json({ error: "Você não participa deste canal." }, { status: 403 });
  }

  // ── Modo chunked ──
  if (sessaoId) {
    const nome = nomeArquivoLimpo(String(form.get("nome") ?? "").trim() || "arquivo");
    const total = Number(form.get("total"));
    const tamanhoDeclarado = Number(form.get("tamanho"));
    const ext = extDe(nome);
    if (!ATTACHMENT_EXTENSIONS.has(ext)) {
      await limparChunks(user.id, sessaoId);
      return erroTipo(ext);
    }
    if (Number.isFinite(tamanhoDeclarado) && tamanhoDeclarado > MAX) {
      await limparChunks(user.id, sessaoId);
      return NextResponse.json({ error: "Arquivo muito grande (máximo 500 MB)." }, { status: 400 });
    }
    const sufixo = nome.includes(".") ? nome.slice(nome.lastIndexOf(".")) : "";
    const rel = `chat/${canalId}/${randomBytes(12).toString("hex")}${sufixo}`;
    try {
      // O "tamanho" acima vem do cliente; o limite de verdade é checado contra o
      // tamanho REAL remontado, antes de devolver os metadados.
      const salvo = await montarChunksEm(rel, { userId: user.id, sessaoId, total });
      if (salvo.tamanho > MAX) {
        await removerArquivo(salvo.caminho);
        return NextResponse.json({ error: "Arquivo muito grande (máximo 500 MB)." }, { status: 400 });
      }
      const validado = validateGeneralAttachment(nome, await lerInicioArquivo(rel));
      if (!validado.ok) {
        await removerArquivo(rel);
        return NextResponse.json({ error: validado.error }, { status: 415 });
      }
      return NextResponse.json({ anexoPath: rel, anexoNome: nome, anexoMime: validado.mime });
    } catch (err) {
      console.error("[chat/anexo] falha ao montar chunks:", err);
      await limparChunks(user.id, sessaoId);
      return NextResponse.json({ error: "Falha ao montar o arquivo enviado." }, { status: 400 });
    }
  }

  // ── Modo direto (multipart) ──
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }
  if (file.size > MAX) return NextResponse.json({ error: "Arquivo muito grande (máximo 500 MB)." }, { status: 400 });
  const ext = extDe(file.name);
  if (!ATTACHMENT_EXTENSIONS.has(ext)) return erroTipo(ext);

  const nome = nomeArquivoLimpo(file.name || "arquivo");
  const sufixo = nome.includes(".") ? nome.slice(nome.lastIndexOf(".")) : "";
  const rel = `chat/${canalId}/${randomBytes(12).toString("hex")}${sufixo}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const validado = validateGeneralAttachment(nome, buf);
  if (!validado.ok) return NextResponse.json({ error: validado.error }, { status: 415 });
  await salvarArquivo(rel, buf);

  return NextResponse.json({
    anexoPath: rel,
    anexoNome: nome,
    anexoMime: validado.mime,
  });
}
