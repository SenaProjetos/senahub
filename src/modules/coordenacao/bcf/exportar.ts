import "server-only";

import { randomUUID } from "node:crypto";
import { ZipArchive } from "archiver";
import { prisma } from "@/lib/prisma";
import { lerArquivo } from "@/lib/storage";
import {
  bcfVersionXml,
  markupXml,
  viewpointXml,
  type Vec3,
} from "@/modules/coordenacao/bcf/writer";

const MAX_APONTAMENTOS = 500;

type CameraJson = { position: Vec3; target: Vec3 };

/**
 * Monta o `.bcfzip` (BCF 2.1) de um conjunto de apontamentos de um projeto e
 * devolve um ReadableStream (Web) pronto para o NextResponse — não bufferiza o
 * zip inteiro. Persiste o `bcfGuid` de cada apontamento (idempotente) para o
 * round-trip futuro (F6). O acesso já foi validado pela rota.
 */
export async function exportarBcf(
  projetoId: string,
  ids: string[],
): Promise<{ stream: ReadableStream<Uint8Array>; total: number } | { erro: string }> {
  const selecionados = ids.slice(0, MAX_APONTAMENTOS);
  const apontamentos = await prisma.apontamentoCoordenacao.findMany({
    where: { id: { in: selecionados }, projetoId },
    orderBy: { numero: "asc" },
  });
  if (apontamentos.length === 0) return { erro: "Nenhum apontamento selecionado." };

  const autorIds = [...new Set(apontamentos.map((a) => a.autorId))];
  const users = await prisma.user.findMany({
    where: { id: { in: autorIds } },
    select: { id: true, name: true },
  });
  const nomeAutor = new Map(users.map((u) => [u.id, u.name]));

  // Garante um bcfGuid estável por apontamento (grava se ainda não tem).
  const topicGuid = new Map<string, string>();
  for (const a of apontamentos) {
    const guid = a.bcfGuid ?? randomUUID();
    topicGuid.set(a.id, guid);
    if (!a.bcfGuid) {
      await prisma.apontamentoCoordenacao.update({ where: { id: a.id }, data: { bcfGuid: guid } });
    }
  }

  // Lê os snapshots ANTES de abrir o stream (I/O async não cabe no start do archiver).
  const snapshots = new Map<string, Buffer>();
  await Promise.all(
    apontamentos.map(async (a) => {
      if (!a.snapshotPath) return;
      try {
        snapshots.set(a.id, await lerArquivo(a.snapshotPath));
      } catch {
        /* snapshot ausente no disco — segue sem ele */
      }
    }),
  );

  const archive = new ZipArchive({ zlib: { level: 6 } });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      archive.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      archive.on("end", () => controller.close());
      archive.on("warning", (err) => console.warn("[bcf] warning:", err));
      archive.on("error", (err) => {
        console.error("[bcf] erro no archiver:", err);
        controller.error(err);
      });

      archive.append(bcfVersionXml(), { name: "bcf.version" });

      for (const a of apontamentos) {
        const guid = topicGuid.get(a.id)!;
        const viewpointGuid = randomUUID();
        const camera = a.camera as CameraJson;
        const guids = Array.isArray(a.guids) ? (a.guids as string[]) : [];
        const snapshot = snapshots.get(a.id);

        archive.append(
          markupXml({
            guid,
            title: `#${a.numero} ${a.titulo}`,
            description: a.texto,
            status: a.status,
            creationDate: a.createdAt.toISOString(),
            creationAuthor: nomeAutor.get(a.autorId) ?? "—",
            temViewpoint: true,
            temSnapshot: !!snapshot,
            viewpointGuid,
          }),
          { name: `${guid}/markup.bcf` },
        );
        archive.append(
          viewpointXml({ guid: viewpointGuid, guids, camera }),
          { name: `${guid}/viewpoint.bcfv` },
        );
        if (snapshot) archive.append(snapshot, { name: `${guid}/snapshot.png` });
      }

      void archive.finalize();
    },
  });

  return { stream, total: apontamentos.length };
}
