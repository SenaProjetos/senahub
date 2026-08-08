import "server-only";

import { randomUUID } from "node:crypto";
import { ZipArchive } from "archiver";
import { prisma } from "@/lib/prisma";
import { bcfVersionXml, markupXml } from "@/modules/coordenacao/bcf/writer";

const MAX_APONTAMENTOS = 500;

/**
 * Monta o `.bcfzip` (BCF 2.1) de um conjunto de Pendencia (item 36) — reaproveita o mesmo
 * writer puro da Coordenação (`modules/coordenacao/bcf/writer.ts`), sem unificar os dois
 * modelos (decidido: R16). Diferença chave em relação a `ApontamentoCoordenacao`: Pendencia é
 * um ponto 2D numa PÁGINA de PDF, não um elemento IFC com câmera 3D — não há
 * `guids`/`camera` para preencher, então cada tópico exporta SEM viewpoint (`temViewpoint:
 * false`), só o `markup.bcf` com título/descrição/status/autor. `Viewpoints` é opcional na
 * spec BCF (o próprio writer já trata isso condicionalmente).
 *
 * Sem `bcfGuid` persistido (ao contrário da Coordenação): esta é uma exportação "read-only"
 * v1, e persistir GUID exigiria coluna nova em `Pendencia` — mudança de schema, fora do
 * escopo Sonnet deste item (regra fixa da análise: schema novo = Opus). Round-trip de import
 * fica para quando/se for pedido.
 */
export async function exportarPendenciasBcf(
  projetoId: string,
  ids: string[],
): Promise<{ stream: ReadableStream<Uint8Array>; total: number } | { erro: string }> {
  const selecionados = ids.slice(0, MAX_APONTAMENTOS);
  const pendencias = await prisma.pendencia.findMany({
    // Rascunho (item 31) não é exportável: BCF vai pra ferramenta de terceiro (Revit/Navisworks),
    // e o que ainda não foi entregue não pode sair do sistema.
    where: { id: { in: selecionados }, projetoId, publicadoEm: { not: null }, excluidoEm: null },
    orderBy: { numero: "asc" },
  });
  if (pendencias.length === 0) return { erro: "Nenhum apontamento selecionado." };

  const autorIds = [...new Set(pendencias.map((p) => p.autorId))];
  const users = await prisma.user.findMany({ where: { id: { in: autorIds } }, select: { id: true, name: true } });
  const nomeAutor = new Map(users.map((u) => [u.id, u.name]));

  const archive = new ZipArchive({ zlib: { level: 6 } });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      archive.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      archive.on("end", () => controller.close());
      archive.on("warning", (err) => console.warn("[pendencias-bcf] warning:", err));
      archive.on("error", (err) => {
        console.error("[pendencias-bcf] erro no archiver:", err);
        controller.error(err);
      });

      archive.append(bcfVersionXml(), { name: "bcf.version" });
      for (const p of pendencias) {
        const guid = randomUUID();
        archive.append(
          markupXml({
            guid,
            title: `#${p.numero} — pág. ${p.pagina}`,
            description: p.texto,
            status: p.status,
            creationDate: p.createdAt.toISOString(),
            creationAuthor: nomeAutor.get(p.autorId) ?? "—",
            temViewpoint: false,
            temSnapshot: false,
            viewpointGuid: "",
          }),
          { name: `${guid}/markup.bcf` },
        );
      }
      void archive.finalize();
    },
  });

  return { stream, total: pendencias.length };
}
