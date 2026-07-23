import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { resolverCaminho } from "@/lib/storage";
import { resolverAcessoDesenho } from "@/modules/dwg/acesso";

/**
 * Serve o .dxf (DWG convertido) em streaming, texto puro — o client parseia com
 * `dxf-parser` (import dinâmico, ver dwg-viewer.tsx).
 * A chave (`[desenhoId]`) é o desenhoId: uploadId cru (DWG de disciplina) ou
 * `d:<documentoVersaoId>` (DWG recebido do cliente). Autorização resolvida por
 * `resolverAcessoDesenho` (fonte única, compartilhada com o probe de status) —
 * NÃO reaproveita o gate `coordenacao:ver` do .frag (BIM-específico, errado aqui).
 * ETag por conversão (invalida ao reconverter).
 */
export async function GET(req: Request, ctx: { params: Promise<{ desenhoId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { desenhoId } = await ctx.params;

  const dados = await resolverAcessoDesenho(session.user, desenhoId);
  if (!dados || dados.status !== "concluido" || !dados.caminhoDxf) {
    return NextResponse.json({ error: "Desenho não convertido." }, { status: 404 });
  }
  if (!dados.autorizado) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const etag = `"${desenhoId}-${dados.concluidoEm?.getTime() ?? 0}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  let caminhoAbs: string;
  let tamanho: number;
  try {
    caminhoAbs = resolverCaminho(dados.caminhoDxf);
    tamanho = (await stat(caminhoAbs)).size;
  } catch {
    return NextResponse.json({ error: "Desenho indisponível no disco." }, { status: 410 });
  }

  const stream = Readable.toWeb(createReadStream(caminhoAbs)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Length": String(tamanho),
      ETag: etag,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
