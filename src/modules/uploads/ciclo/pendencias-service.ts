import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/with-action";
import { gravarEventoNoTx } from "@/modules/uploads/historico/service";
import {
  alvoDaViolacao,
  assinaturaDaViolacao,
  ehDispensavel,
  MOTIVO_DISPENSA_ENCERRADA,
  MOTIVO_JA_DISPENSADA,
  MOTIVO_JA_RESOLVIDA,
  type TipoPendencia,
} from "./pendencias";
import { violacoesDoCiclo } from "./varredura";

/**
 * Dispensar e desfazer a dispensa de uma pendência do ciclo documental. Escrita SÓ aqui: transação, com a
 * revalidação da assinatura DENTRO dela e o evento no histórico do documento. Não muda estado nem controle
 * de revisão (isso é só de `service.ts`).
 */

const filtroDoAlvo = (tipo: TipoPendencia, alvoId: string): Prisma.DocumentoRevisaoWhereInput =>
  tipo === "duas_publicadas" ? { documentoId: alvoId } : { id: alvoId };

export async function dispensarNoBanco(input: {
  alvoId: string;
  tipo: TipoPendencia;
  chave: string;
  motivo: string;
  userId: string;
}): Promise<void> {
  const motivo = input.motivo.trim();
  try {
    await prisma.$transaction(async (tx) => {
      // A pendência ainda existe, com a MESMA assinatura que a tela mostrou? Senão a tela está velha.
      const violacoes = await violacoesDoCiclo(tx, new Date(), filtroDoAlvo(input.tipo, input.alvoId));
      const v = violacoes.filter(ehDispensavel).find((x) => x.tipo === input.tipo && alvoDaViolacao(x) === input.alvoId);
      if (!v || assinaturaDaViolacao(v) !== input.chave) throw new ActionError(MOTIVO_JA_RESOLVIDA);

      const ativa = await tx.dispensaPendenciaCiclo.findFirst({ where: { alvoId: input.alvoId, tipo: input.tipo, desfeitaEm: null } });
      if (ativa?.chave === input.chave) throw new ActionError(MOTIVO_JA_DISPENSADA);
      // Dispensa de uma assinatura ANTIGA ainda ativa (o job não passou): é encerrada e substituída.
      if (ativa) {
        await tx.dispensaPendenciaCiclo.updateMany({
          where: { id: ativa.id, desfeitaEm: null },
          data: { desfeitaEm: new Date(), desfeitaPorId: input.userId },
        });
      }

      await tx.dispensaPendenciaCiclo.create({
        data: { alvoId: input.alvoId, tipo: input.tipo, chave: input.chave, motivo, criadaPorId: input.userId },
      });
      await gravarEventoNoTx(tx, {
        documentoId: v.documentoId,
        revisaoId: v.tipo === "duas_publicadas" ? null : v.revisaoId,
        tipo: "pendencia_dispensada",
        userId: input.userId,
        detalhe: { pendencia: v.tipo, motivo },
      });
    });
  } catch (err) {
    // Dois cliques simultâneos: o índice parcial (uma ativa por alvo+tipo) barra o segundo.
    if ((err as { code?: string }).code === "P2002") throw new ActionError(MOTIVO_JA_DISPENSADA);
    throw err;
  }
}

export async function desfazerDispensaNoBanco(input: { alvoId: string; tipo: TipoPendencia; userId: string }): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.dispensaPendenciaCiclo.updateMany({
      where: { alvoId: input.alvoId, tipo: input.tipo, desfeitaEm: null },
      data: { desfeitaEm: new Date(), desfeitaPorId: input.userId },
    });
    if (count !== 1) throw new ActionError(MOTIVO_DISPENSA_ENCERRADA);

    const documentoId =
      input.tipo === "duas_publicadas"
        ? input.alvoId
        : (await tx.documentoRevisao.findUnique({ where: { id: input.alvoId }, select: { documentoId: true } }))?.documentoId;
    // Documento ou revisão apagados: não há histórico onde gravar (o evento tem FK para o documento).
    const documento = documentoId ? await tx.documentoDisciplina.findUnique({ where: { id: documentoId }, select: { id: true } }) : null;
    if (documento) {
      await gravarEventoNoTx(tx, {
        documentoId: documento.id,
        revisaoId: input.tipo === "duas_publicadas" ? null : input.alvoId,
        tipo: "pendencia_dispensa_desfeita",
        userId: input.userId,
        detalhe: { pendencia: input.tipo },
      });
    }
  });
}

/** Chamado pelo job diário com `dispensasObsoletas(...)`: encerra pelo sistema (`desfeitaPorId` nulo). */
export async function encerrarDispensasObsoletasNoBanco(ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { count } = await prisma.dispensaPendenciaCiclo.updateMany({
    where: { id: { in: [...ids] }, desfeitaEm: null },
    data: { desfeitaEm: new Date(), desfeitaPorId: null },
  });
  return count;
}
