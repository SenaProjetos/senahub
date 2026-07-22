import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { acessoGlobal } from "@/lib/roles";
import { can } from "@/lib/permissions";
import { resolverCaminho } from "@/lib/storage";
import { parseModeloId } from "@/modules/coordenacao/modelo-ref";

/**
 * Serve o .frag (modelo convertido p/ o viewer 3D) em streaming.
 * A chave (`[uploadId]`) é o modeloId: uploadId cru (IFC de disciplina) ou
 * `d:<documentoVersaoId>` (IFC recebido do cliente).
 * Gate: coordenacao:ver + acesso ao modelo (disciplina: global/responsável/membro;
 * recebido: global/membro do projeto). ETag por conversão (invalida ao reconverter).
 */
export async function GET(req: Request, ctx: { params: Promise<{ uploadId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (!(await can(user.role, "coordenacao", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const { uploadId: modeloId } = await ctx.params;
  const ref = parseModeloId(modeloId);
  const ehGlobal = acessoGlobal(user);

  // Resolve a conversão + autorização, conforme a origem do modelo.
  let dados: { status: string; caminhoFrag: string | null; concluidoEm: Date | null; autorizado: boolean } | null;

  if (ref.tipo === "documento") {
    const conversao = await prisma.conversaoModelo.findUnique({
      where: { documentoVersaoId: ref.id },
      select: {
        status: true,
        caminhoFrag: true,
        concluidoEm: true,
        documentoVersao: {
          select: {
            documento: {
              select: {
                projeto: { select: { membros: { select: { userId: true } } } },
                proposta: { select: { projeto: { select: { membros: { select: { userId: true } } } } } },
              },
            },
          },
        },
      },
    });
    if (!conversao) {
      dados = null;
    } else {
      const doc = conversao.documentoVersao?.documento;
      const membros = doc?.projeto?.membros ?? doc?.proposta?.projeto?.membros ?? [];
      const ehMembro = membros.some((m) => m.userId === user.id);
      dados = {
        status: conversao.status,
        caminhoFrag: conversao.caminhoFrag,
        concluidoEm: conversao.concluidoEm,
        autorizado: ehGlobal || ehMembro,
      };
    }
  } else {
    const conversao = await prisma.conversaoModelo.findUnique({
      where: { uploadId: ref.id },
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
    if (!conversao || !conversao.upload) {
      dados = null;
    } else {
      const { disciplina } = conversao.upload;
      const ehResp = disciplina.responsaveis.some((r) => r.userId === user.id);
      const ehMembro = disciplina.projeto.membros.some((m) => m.userId === user.id);
      dados = {
        status: conversao.status,
        caminhoFrag: conversao.caminhoFrag,
        concluidoEm: conversao.concluidoEm,
        autorizado: ehGlobal || ehResp || ehMembro,
      };
    }
  }

  if (!dados || dados.status !== "concluido" || !dados.caminhoFrag) {
    return NextResponse.json({ error: "Modelo não convertido." }, { status: 404 });
  }
  if (!dados.autorizado) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const etag = `"${modeloId}-${dados.concluidoEm?.getTime() ?? 0}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  let caminhoAbs: string;
  let tamanho: number;
  try {
    caminhoAbs = resolverCaminho(dados.caminhoFrag);
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
