import "server-only";

import type { PgBoss } from "pg-boss";
import { prisma } from "@/lib/prisma";
import {
  FILA_CONVERTER_DWG,
  podeEnfileirar,
  type StatusConversao,
} from "@/modules/dwg/conversao-estado";

/**
 * Acessa o pg-boss vivo pelo globalThis — MESMA ponte de lib/jobs.ts. Ler direto
 * daqui (em vez de importar getBoss de lib/jobs) evita puxar todo o grafo de
 * handlers/pg-boss para o bundle da rota de upload/action de documentos. Null em
 * `npm run dev` (sem server.ts): a conversão fica em `fila` sem worker até subir
 * o dev:server/prod.
 */
function bossVivo(): PgBoss | null {
  return (globalThis as unknown as { __senahubBoss?: PgBoss | null }).__senahubBoss ?? null;
}

export type ResultadoEnfileiramento =
  | { enfileirado: true }
  | { enfileirado: false; motivo: "nao_dwg" | "origem_inexistente" | "em_andamento" | "tentativas_esgotadas" | "sem_worker" };

/**
 * (Re)enfileira a conversão DWG → DXF de um Upload de disciplina. Idempotente por
 * Upload (singletonKey). Cria/reseta a linha ConversaoDesenho para `fila` e publica
 * o job. Chamado pelo gancho de upload (fire-and-forget) e pela action de retry.
 */
export async function enfileirarConversaoDwg(
  uploadId: string,
  opts: { forcar?: boolean } = {},
): Promise<ResultadoEnfileiramento> {
  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: {
      id: true,
      nomeArquivo: true,
      conversaoDesenho: { select: { status: true, tentativas: true } },
    },
  });
  if (!upload) return { enfileirado: false, motivo: "origem_inexistente" };
  if (!/\.dwg$/i.test(upload.nomeArquivo)) return { enfileirado: false, motivo: "nao_dwg" };

  const atual = upload.conversaoDesenho
    ? { status: upload.conversaoDesenho.status as StatusConversao, tentativas: upload.conversaoDesenho.tentativas }
    : undefined;
  if (!podeEnfileirar(atual, opts)) {
    if (atual?.status === "processando" || atual?.status === "fila") {
      return { enfileirado: false, motivo: "em_andamento" };
    }
    return { enfileirado: false, motivo: "tentativas_esgotadas" };
  }

  const conv = await prisma.conversaoDesenho.upsert({
    where: { uploadId },
    create: { uploadId, status: "fila" },
    // forçar (retry manual) zera o contador para dar tentativas frescas.
    update: { status: "fila", erro: null, ...(opts.forcar ? { tentativas: 0 } : {}) },
  });

  const boss = bossVivo();
  if (!boss) return { enfileirado: false, motivo: "sem_worker" };

  await boss.send(FILA_CONVERTER_DWG, { conversaoId: conv.id }, { singletonKey: uploadId });
  return { enfileirado: true };
}

/**
 * (Re)enfileira a conversão de um DWG RECEBIDO do cliente (DocumentoVersao). Espelha
 * `enfileirarConversaoDwg`, mas o vínculo é a versão de documento (não Upload). A
 * linha ConversaoDesenho tem `documentoVersaoId` no lugar de `uploadId`.
 */
export async function enfileirarConversaoDwgDocumento(
  versaoId: string,
  opts: { forcar?: boolean } = {},
): Promise<ResultadoEnfileiramento> {
  const versao = await prisma.documentoVersao.findUnique({
    where: { id: versaoId },
    select: {
      id: true,
      nomeArquivo: true,
      conversaoDesenho: { select: { status: true, tentativas: true } },
    },
  });
  if (!versao) return { enfileirado: false, motivo: "origem_inexistente" };
  if (!/\.dwg$/i.test(versao.nomeArquivo)) return { enfileirado: false, motivo: "nao_dwg" };

  const atual = versao.conversaoDesenho
    ? { status: versao.conversaoDesenho.status as StatusConversao, tentativas: versao.conversaoDesenho.tentativas }
    : undefined;
  if (!podeEnfileirar(atual, opts)) {
    if (atual?.status === "processando" || atual?.status === "fila") {
      return { enfileirado: false, motivo: "em_andamento" };
    }
    return { enfileirado: false, motivo: "tentativas_esgotadas" };
  }

  const conv = await prisma.conversaoDesenho.upsert({
    where: { documentoVersaoId: versaoId },
    create: { documentoVersaoId: versaoId, status: "fila" },
    update: { status: "fila", erro: null, ...(opts.forcar ? { tentativas: 0 } : {}) },
  });

  const boss = bossVivo();
  if (!boss) return { enfileirado: false, motivo: "sem_worker" };

  await boss.send(FILA_CONVERTER_DWG, { conversaoId: conv.id }, { singletonKey: `doc:${versaoId}` });
  return { enfileirado: true };
}
