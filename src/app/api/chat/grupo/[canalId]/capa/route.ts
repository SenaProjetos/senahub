import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { salvarArquivo, nomeArquivoLimpo, removerArquivo, lerArquivo, existeArquivo } from "@/lib/storage";
import { emitParaCanal } from "@/lib/socket";

const MAX = 5 * 1024 * 1024; // 5 MB
const EXT_IMG = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const MIME_POR_EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
};
const PODE_MODERAR = ["admin", "supervisor"];

/** Serve a imagem de capa do grupo (qualquer usuário autenticado do chat). */
export async function GET(_req: Request, ctx: { params: Promise<{ canalId: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Não autenticado", { status: 401 });
  const { canalId } = await ctx.params;
  const canal = await prisma.canal.findUnique({ where: { id: canalId }, select: { imagemCapa: true } });
  if (!canal?.imagemCapa || !(await existeArquivo(canal.imagemCapa))) {
    return new Response("Não encontrado", { status: 404 });
  }
  const ext = canal.imagemCapa.slice(canal.imagemCapa.lastIndexOf(".") + 1).toLowerCase();
  const buf = await lerArquivo(canal.imagemCapa);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": MIME_POR_EXT[ext] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=300",
    },
  });
}

/** Upload da imagem de capa de um grupo. Só criador ou admin/supervisor. */
export async function POST(req: Request, ctx: { params: Promise<{ canalId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  const { canalId } = await ctx.params;

  const canal = await prisma.canal.findUnique({ where: { id: canalId } });
  if (!canal || canal.tipo !== "grupo") {
    return NextResponse.json({ error: "Grupo não encontrado." }, { status: 404 });
  }
  const podeGerenciar = canal.criadoPorId === user.id || PODE_MODERAR.includes(user.role);
  if (!podeGerenciar) {
    return NextResponse.json({ error: "Sem permissão para alterar este grupo." }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 });
  }
  if (file.size > MAX) {
    return NextResponse.json({ error: "Imagem muito grande (máximo 5 MB)." }, { status: 400 });
  }
  const ext = (file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".") + 1) : "").toLowerCase();
  if (!EXT_IMG.has(ext)) {
    return NextResponse.json(
      { error: "Formato não aceito. Use JPG, PNG, GIF ou WEBP." },
      { status: 400 },
    );
  }

  const nome = nomeArquivoLimpo(file.name || "capa");
  const sufixo = nome.includes(".") ? nome.slice(nome.lastIndexOf(".")) : "";
  const rel = `chat/capas/${canalId}/${randomBytes(12).toString("hex")}${sufixo}`;
  await salvarArquivo(rel, Buffer.from(await file.arrayBuffer()));

  if (canal.imagemCapa) void removerArquivo(canal.imagemCapa);
  await prisma.canal.update({ where: { id: canalId }, data: { imagemCapa: rel, icone: null } });
  emitParaCanal(canalId, "grupo-atualizado", { canalId, icone: null, imagemCapa: rel });

  return NextResponse.json({ imagemCapa: rel });
}
