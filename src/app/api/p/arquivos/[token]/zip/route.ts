import { NextResponse } from "next/server";
import { ZipArchive } from "archiver";
import { uploadsDoLinkParaZip } from "@/modules/projetos/arquivos/link-publico";
import { resolverCaminho } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";

/**
 * Download público (.zip) dos arquivos de um link somente-leitura. Sem `?disciplinaId`
 * empacota tudo que o link libera; com ele, restringe a uma disciplina (que precisa
 * estar na whitelist). Espelha o streaming de `/api/uploads/disciplina/[id]/zip`.
 */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const disciplinaId = new URL(req.url).searchParams.get("disciplinaId") ?? undefined;

  const pacote = await uploadsDoLinkParaZip(token, disciplinaId);
  if (!pacote) return NextResponse.json({ error: "Arquivos indisponíveis." }, { status: 404 });

  await logAudit({
    modulo: "uploads",
    acao: "download-link-publico-zip",
    resultado: "sucesso",
    entidade: "Projeto",
    detalhe: { token, disciplinaId },
    ip: await getClientIp(),
  });

  const archive = new ZipArchive({ zlib: { level: 6 } });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      archive.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      archive.on("end", () => controller.close());
      archive.on("warning", (err) => console.warn("[zip] warning:", err));
      archive.on("error", (err) => {
        console.error("[zip] erro no archiver:", err);
        controller.error(err);
      });
      for (const e of pacote.entradas) {
        try {
          archive.file(resolverCaminho(e.caminho), { name: e.nome });
        } catch {
          // arquivo ausente no disco — ignora
        }
      }
      void archive.finalize();
    },
  });

  const nome = `${pacote.codigo}_arquivos.zip`;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(nome)}"`,
    },
  });
}
