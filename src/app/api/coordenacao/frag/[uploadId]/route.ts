import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { acessoGlobal } from "@/lib/roles";
import { can } from "@/lib/permissions";
import { resolverCaminho } from "@/lib/storage";

/**
 * Serve o .frag (modelo convertido p/ o viewer 3D) em streaming.
 * Gate: coordenacao:ver + mesma regra de acesso do download de upload
 * (global OU responsável da disciplina OU membro do projeto).
 * ETag por conversão (uploadId + concluidoEm) — reconverter invalida o cache.
 */
export async function GET(req: Request, ctx: { params: Promise<{ uploadId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (!(await can(user.role, "coordenacao", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const { uploadId } = await ctx.params;

  const conversao = await prisma.conversaoModelo.findUnique({
    where: { uploadId },
    select: {
      status: true,
      caminhoFrag: true,
      concluidoEm: true,
      upload: {
        select: {
          disciplina: {
            select: {
              responsaveis: { select: { userId: true } },
              projeto: { select: { membros: { select: { userId: true } } } },
            },
          },
        },
      },
    },
  });
  if (!conversao || conversao.status !== "concluido" || !conversao.caminhoFrag) {
    return NextResponse.json({ error: "Modelo não convertido." }, { status: 404 });
  }

  const { disciplina } = conversao.upload;
  const ehGlobal = acessoGlobal(user);
  const ehResp = disciplina.responsaveis.some((r) => r.userId === user.id);
  const ehMembro = disciplina.projeto.membros.some((m) => m.userId === user.id);
  if (!ehGlobal && !ehResp && !ehMembro) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const etag = `"${uploadId}-${conversao.concluidoEm?.getTime() ?? 0}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  let caminhoAbs: string;
  let tamanho: number;
  try {
    caminhoAbs = resolverCaminho(conversao.caminhoFrag);
    tamanho = (await stat(caminhoAbs)).size;
  } catch {
    return NextResponse.json({ error: "Modelo indisponível no disco." }, { status: 410 });
  }

  const stream = Readable.toWeb(createReadStream(caminhoAbs)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(tamanho),
      ETag: etag,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
