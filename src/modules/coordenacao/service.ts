import "server-only";

import type { PgBoss } from "pg-boss";
import { prisma } from "@/lib/prisma";
import {
  FILA_CONVERTER_IFC,
  podeEnfileirar,
  type StatusConversao,
} from "@/modules/coordenacao/conversao-estado";

/**
 * Acessa o pg-boss vivo pelo globalThis — MESMA ponte de lib/jobs.ts. Ler direto
 * daqui (em vez de importar getBoss de lib/jobs) evita puxar todo o grafo de
 * handlers/pg-boss para o bundle da rota de upload. Null em `npm run dev` (sem
 * server.ts): a conversão fica em `fila` sem worker até subir o dev:server/prod.
 */
function bossVivo(): PgBoss | null {
  return (globalThis as unknown as { __senahubBoss?: PgBoss | null }).__senahubBoss ?? null;
}

export type ResultadoEnfileiramento =
  | { enfileirado: true }
  | { enfileirado: false; motivo: "nao_ifc" | "upload_inexistente" | "em_andamento" | "tentativas_esgotadas" | "sem_worker" };

/**
 * (Re)enfileira a conversão IFC → Fragments de um Upload. Idempotente por Upload
 * (singletonKey). Cria/reseta a linha ConversaoModelo para `fila` e publica o job.
 * Chamado pelo gancho de upload (fire-and-forget) e pela action de backfill/retry.
 */
export async function enfileirarConversao(
  uploadId: string,
  opts: { forcar?: boolean } = {},
): Promise<ResultadoEnfileiramento> {
  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: {
      id: true,
      nomeArquivo: true,
      conversao: { select: { status: true, tentativas: true } },
    },
  });
  if (!upload) return { enfileirado: false, motivo: "upload_inexistente" };
  if (!/\.ifc$/i.test(upload.nomeArquivo)) return { enfileirado: false, motivo: "nao_ifc" };

  const atual = upload.conversao
    ? { status: upload.conversao.status as StatusConversao, tentativas: upload.conversao.tentativas }
    : undefined;
  if (!podeEnfileirar(atual, opts)) {
    if (atual?.status === "processando" || atual?.status === "fila") {
      return { enfileirado: false, motivo: "em_andamento" };
    }
    return { enfileirado: false, motivo: "tentativas_esgotadas" };
  }

  const conv = await prisma.conversaoModelo.upsert({
    where: { uploadId },
    create: { uploadId, status: "fila" },
    // forçar (backfill/admin) zera o contador para dar tentativas frescas.
    update: { status: "fila", erro: null, ...(opts.forcar ? { tentativas: 0 } : {}) },
  });

  const boss = bossVivo();
  if (!boss) return { enfileirado: false, motivo: "sem_worker" };

  await boss.send(FILA_CONVERTER_IFC, { conversaoId: conv.id }, { singletonKey: uploadId });
  return { enfileirado: true };
}

/**
 * (Re)enfileira a conversão de um IFC RECEBIDO do cliente (DocumentoVersao). Espelha
 * `enfileirarConversao`, mas o vínculo é a versão de documento (não Upload). A linha
 * ConversaoModelo tem `documentoVersaoId` no lugar de `uploadId`.
 */
export async function enfileirarConversaoDocumento(
  versaoId: string,
  opts: { forcar?: boolean } = {},
): Promise<ResultadoEnfileiramento> {
  const versao = await prisma.documentoVersao.findUnique({
    where: { id: versaoId },
    select: {
      id: true,
      nomeArquivo: true,
      conversao: { select: { status: true, tentativas: true } },
    },
  });
  if (!versao) return { enfileirado: false, motivo: "upload_inexistente" };
  if (!/\.ifc$/i.test(versao.nomeArquivo)) return { enfileirado: false, motivo: "nao_ifc" };

  const atual = versao.conversao
    ? { status: versao.conversao.status as StatusConversao, tentativas: versao.conversao.tentativas }
    : undefined;
  if (!podeEnfileirar(atual, opts)) {
    if (atual?.status === "processando" || atual?.status === "fila") {
      return { enfileirado: false, motivo: "em_andamento" };
    }
    return { enfileirado: false, motivo: "tentativas_esgotadas" };
  }

  const conv = await prisma.conversaoModelo.upsert({
    where: { documentoVersaoId: versaoId },
    create: { documentoVersaoId: versaoId, status: "fila" },
    update: { status: "fila", erro: null, ...(opts.forcar ? { tentativas: 0 } : {}) },
  });

  const boss = bossVivo();
  if (!boss) return { enfileirado: false, motivo: "sem_worker" };

  await boss.send(FILA_CONVERTER_IFC, { conversaoId: conv.id }, { singletonKey: `doc:${versaoId}` });
  return { enfileirado: true };
}
