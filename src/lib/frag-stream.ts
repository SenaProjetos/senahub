import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { resolverCaminho } from "@/lib/storage";

const MENSAGEM_ARQUIVO_SUMIU = "O arquivo convertido deste modelo não está mais no servidor.";

/**
 * Serve um `.frag` (modelo convertido para o visualizador 3D) em streaming, com ETag por conversão: `chave` é o
 * modeloId e `concluidoEm` muda ao reconverter, então o cache do navegador cai sozinho. `If-None-Match` igual → 304.
 * Arquivo fora do disco (ou um diretório no lugar dele) → 410 (sem cache). Quem chama já decidiu o acesso (rota da
 * Coordenação e rota do portal). `aoServir` roda só quando o modelo vai mesmo para o navegador (200 ou 304 — reabrir
 * com o modelo em cache continua sendo uma visualização), e uma falha nele nunca derruba o download.
 */
export async function servirFrag(
  req: Request,
  caminhoFrag: string,
  concluidoEm: Date | null,
  chave: string,
  mensagemArquivoSumiu: string = MENSAGEM_ARQUIVO_SUMIU,
  aoServir?: () => Promise<void>,
): Promise<NextResponse> {
  let caminhoAbs: string;
  let tamanho: number;
  try {
    caminhoAbs = resolverCaminho(caminhoFrag);
    const info = await stat(caminhoAbs);
    if (!info.isFile()) throw new Error("não é arquivo");
    tamanho = info.size;
  } catch {
    // `no-store`: o 410 é guardável por padrão no HTTP, e "Tentar de novo" leria a falha do cache do navegador.
    return NextResponse.json({ error: mensagemArquivoSumiu }, { status: 410, headers: { "Cache-Control": "no-store" } });
  }

  if (aoServir) {
    try {
      await aoServir();
    } catch (e) {
      console.error("[frag] registro do acesso ao modelo falhou:", e);
    }
  }

  const etag = `"${chave}-${concluidoEm?.getTime() ?? 0}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
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
