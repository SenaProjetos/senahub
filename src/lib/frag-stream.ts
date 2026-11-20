import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { resolverCaminho } from "@/lib/storage";

const MENSAGEM_ARQUIVO_SUMIU = "O arquivo convertido deste modelo não está mais no servidor.";

/**
 * Serve um `.frag` (modelo convertido para o visualizador 3D) em streaming, com ETag por conversão: `chave` é o
 * modeloId e `concluidoEm` muda ao reconverter, então o cache do navegador cai sozinho. `If-None-Match` igual → 304.
 * Arquivo fora do disco → 410. Quem chama já decidiu o acesso (rota da Coordenação e rota do portal).
 */
export async function servirFrag(
  req: Request,
  caminhoFrag: string,
  concluidoEm: Date | null,
  chave: string,
  mensagemArquivoSumiu: string = MENSAGEM_ARQUIVO_SUMIU,
): Promise<NextResponse> {
  const etag = `"${chave}-${concluidoEm?.getTime() ?? 0}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  let caminhoAbs: string;
  let tamanho: number;
  try {
    caminhoAbs = resolverCaminho(caminhoFrag);
    tamanho = (await stat(caminhoAbs)).size;
  } catch {
    return NextResponse.json({ error: mensagemArquivoSumiu }, { status: 410 });
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
