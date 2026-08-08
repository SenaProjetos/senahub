import { NextResponse } from "next/server";
import { ZipArchive } from "archiver";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { resolverCaminho } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";
import { statusCertidao } from "@/modules/certidoes/service";
import type { Prisma } from "@/generated/prisma/client";

/**
 * ZIP com o arquivo ATUAL de um conjunto de certidões — filtrado por `?ids=`
 * (lista separada por vírgula), `?tipoIds=`, `?vencidas=1`, ou nenhum (= todas).
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (session.user.mustChangePassword || !session.user.ativo) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }
  if (!(await can(session.user.role, "certidoes", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const ids = params.get("ids")?.split(",").filter(Boolean);
  const tipoIds = params.get("tipoIds")?.split(",").filter(Boolean);
  const somenteVencidas = params.get("vencidas") === "1";

  const where: Prisma.CertidaoWhereInput = { arquivoPath: { not: null } };
  if (ids?.length) where.id = { in: ids };
  if (tipoIds?.length) where.tipoId = { in: tipoIds };

  const certidoes = await prisma.certidao.findMany({ where, include: { tipo: true } });
  const filtradas = somenteVencidas
    ? certidoes.filter((c) => statusCertidao(c.validade.toISOString().slice(0, 10)) === "vencida")
    : certidoes;

  if (filtradas.length === 0) {
    return NextResponse.json({ error: "Nenhuma certidão com arquivo no filtro selecionado." }, { status: 404 });
  }

  await logAudit({
    userId: session.user.id,
    modulo: "certidoes",
    acao: "download-certidao-zip",
    resultado: "sucesso",
    entidade: "Certidao",
    detalhe: { total: filtradas.length, ids, tipoIds, somenteVencidas },
    ip: await getClientIp(),
  });

  const usados = new Map<string, number>();
  function nomeUnico(base: string): string {
    const n = (usados.get(base) ?? 0) + 1;
    usados.set(base, n);
    return n === 1 ? base : `${base.replace(/(\.[^.]+)?$/, `_${n}$1`)}`;
  }

  const archive = new ZipArchive({ zlib: { level: 6 } });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      archive.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      archive.on("end", () => controller.close());
      archive.on("warning", (err) => console.warn("[certidoes-zip] warning:", err));
      archive.on("error", (err) => {
        console.error("[certidoes-zip] erro no archiver:", err);
        controller.error(err);
      });
      for (const c of filtradas) {
        try {
          const nome = nomeUnico(`${c.tipo.nome} - ${c.arquivoNome ?? c.id}`);
          archive.file(resolverCaminho(c.arquivoPath!), { name: nome });
        } catch {
          // arquivo ausente no disco — ignora
        }
      }
      void archive.finalize();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="certidoes.zip"`,
    },
  });
}
