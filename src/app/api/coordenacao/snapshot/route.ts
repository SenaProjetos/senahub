import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { salvarArquivo } from "@/lib/storage";

const MAX = 2 * 1024 * 1024; // 2 MB — snapshot de canvas comprimido em PNG

/**
 * Anexa o snapshot (PNG do canvas 3D) a um apontamento já criado — criação em
 * dois passos: a action cria a linha e retorna o id, o client renderiza a
 * câmera capturada e envia o PNG aqui (multipart: bodySizeLimit de Server
 * Action estouraria com um blob de imagem).
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (!(await can(user.role, "coordenacao", "gerir"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const form = await req.formData();
  const apontamentoId = String(form.get("apontamentoId") ?? "");
  const file = form.get("file");
  if (!apontamentoId || !(file instanceof File)) {
    return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });
  }
  if (file.size > MAX) {
    return NextResponse.json({ error: "Snapshot muito grande." }, { status: 400 });
  }

  const apontamento = await prisma.apontamentoCoordenacao.findUnique({
    where: { id: apontamentoId },
    select: { id: true, projetoId: true, autorId: true },
  });
  if (!apontamento) return NextResponse.json({ error: "Apontamento não encontrado." }, { status: 404 });
  if (apontamento.autorId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Só quem criou o apontamento pode anexar o snapshot." }, { status: 403 });
  }

  const rel = `coordenacao/apontamentos/${apontamento.projetoId}/${apontamento.id}.png`;
  await salvarArquivo(rel, Buffer.from(await file.arrayBuffer()));
  await prisma.apontamentoCoordenacao.update({ where: { id: apontamento.id }, data: { snapshotPath: rel } });

  return NextResponse.json({ ok: true });
}
