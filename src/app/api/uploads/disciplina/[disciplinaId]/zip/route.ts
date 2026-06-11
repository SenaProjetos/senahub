import { NextResponse } from "next/server";
import { createRequire } from "node:module";
import { PassThrough } from "node:stream";

const require = createRequire(import.meta.url);
const archiver = require("archiver") as (
  format: string,
  options?: { zlib?: { level?: number } },
) => import("archiver").Archiver;
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { GLOBAL_ROLES } from "@/lib/roles";
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

  const ehGlobal = user.role === "admin" || GLOBAL_ROLES.includes(user.role);
  const ehResp = disciplina.responsaveis.some((r) => r.userId === user.id);
  const ehMembro = disciplina.projeto.membros.some((m) => m.userId === user.id);
  if (!ehGlobal && !ehResp && !ehMembro) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  if (disciplina.uploads.length === 0) {
    return NextResponse.json({ error: "Sem arquivos." }, { status: 404 });
  }

  const archive = archiver("zip", { zlib: { level: 6 } });
  const pass = new PassThrough();
  archive.pipe(pass);

  for (const u of disciplina.uploads) {
    try {
      archive.file(resolverCaminho(u.caminho), { name: `${u.pacote}/${u.nomeArquivo}` });
    } catch {
      // arquivo ausente no disco — ignora
    }
  }
  archive.finalize();

  await logAudit({
    userId: user.id,
    modulo: "uploads",
    acao: "download-zip",
    resultado: "sucesso",
    entidade: "Disciplina",
    entidadeId: disciplinaId,
    ip: await getClientIp(),
  });

  const nome = `${disciplina.projeto.codigo}_${disciplina.nome}.zip`;
  return new NextResponse(pass as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(nome)}"`,
    },
  });
}
