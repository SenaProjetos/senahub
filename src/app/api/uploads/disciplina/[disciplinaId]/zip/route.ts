import { NextResponse } from "next/server";
import { ZipArchive } from "archiver";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { acessoGlobal } from "@/lib/roles";
import { resolverCaminho } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";

export async function GET(_req: Request, ctx: { params: Promise<{ disciplinaId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  const { disciplinaId } = await ctx.params;

  const disciplina = await prisma.disciplina.findUnique({
    where: { id: disciplinaId },
    include: {
      uploads: true,
      responsaveis: { select: { userId: true } },
      projeto: { select: { codigo: true, membros: { select: { userId: true } } } },
    },
  });
  if (!disciplina) return NextResponse.json({ error: "Disciplina não encontrada." }, { status: 404 });

  const ehGlobal = acessoGlobal(user);
  const ehResp = disciplina.responsaveis.some((r) => r.userId === user.id);
  const ehMembro = disciplina.projeto.membros.some((m) => m.userId === user.id);
  // Mesmo escopo da aba Arquivos (escopoProjeto): responsável de QUALQUER disciplina
  // do projeto enxerga e baixa as demais disciplinas — não só a que responde.
  let ehRespProjeto = false;
  if (!ehGlobal && !ehResp && !ehMembro) {
    ehRespProjeto =
      (await prisma.disciplina.count({
        where: { projetoId: disciplina.projetoId, responsaveis: { some: { userId: user.id } } },
      })) > 0;
  }
  if (!ehGlobal && !ehResp && !ehMembro && !ehRespProjeto) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  if (disciplina.uploads.length === 0) {
    return NextResponse.json({ error: "Sem arquivos." }, { status: 404 });
  }

  await logAudit({
    userId: user.id,
    modulo: "uploads",
    acao: "download-zip",
    resultado: "sucesso",
    entidade: "Disciplina",
    entidadeId: disciplinaId,
    ip: await getClientIp(),
  });

  const entradas = disciplina.uploads.map((u) => ({
    caminho: u.caminho,
    nome: `${u.pacote}/${u.nomeArquivo}`,
  }));

  // ReadableStream Web nativo alimentado pelo archiver (App Router aceita direto).
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

  const nome = `${disciplina.projeto.codigo}_${disciplina.nome}.zip`;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(nome)}"`,
    },
  });
}
