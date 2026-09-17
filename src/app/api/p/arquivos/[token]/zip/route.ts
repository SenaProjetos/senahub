import { NextResponse } from "next/server";
import { ZipArchive } from "archiver";
import { uploadsDoLinkParaZip } from "@/modules/projetos/arquivos/link-publico";
import { resolverCaminho } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";
import { registrarAcessoUploads } from "@/modules/uploads/historico/service";

/**
 * Download público (.zip) dos arquivos de um link somente-leitura. Sem parâmetro empacota tudo
 * que o link libera; `disciplinaId`, `fase` e `ext` recortam uma pasta da árvore que o cliente
 * vê (disciplina → fase → formato). Espelha o streaming de `/api/uploads/disciplina/[id]/zip`.
 *
 * Os três parâmetros só RECORTAM o que o token já libera — quem resolve o alcance continua
 * sendo `uploadsDoLinkParaZip`, que aplica a whitelist e o recorte antes de montar as pastas.
 */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const disciplinaId = sp.get("disciplinaId") ?? undefined;
  const fase = sp.get("fase") ?? undefined;
  const ext = sp.get("ext") ?? undefined;

  const pacote = await uploadsDoLinkParaZip(token, { disciplinaId, fase, ext });
  if (!pacote) return NextResponse.json({ error: "Arquivos indisponíveis." }, { status: 404 });

  await logAudit({
    modulo: "uploads",
    acao: "download-link-publico-zip",
    resultado: "sucesso",
    entidade: "Projeto",
    detalhe: { token, disciplinaId, fase, ext },
    ip: await getClientIp(),
  });
  // Sem await: um pacote grande não pode atrasar o início do download. O serviço nunca rejeita
  // (engole e loga), e o servidor é um processo longo — a gravação termina em segundo plano.
  void registrarAcessoUploads({
    uploadIds: pacote.entradas.map((e) => e.uploadId),
    tipo: "download",
    origem: "link_publico",
    userId: null,
    linkId: pacote.linkId,
    via: "zip",
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

  // O nome do arquivo acompanha a pasta pedida, senão três downloads diferentes chegam na
  // pasta de Downloads do cliente com o mesmo nome.
  const sufixo = [disciplinaId ? "disciplina" : null, fase ? "fase" : null, ext ? ext.replace("__outros__", "outros") : null]
    .filter(Boolean)
    .join("-");
  const nome = `${pacote.codigo}_arquivos${sufixo ? `_${sufixo}` : ""}.zip`;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(nome)}"`,
    },
  });
}
