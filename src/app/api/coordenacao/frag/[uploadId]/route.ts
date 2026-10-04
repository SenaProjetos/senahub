import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { resolverCaminho } from "@/lib/storage";
import { parseModeloId } from "@/modules/coordenacao/modelo-ref";
import { MENSAGEM_ACESSO_MODELO as MSG, veModelosDoProjeto } from "@/modules/coordenacao/acesso";
import { registrarAcessoUploads } from "@/modules/uploads/historico/service";

/**
 * Serve o .frag (modelo convertido p/ o viewer 3D) em streaming.
 * A chave (`[uploadId]`) é o modeloId: uploadId cru (IFC de disciplina) ou
 * `d:<documentoVersaoId>` (IFC recebido do cliente).
 * Gate: coordenacao:ver + projeto no escopo da pessoa (`veModelosDoProjeto`) — todo modelo do
 * projeto, de qualquer disciplina ou recebido. ETag por conversão (invalida ao reconverter).
 */
export async function GET(req: Request, ctx: { params: Promise<{ uploadId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: MSG.semSessao }, { status: 401 });
  const user = session.user;
  if (!(await can(user, "coordenacao", "ver"))) {
    return NextResponse.json({ error: MSG.semPermissao }, { status: 403 });
  }
  const { uploadId: modeloId } = await ctx.params;
  const ref = parseModeloId(modeloId);

  // Resolve a conversão e o projeto dono do modelo, conforme a origem.
  let dados: { status: string; caminhoFrag: string | null; concluidoEm: Date | null; projetoId: string | null } | null;

  if (ref.tipo === "documento") {
    const conversao = await prisma.conversaoModelo.findUnique({
      where: { documentoVersaoId: ref.id },
      select: {
        status: true,
        caminhoFrag: true,
        concluidoEm: true,
        documentoVersao: {
          select: { documento: { select: { projetoId: true, proposta: { select: { projetoId: true } } } } },
        },
      },
    });
    const doc = conversao?.documentoVersao?.documento;
    dados = conversao
      ? {
          status: conversao.status,
          caminhoFrag: conversao.caminhoFrag,
          concluidoEm: conversao.concluidoEm,
          projetoId: doc?.projetoId ?? doc?.proposta?.projetoId ?? null,
        }
      : null;
  } else {
    const conversao = await prisma.conversaoModelo.findUnique({
      where: { uploadId: ref.id },
      select: {
        status: true,
        caminhoFrag: true,
        concluidoEm: true,
        upload: { select: { disciplina: { select: { projetoId: true } } } },
      },
    });
    dados =
      conversao && conversao.upload
        ? {
            status: conversao.status,
            caminhoFrag: conversao.caminhoFrag,
            concluidoEm: conversao.concluidoEm,
            projetoId: conversao.upload.disciplina.projetoId,
          }
        : null;
  }

  if (!dados) return NextResponse.json({ error: MSG.naoConvertido }, { status: 404 });
  if (!dados.projetoId) return NextResponse.json({ error: MSG.naoEncontrado }, { status: 404 });
  if (!(await veModelosDoProjeto(user, dados.projetoId))) {
    return NextResponse.json({ error: MSG.foraDoProjeto }, { status: 403 });
  }
  if (dados.status !== "concluido" || !dados.caminhoFrag) {
    return NextResponse.json({ error: MSG.naoConvertido }, { status: 404 });
  }

  // Antes do 304: reabrir a cena com o modelo em cache continua sendo uma visualização.
  // IFC recebido do cliente (`d:`) não é documento de disciplina — fica fora deste histórico.
  if (ref.tipo === "upload") {
    await registrarAcessoUploads({
      uploadIds: [ref.id],
      tipo: "visualizacao",
      origem: "interno",
      userId: user.id,
      via: "ifc",
    });
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
    return NextResponse.json({ error: MSG.arquivoSumiu }, { status: 410 });
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
