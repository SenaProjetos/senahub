import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { smtpConfigurado } from "@/lib/mail";
import fs from "fs";

export const dynamic = "force-dynamic";

/**
 * Health check para monitoramento (Uptime Kuma local, load balancer, etc.).
 * 200 = app + banco OK; 503 = banco inacessível. Não expõe dados sensíveis.
 */
export async function GET() {
  const inicio = Date.now();
  let dbStatus: "ok" | "erro" = "ok";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "erro";
  }

  const storagePath = process.env.STORAGE_BASE_PATH ?? "";
  const storageOk = storagePath ? fs.existsSync(storagePath) : false;

  const chromePath = process.env.CHROME_PATH ?? "";
  const chromeOk = chromePath ? fs.existsSync(chromePath) : false;

  const status = dbStatus === "ok" ? "ok" : "degraded";

  return NextResponse.json(
    {
      status,
      db: dbStatus,
      storage: storagePath ? (storageOk ? "ok" : "erro") : "não configurado",
      chrome: chromePath ? (chromeOk ? "ok" : "erro") : "não configurado",
      smtp: smtpConfigurado() ? "configurado" : "não configurado",
      latenciaMs: Date.now() - inicio,
      timestamp: new Date().toISOString(),
    },
    { status: status === "ok" ? 200 : 503 },
  );
}
