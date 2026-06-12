import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** GIF 1×1 transparente. */
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** Pixel de rastreio: registra a abertura da proposta pelo cliente. */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const proposta = await prisma.proposta.findUnique({ where: { token }, select: { id: true } });
  if (proposta) {
    const fwd = req.headers.get("x-forwarded-for");
    await prisma.propostaVisualizacao.create({
      data: {
        propostaId: proposta.id,
        ip: fwd ? fwd.split(",")[0].trim() : null,
        userAgent: req.headers.get("user-agent"),
      },
    });
  }
  return new NextResponse(new Uint8Array(GIF), {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
