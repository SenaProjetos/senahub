import "server-only";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export type CameraApontamento = { position: [number, number, number]; target: [number, number, number] };

/**
 * O ÚNICO escritor de `ApontamentoCoordenacao` novo (criar na tela, importar BCF, aceitar pedido 3D do cliente): o
 * número é o seguinte do projeto, e a trava por projeto (`pg_advisory_xact_lock`, solta no fim da transação) faz dois
 * apontamentos criados ao mesmo tempo nunca lerem o mesmo máximo.
 */
export async function criarApontamentoCoordenacaoNoTx(
  tx: Tx,
  p: {
    projetoId: string;
    disciplinaId: string | null;
    /** uploadId cru (disciplina) ou `d:<documentoVersaoId>` (recebido do cliente). */
    uploadId: string;
    titulo: string;
    texto: string;
    guids: string[];
    camera: CameraApontamento;
    autorId: string;
    snapshotPath?: string | null;
    bcfGuid?: string | null;
  },
): Promise<{ id: string; numero: number }> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`apontamento-coordenacao-numero:${p.projetoId}`}))`;
  const max = await tx.apontamentoCoordenacao.aggregate({ where: { projetoId: p.projetoId }, _max: { numero: true } });
  return tx.apontamentoCoordenacao.create({
    data: {
      projetoId: p.projetoId,
      disciplinaId: p.disciplinaId,
      uploadId: p.uploadId,
      numero: (max._max.numero ?? 0) + 1,
      titulo: p.titulo,
      texto: p.texto,
      guids: p.guids,
      camera: p.camera,
      status: "aberta",
      autorId: p.autorId,
      snapshotPath: p.snapshotPath ?? null,
      bcfGuid: p.bcfGuid ?? null,
    },
    select: { id: true, numero: true },
  });
}
