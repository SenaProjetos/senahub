import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { salvarArquivo } from "@/lib/storage";

const MAX = 2 * 1024 * 1024; // 2 MB — recorte de canvas comprimido em PNG

/**
 * Anexa a miniatura do recorte a um apontamento já criado (item 14, R6) — criação em DOIS
 * passos, igual ao snapshot da Coordenação: a Server Action cria a linha e devolve o id, e o
 * cliente (único lugar que tem o canvas renderizado) manda o PNG por multipart aqui. Server
 * Action não serve pra isso — o `bodySizeLimit` estoura com blob de imagem.
 *
 * Gate de escrita: quem aponta (`uploads:validar`) e é o AUTOR do apontamento, ou admin —
 * mesma regra da rota irmã de Coordenação.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (!(await can(user.role, "uploads", "validar"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const form = await req.formData();
  const pendenciaId = String(form.get("pendenciaId") ?? "");
  const file = form.get("file");
  if (!pendenciaId || !(file instanceof File)) {
    return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });
  }
  if (file.size > MAX) return NextResponse.json({ error: "Miniatura muito grande." }, { status: 400 });
  if (file.type !== "image/png") return NextResponse.json({ error: "Formato inválido." }, { status: 400 });

  const p = await prisma.pendencia.findUnique({
    where: { id: pendenciaId },
    select: { id: true, projetoId: true, autorId: true, excluidoEm: true },
  });
  if (!p || p.excluidoEm) return NextResponse.json({ error: "Apontamento não encontrado." }, { status: 404 });
  if (p.autorId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Só quem criou o apontamento pode anexar a miniatura." }, { status: 403 });
  }

  const rel = `apontamentos/thumbs/${p.projetoId}/${p.id}.png`;
  await salvarArquivo(rel, Buffer.from(await file.arrayBuffer()));
  await prisma.pendencia.update({ where: { id: p.id }, data: { thumbPath: rel } });

  return NextResponse.json({ ok: true, thumbPath: rel });
}
