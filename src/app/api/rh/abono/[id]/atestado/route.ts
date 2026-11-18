import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { lerArquivo } from "@/lib/storage";
import { logAudit } from "@/lib/audit";
import { podeVerAtestado } from "@/modules/rh/quem-decide";
import { ehDoRh } from "@/modules/rh/gestores-rh";

const TIPOS: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/** `?ver=1` abre no navegador (só PDF/imagem); sem ele — ou para outros formatos — baixa. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  const { id } = await ctx.params;

  const abono = await prisma.abonoFalta.findUnique({ where: { id } });
  if (!abono || !abono.atestadoPath) {
    return NextResponse.json({ error: "Atestado não encontrado." }, { status: 404 });
  }
  // Dado de saúde: o dono, ou quem pode decidir a ausência dele — o RH, e para quem é do RH só
  // um administrador (`podeVerAtestado`). As telas escondem o botão pela mesma regra.
  const dono = { id: abono.userId, ehRh: abono.userId !== user.id && (await ehDoRh(abono.userId)) };
  const quem = { id: user.id, superUsuario: user.superUsuario === true, gereRh: user.gereRh === true };
  // Dado de saúde (LGPD): toda abertura fica na trilha, a recusada também.
  const trilha = { userId: user.id, modulo: "rh", acao: "abrir-atestado", entidade: "AbonoFalta", entidadeId: abono.id };
  if (!podeVerAtestado(dono, quem)) {
    await logAudit({ ...trilha, resultado: "bloqueado", detalhe: { donoId: abono.userId } });
    return NextResponse.json({ error: "Sem permissão para abrir este atestado." }, { status: 403 });
  }

  let conteudo: Buffer;
  try {
    conteudo = await lerArquivo(abono.atestadoPath);
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível." }, { status: 410 });
  }
  await logAudit({ ...trilha, detalhe: { donoId: abono.userId } });
  const nome = abono.atestadoNome ?? "atestado";
  const ext = nome.split(".").pop()?.toLowerCase() ?? "";
  const tipo = TIPOS[ext];
  const inline = !!tipo && new URL(req.url).searchParams.get("ver") === "1";
  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": tipo ?? "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
