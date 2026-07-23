import "server-only";

import { prisma } from "@/lib/prisma";
import { parseDesenhoId } from "@/modules/dwg/desenho-ref";

export type StatusConversaoDwg = {
  status: string;
  progresso: number | null;
  erro: string | null;
  concluidoEm: Date | null;
} | null;

const SELECT_STATUS = { status: true, progresso: true, erro: true, concluidoEm: true } as const;

/**
 * Estado da conversão DWG → DXF de um desenho (Upload de disciplina ou
 * DocumentoVersao recebida do cliente), pela chave unificada `desenhoId`
 * (ver `desenho-ref.ts`). `null` se não há conversão ainda (nunca enfileirada)
 * ou se a origem não existe.
 */
export async function statusConversaoDwg(desenhoId: string): Promise<StatusConversaoDwg> {
  const ref = parseDesenhoId(desenhoId);
  if (ref.tipo === "documento") {
    const versao = await prisma.documentoVersao.findUnique({
      where: { id: ref.id },
      select: { conversaoDesenho: { select: SELECT_STATUS } },
    });
    return versao?.conversaoDesenho ?? null;
  }
  const upload = await prisma.upload.findUnique({
    where: { id: ref.id },
    select: { conversaoDesenho: { select: SELECT_STATUS } },
  });
  return upload?.conversaoDesenho ?? null;
}
