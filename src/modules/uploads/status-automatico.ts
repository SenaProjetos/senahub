import "server-only";

import { prisma } from "@/lib/prisma";
import { registrarEventoDocumento } from "./historico/service";
import { participaDoCiclo } from "./ciclo/escopo";
import {
  statusAoAprovar,
  statusAoDesaprovar,
  statusAoEnviarRevisao,
  type ChaveStatus,
  type StatusAtual,
} from "./status-documento";

/**
 * I/O da automação do status documental (regras em `status-documento.ts`). Chamado DEPOIS da mutação que o
 * provoca — upload gravado, validação feita ou desfeita — e nunca a derruba: falhar aqui deixa o status como
 * estava (e o log diz), mas o arquivo enviado ou validado continua valendo. Status que o catálogo não tem mais
 * (ou com a chave apagada) também é só ignorado.
 *
 * A troca grava o mesmo evento `status` da troca manual (histórico do documento), com `automatico: true` e
 * a razão, para quem lê o histórico saber que não foi uma pessoa escolhendo.
 */

type Contexto = {
  atual: (StatusAtual & { nome: string }) | null;
  /** Maior número de revisão entre os arquivos fora da lixeira (a mesma regra da tela). */
  vigente: number | null;
};

async function contextoDoDocumento(documentoId: string): Promise<Contexto> {
  const [doc, ultima] = await Promise.all([
    prisma.documentoDisciplina.findUnique({
      where: { id: documentoId },
      select: { status: { select: { nome: true, chave: true, final: true } } },
    }),
    prisma.upload.findFirst({
      where: { documentoId, excluidoEm: null, revisaoId: { not: null } },
      orderBy: { revisao: { numero: "desc" } },
      select: { revisao: { select: { numero: true } } },
    }),
  ]);
  return { atual: doc?.status ?? null, vigente: ultima?.revisao?.numero ?? null };
}

const RAZAO: Record<"envio" | "validacao" | "reverter" | "correcao", string> = {
  envio: "revisão nova enviada",
  validacao: "prancha validada",
  reverter: "validação desfeita",
  correcao: "correção solicitada",
};

async function gravar(
  documentoId: string,
  chave: ChaveStatus,
  de: string | null,
  userId: string | null,
  razao: keyof typeof RAZAO,
): Promise<void> {
  // Documento do ciclo documental (ISO 19650): o catálogo antigo não é mais escrito pelo sistema (D10)
  // — quem diz em que pé a revisão está é o estado dela. Fora do ciclo, nada muda.
  if (await documentoNoCiclo(documentoId)) return;
  const status = await prisma.documentoStatus.findFirst({ where: { chave, ativo: true }, select: { id: true, nome: true } });
  if (!status) return;
  await prisma.documentoDisciplina.update({ where: { id: documentoId }, data: { statusId: status.id } });
  await registrarEventoDocumento({
    documentoId,
    tipo: "status",
    userId,
    detalhe: { de, para: status.nome, automatico: true, razao: RAZAO[razao] },
  });
}

async function documentoNoCiclo(documentoId: string): Promise<boolean> {
  const doc = await prisma.documentoDisciplina.findUnique({
    where: { id: documentoId },
    select: { chave: true, uploads: { where: { excluidoEm: null, substituidoPorId: null }, select: { nomeArquivo: true } } },
  });
  if (!doc) return false;
  const extensoes = doc.uploads.map((u) => u.nomeArquivo.slice(u.nomeArquivo.lastIndexOf(".") + 1).toLowerCase());
  return participaDoCiclo({ chave: doc.chave, extensoes });
}

async function comProtecao(nome: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[status-automatico] ${nome} falhou:`, err);
  }
}

/** Depois de gravar um arquivo: o 1º arquivo da revisão vigente põe "Enviado". */
export async function statusAposEnvio(p: { uploadId: string; userId: string }): Promise<void> {
  await comProtecao("envio", async () => {
    const upload = await prisma.upload.findUnique({
      where: { id: p.uploadId },
      select: { documentoId: true, revisaoId: true, revisao: { select: { numero: true } } },
    });
    if (!upload?.documentoId || !upload.revisaoId || !upload.revisao) return;
    const [ctx, naRevisao] = await Promise.all([
      contextoDoDocumento(upload.documentoId),
      prisma.upload.count({ where: { revisaoId: upload.revisaoId, excluidoEm: null } }),
    ]);
    const chave = statusAoEnviarRevisao({
      atual: ctx.atual,
      primeiroArquivoDaRevisao: naRevisao === 1,
      revisaoVigente: ctx.vigente === upload.revisao.numero,
    });
    if (chave) await gravar(upload.documentoId, chave, ctx.atual?.nome ?? null, p.userId, "envio");
  });
}

/** Os documentos (sem repetir) dos arquivos, com a revisão de cada arquivo. */
async function documentosDosArquivos(uploadIds: readonly string[]) {
  const uploads = await prisma.upload.findMany({
    where: { id: { in: [...uploadIds] }, documentoId: { not: null } },
    select: { documentoId: true, revisao: { select: { numero: true } } },
  });
  const porDocumento = new Map<string, number[]>();
  for (const u of uploads) {
    const lista = porDocumento.get(u.documentoId!) ?? [];
    if (u.revisao) lista.push(u.revisao.numero);
    porDocumento.set(u.documentoId!, lista);
  }
  return porDocumento;
}

/** Depois de validar arquivos: o documento cuja revisão vigente teve arquivo validado vai a "Aprovado". */
export async function statusAposValidacao(p: { uploadIds: readonly string[]; userId: string }): Promise<void> {
  await comProtecao("validacao", async () => {
    for (const [documentoId, revisoes] of await documentosDosArquivos(p.uploadIds)) {
      const ctx = await contextoDoDocumento(documentoId);
      const chave = statusAoAprovar({ atual: ctx.atual, revisaoVigente: ctx.vigente != null && revisoes.includes(ctx.vigente) });
      if (chave) await gravar(documentoId, chave, ctx.atual?.nome ?? null, p.userId, "validacao");
    }
  });
}

/**
 * Depois de desfazer a validação (`reverter`) ou pedir correção (`correcao`: ajuste solicitado, apontamentos
 * enviados): o "Aprovado" que a validação pôs volta, se não sobrou arquivo validado na revisão vigente.
 */
export async function statusAposDesvalidacao(p: {
  uploadIds: readonly string[];
  userId: string;
  motivo: "reverter" | "correcao";
}): Promise<void> {
  await comProtecao(p.motivo, async () => {
    for (const [documentoId, revisoes] of await documentosDosArquivos(p.uploadIds)) {
      const ctx = await contextoDoDocumento(documentoId);
      if (ctx.vigente == null) continue;
      const aindaValidados = await prisma.upload.count({
        where: { documentoId, excluidoEm: null, validado: true, revisao: { numero: ctx.vigente } },
      });
      const chave = statusAoDesaprovar({
        atual: ctx.atual,
        revisaoVigente: revisoes.includes(ctx.vigente),
        aindaHaValidadoNaVigente: aindaValidados > 0,
        motivo: p.motivo,
      });
      if (chave) await gravar(documentoId, chave, ctx.atual?.nome ?? null, p.userId, p.motivo);
    }
  });
}
