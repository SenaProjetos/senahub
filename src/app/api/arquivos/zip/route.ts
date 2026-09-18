import { NextResponse } from "next/server";
import { ZipArchive } from "archiver";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { resolverCaminho } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";
import { podeVerTodasDisciplinas } from "@/modules/arquivos/acesso";
import { arquivosDaPastaGlobal, MAX_ARQUIVOS_ZIP } from "@/modules/arquivos/arvore-global-queries";
import { registrarAcessoUploads } from "@/modules/uploads/historico/service";

/**
 * Download (.zip) de uma pasta do diretório geral — o recorte da árvore vai na query string
 * (`projetoId`, `disciplinaId`, `fase`, `ext`), não a lista de ids: uma pasta pode ter centenas
 * de arquivos e não caberia na URL.
 *
 * Quem resolve o alcance é `arquivosDaPastaGlobal`, que reconfere `escopoProjeto` e a muralha
 * por disciplina — o id vem da URL, e id de URL não autoriza nada.
 *
 * `/api` fica fora do middleware: a sessão é conferida aqui. Espelha o streaming das outras
 * rotas de zip (`/api/uploads/zip`, `/api/p/arquivos/[token]/zip`) — nada de bufferizar.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (user.mustChangePassword || !user.ativo) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }
  if (!(await can(user, "arquivos", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const projetoId = sp.get("projetoId");
  if (!projetoId) return NextResponse.json({ error: "Informe o projeto." }, { status: 400 });

  const veTodas = await podeVerTodasDisciplinas(user);
  const pacote = await arquivosDaPastaGlobal(user, veTodas, {
    projetoId,
    disciplinaId: sp.get("disciplinaId"),
    fase: sp.get("fase"),
    ext: sp.get("ext"),
  });

  if (!pacote) return NextResponse.json({ error: "Pasta vazia ou sem permissão." }, { status: 404 });
  if (pacote.excedeu) {
    return NextResponse.json(
      {
        error: `Esta pasta tem ${pacote.total} arquivos e o limite por download é ${MAX_ARQUIVOS_ZIP}. Escolha uma fase ou um formato para recortar.`,
      },
      { status: 413 },
    );
  }

  await logAudit({
    userId: user.id,
    modulo: "uploads",
    acao: "download-zip-diretorio",
    resultado: "sucesso",
    entidade: "Projeto",
    entidadeId: projetoId,
    detalhe: { total: pacote.arquivos.length, disciplinaId: sp.get("disciplinaId"), fase: sp.get("fase"), ext: sp.get("ext") },
    ip: await getClientIp(),
  });
  // Sem await: um pacote grande não pode atrasar o início do download. O serviço nunca rejeita
  // (engole e loga), e o servidor é um processo longo — a gravação termina em segundo plano.
  void registrarAcessoUploads({
    uploadIds: pacote.arquivos.map((a) => a.uploadId),
    tipo: "download",
    origem: "interno",
    userId: user.id,
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
      for (const a of pacote.arquivos) {
        try {
          archive.file(resolverCaminho(a.caminho), { name: a.nome });
        } catch {
          // arquivo ausente no disco — ignora, o resto do pacote continua
        }
      }
      void archive.finalize();
    },
  });

  const nome = `${pacote.rotulo}.zip`;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(nome)}"`,
    },
  });
}
