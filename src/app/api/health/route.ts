import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Health check para monitoramento (Uptime Kuma local, load balancer, etc.).
 * 200 = app + banco OK; 503 = banco inacessível. Não expõe dados sensíveis.
 */
export async function GET() {
  const inicio = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      db: "ok",
      latenciaMs: Date.now() - inicio,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { status: "degraded", db: "erro", timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }
}
