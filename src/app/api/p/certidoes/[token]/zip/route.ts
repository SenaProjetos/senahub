import { NextResponse } from "next/server";
import { ZipArchive } from "archiver";
import { certidoesDoLinkParaZip } from "@/modules/certidoes/link-publico";
import { resolverCaminho } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";

/** Download público (.zip) de todas as certidões liberadas por um link somente-leitura. */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  const entradas = await certidoesDoLinkParaZip(token);
  if (!entradas) return NextResponse.json({ error: "Certidões indisponíveis." }, { status: 404 });

  await logAudit({
    modulo: "certidoes",
    acao: "download-link-publico-zip",
    resultado: "sucesso",
    entidade: "LinkPublicoCertidoes",
    detalhe: { token },
    ip: await getClientIp(),
  });

  const archive = new ZipArchive({ zlib: { level: 6 } });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      archive.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      archive.on("end", () => controller.close());
      archive.on("warning", (err) => console.warn("[certidoes-zip-publico] warning:", err));
      archive.on("error", (err) => {
        console.error("[certidoes-zip-publico] erro no archiver:", err);
        controller.error(err);
      });
      for (const e of entradas) {
        try {
          archive.file(resolverCaminho(e.caminho), { name: e.nome });
        } catch {
          // arquivo ausente no disco — ignora
        }
      }
      void archive.finalize();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="certidoes.zip"`,
    },
  });
}
