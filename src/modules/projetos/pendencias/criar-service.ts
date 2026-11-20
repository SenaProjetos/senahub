import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { colunasDaMarcacao, type MarcacaoEntrada, type MedidaEntrada } from "./marcacao-schema";

/**
 * A ÚNICA escrita de um apontamento novo (`Pendencia`), usada por `criarPendencia` (a equipe no visualizador) e pelo
 * aceite do pedido de revisão do cliente (rascunhos). Nasce RASCUNHO (`publicadoEm` nulo, item 31): só quem escreveu
 * vê, até o envio da rodada.
 *
 * Numeração por DOCUMENTO (não por versão): o número acompanha o apontamento através das revisões. Escopar por
 * `uploadId` reiniciaria a contagem a cada versão nova e criaria dois "#1" no mesmo documento. Fallback para
 * `uploadId` cobre linha legada sem pai.
 */
export type DadosPendencia = {
  pagina: number;
  x: number;
  y: number;
  texto: string;
  marcacao: MarcacaoEntrada | null;
  medida: MedidaEntrada | null;
  ancora?: { texto: string; offset: number; dx: number; dy: number } | null;
  severidade?: string | null;
  tipo?: string | null;
  prazo?: Date | null;
};

export type UploadParaPendencia = { id: string; documentoId: string | null; disciplinaId: string; projetoId: string };

export async function criarPendenciaNoTx(
  tx: Prisma.TransactionClient,
  p: { upload: UploadParaPendencia; autorId: string; dados: DadosPendencia },
): Promise<{ id: string; numero: number }> {
  const { upload, dados } = p;
  const escopoNumero = upload.documentoId ? { documentoId: upload.documentoId } : { uploadId: upload.id };
  // Trava da numeração até o fim da transação: sem índice único em (documento, número), dois apontamentos ao mesmo tempo
  // (um pino da equipe durante o aceite de um pedido com várias marcações) leriam o mesmo máximo.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pendencia-numero:${upload.documentoId ?? upload.id}`}))`;
  const max = await tx.pendencia.aggregate({ where: escopoNumero, _max: { numero: true } });
  const { marcacaoTipo, marcacaoGeo } = colunasDaMarcacao(dados.marcacao);
  return tx.pendencia.create({
    data: {
      uploadId: upload.id,
      documentoId: upload.documentoId,
      disciplinaId: upload.disciplinaId,
      projetoId: upload.projetoId,
      numero: (max._max.numero ?? 0) + 1,
      pagina: dados.pagina,
      x: dados.x,
      y: dados.y,
      texto: dados.texto,
      status: "aberta",
      autorId: p.autorId,
      ancoraTexto: dados.ancora?.texto ?? null,
      ancoraOffset: dados.ancora?.offset ?? null,
      ancoraDx: dados.ancora?.dx ?? null,
      ancoraDy: dados.ancora?.dy ?? null,
      severidade: dados.severidade ?? null,
      tipo: dados.tipo ?? null,
      prazo: dados.prazo ?? null,
      marcacaoTipo,
      marcacaoGeo,
      medidaMm: dados.medida?.mm ?? null,
      medidaFator: dados.medida?.fator ?? null,
      medidaModo: dados.medida?.modo ?? null,
    },
    select: { id: true, numero: true },
  });
}
