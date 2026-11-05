// Escritas da sobreposição 2D. Recebe o client (ou a transação) para o smoke rodar o mesmo código sem sessão;
// as actions só checam permissão e escopo e chamam daqui. Mensagens de `ActionError` vão para a tela.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ActionError } from "@/lib/action-error";
import { IDENTIDADE, type Alinhamento } from "./transformacao";
import { COR_BASE, arquivoVigente, corSugerida, motivoParaNaoRemover, type Formato } from "./regras";

type Tx = Prisma.TransactionClient;
export type Db = PrismaClient | Tx;

export const MOTIVO_NOME_REPETIDO = "Já existe uma sobreposição com esse nome neste projeto.";
export const MOTIVO_DOCUMENTO_DE_OUTRO_PROJETO = "Este documento não é deste projeto.";
export const MOTIVO_DOCUMENTO_REPETIDO = "Este documento já está nesta sobreposição.";
export const MOTIVO_CORRIDA_ALINHAMENTO =
  "Outra pessoa alinhou esta camada enquanto você editava. Recarregue para ver o alinhamento atual.";
export const MOTIVO_SOBREPOSICAO_SUMIU = "Esta sobreposição não existe mais. Recarregue a página.";
export const MOTIVO_CAMADA_SUMIU = "Esta camada não existe mais. Recarregue a página.";
export const MOTIVO_CORRIDA_CAMADA = "Outra pessoa mudou esta sobreposição enquanto você editava. Recarregue a página.";

export function motivoSemArquivo(formato: Formato): string {
  return `Este documento não tem arquivo ${formato.toUpperCase()} vigente.`;
}

function ehUnicoViolado(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "P2002";
}

/** Roda `fn` numa transação interativa; se `db` já é uma, roda nela. */
function emTransacao<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if ("$transaction" in db) return db.$transaction(fn);
  return fn(db);
}

/** Arquivo vigente do formato no documento: o mais novo fora da lixeira e não substituído. */
async function vigenteDoDocumento(db: Db, documentoId: string, formato: Formato): Promise<string | null> {
  const uploads = await db.upload.findMany({
    where: { documentoId, excluidoEm: null, substituidoPorId: null },
    select: { id: true, nomeArquivo: true, versao: true, excluidoEm: true },
  });
  return arquivoVigente(uploads, formato)?.id ?? null;
}

async function exigirVigente(db: Db, documentoId: string, formato: Formato): Promise<string> {
  const id = await vigenteDoDocumento(db, documentoId, formato);
  if (!id) throw new ActionError(motivoSemArquivo(formato));
  return id;
}

// ── Escopo: de qual projeto é a linha (as actions checam `projetoVisivel` com isto) ──

export async function projetoDaSobreposicao(db: Db, sobreposicaoId: string): Promise<string> {
  const s = await db.sobreposicaoPlanta.findUnique({ where: { id: sobreposicaoId }, select: { projetoId: true } });
  if (!s) throw new ActionError(MOTIVO_SOBREPOSICAO_SUMIU);
  return s.projetoId;
}

export async function projetoDaCamada(db: Db, camadaId: string): Promise<string> {
  const c = await db.sobreposicaoCamada.findUnique({
    where: { id: camadaId },
    select: { sobreposicao: { select: { projetoId: true } } },
  });
  if (!c) throw new ActionError(MOTIVO_CAMADA_SUMIU);
  return c.sobreposicao.projetoId;
}

// ── Sobreposição ──

export async function criarSobreposicaoNoBanco(
  db: Db,
  input: { projetoId: string; nome: string },
  userId: string,
): Promise<{ id: string }> {
  const ultima = await db.sobreposicaoPlanta.aggregate({ where: { projetoId: input.projetoId }, _max: { ordem: true } });
  try {
    return await db.sobreposicaoPlanta.create({
      data: { projetoId: input.projetoId, nome: input.nome, ordem: (ultima._max.ordem ?? -1) + 1, criadoPorId: userId },
      select: { id: true },
    });
  } catch (err) {
    if (ehUnicoViolado(err)) throw new ActionError(MOTIVO_NOME_REPETIDO);
    throw err;
  }
}

export async function renomearSobreposicaoNoBanco(db: Db, input: { id: string; nome: string }): Promise<void> {
  try {
    const r = await db.sobreposicaoPlanta.updateMany({ where: { id: input.id }, data: { nome: input.nome } });
    if (r.count !== 1) throw new ActionError(MOTIVO_SOBREPOSICAO_SUMIU);
  } catch (err) {
    if (ehUnicoViolado(err)) throw new ActionError(MOTIVO_NOME_REPETIDO);
    throw err;
  }
}

/** Leva camadas e alinhamentos (cascade). Pendências do documento não são tocadas. */
export async function excluirSobreposicaoNoBanco(db: Db, input: { id: string }): Promise<void> {
  await db.sobreposicaoPlanta.deleteMany({ where: { id: input.id } });
}

// ── Camadas ──

export async function adicionarCamadaNoBanco(
  db: Db,
  input: { sobreposicaoId: string; documentoId: string; formato: Formato },
  userId: string,
): Promise<{ id: string }> {
  const projetoId = await projetoDaSobreposicao(db, input.sobreposicaoId);
  const doc = await db.documentoDisciplina.findUnique({
    where: { id: input.documentoId },
    select: { disciplina: { select: { projetoId: true } } },
  });
  if (!doc || doc.disciplina.projetoId !== projetoId) throw new ActionError(MOTIVO_DOCUMENTO_DE_OUTRO_PROJETO);
  const vigenteId = await exigirVigente(db, input.documentoId, input.formato);

  try {
    return await emTransacao(db, async (tx) => {
      const existentes = await tx.sobreposicaoCamada.findMany({
        where: { sobreposicaoId: input.sobreposicaoId },
        select: { documentoId: true, cor: true, ordem: true },
      });
      if (existentes.some((c) => c.documentoId === input.documentoId)) throw new ActionError(MOTIVO_DOCUMENTO_REPETIDO);
      const primeira = existentes.length === 0;
      const ordem = existentes.reduce((m, c) => Math.max(m, c.ordem), -1) + 1;
      const camada = await tx.sobreposicaoCamada.create({
        data: {
          sobreposicaoId: input.sobreposicaoId,
          documentoId: input.documentoId,
          formato: input.formato,
          base: primeira,
          cor: primeira ? COR_BASE : corSugerida(existentes.map((c) => c.cor)),
          ordem,
        },
        select: { id: true },
      });
      // A base define o mundo: nasce no lugar (identidade), conferida no arquivo de agora.
      if (primeira) {
        await tx.sobreposicaoAlinhamento.create({
          data: { camadaId: camada.id, formato: input.formato, ...IDENTIDADE, uploadConferidoId: vigenteId, versao: 1, salvoPorId: userId },
        });
      }
      return camada;
    });
  } catch (err) {
    if (!ehUnicoViolado(err)) throw err;
    // Duas inclusões ao mesmo tempo: ou o mesmo documento (chave composta) ou duas "primeiras" (índice da base).
    const repetido = await db.sobreposicaoCamada.findFirst({
      where: { sobreposicaoId: input.sobreposicaoId, documentoId: input.documentoId },
      select: { id: true },
    });
    throw new ActionError(repetido ? MOTIVO_DOCUMENTO_REPETIDO : MOTIVO_CORRIDA_CAMADA);
  }
}

export async function atualizarCamadaNoBanco(
  db: Db,
  input: {
    camadaId: string;
    cor?: string;
    opacidade?: number;
    visivel?: boolean;
    ordem?: number;
    formato?: Formato;
    pagina?: number;
  },
  userId?: string,
): Promise<void> {
  const camada = await db.sobreposicaoCamada.findUnique({
    where: { id: input.camadaId },
    select: { documentoId: true, formato: true, base: true, alinhamentos: { select: { formato: true } } },
  });
  if (!camada) throw new ActionError(MOTIVO_CAMADA_SUMIU);
  const trocaFormato = input.formato !== undefined && input.formato !== camada.formato;
  const vigenteNovo = trocaFormato ? await exigirVigente(db, camada.documentoId, input.formato!) : null;

  const data: Prisma.SobreposicaoCamadaUpdateManyMutationInput = {};
  if (input.cor !== undefined) data.cor = input.cor;
  if (input.opacidade !== undefined) data.opacidade = input.opacidade;
  if (input.visivel !== undefined) data.visivel = input.visivel;
  if (input.ordem !== undefined) data.ordem = input.ordem;
  if (input.pagina !== undefined) data.pagina = input.pagina;
  if (trocaFormato) data.formato = input.formato;
  if (Object.keys(data).length === 0) return;

  await emTransacao(db, async (tx) => {
    const r = await tx.sobreposicaoCamada.updateMany({ where: { id: input.camadaId }, data });
    if (r.count !== 1) throw new ActionError(MOTIVO_CAMADA_SUMIU);
    // A base sempre tem alinhamento no formato em uso (mesma regra de definirBase).
    if (trocaFormato && camada.base && !camada.alinhamentos.some((a) => a.formato === input.formato)) {
      await tx.sobreposicaoAlinhamento.createMany({
        data: [{ camadaId: input.camadaId, formato: input.formato!, ...IDENTIDADE, uploadConferidoId: vigenteNovo, versao: 1, salvoPorId: userId ?? "sistema" }],
        skipDuplicates: true,
      });
    }
  });
}

export async function removerCamadaNoBanco(db: Db, input: { camadaId: string }): Promise<void> {
  const camada = await db.sobreposicaoCamada.findUnique({
    where: { id: input.camadaId },
    select: { base: true, sobreposicaoId: true },
  });
  if (!camada) throw new ActionError(MOTIVO_CAMADA_SUMIU);
  const total = await db.sobreposicaoCamada.count({ where: { sobreposicaoId: camada.sobreposicaoId } });
  const motivo = motivoParaNaoRemover(camada, total);
  if (motivo) throw new ActionError(motivo);
  await db.sobreposicaoCamada.deleteMany({ where: { id: input.camadaId } });
}

/**
 * Troca a base numa transação (desmarca a atual, marca esta). Não mexe em alinhamento nem em cor (R2): o mundo
 * não muda. Se a nova base não tem alinhamento no formato em uso, ganha a identidade conferida no arquivo vigente.
 */
export async function definirBaseNoBanco(db: Db, input: { camadaId: string }, userId?: string): Promise<void> {
  await emTransacao(db, async (tx) => {
    const camada = await tx.sobreposicaoCamada.findUnique({
      where: { id: input.camadaId },
      select: { base: true, sobreposicaoId: true, documentoId: true, formato: true, alinhamentos: { select: { formato: true } } },
    });
    if (!camada) throw new ActionError(MOTIVO_CAMADA_SUMIU);
    if (camada.base) return;
    await tx.sobreposicaoCamada.updateMany({ where: { sobreposicaoId: camada.sobreposicaoId, base: true }, data: { base: false } });
    await tx.sobreposicaoCamada.update({ where: { id: input.camadaId }, data: { base: true } });
    if (!camada.alinhamentos.some((a) => a.formato === camada.formato)) {
      const vigenteId = await vigenteDoDocumento(tx, camada.documentoId, camada.formato as Formato);
      await tx.sobreposicaoAlinhamento.createMany({
        data: [{ camadaId: input.camadaId, formato: camada.formato, ...IDENTIDADE, uploadConferidoId: vigenteId, versao: 1, salvoPorId: userId ?? "sistema" }],
        skipDuplicates: true,
      });
    }
  });
}

// ── Alinhamento (trava otimista por `versao`) ──

async function documentoDaCamada(db: Db, camadaId: string): Promise<string> {
  const c = await db.sobreposicaoCamada.findUnique({ where: { id: camadaId }, select: { documentoId: true } });
  if (!c) throw new ActionError(MOTIVO_CAMADA_SUMIU);
  return c.documentoId;
}

export async function salvarAlinhamentoNoBanco(
  db: Db,
  input: { camadaId: string; formato: Formato; alinhamento: Alinhamento; versaoLida: number | null },
  userId: string,
): Promise<{ versao: number }> {
  const documentoId = await documentoDaCamada(db, input.camadaId);
  const vigenteId = await exigirVigente(db, documentoId, input.formato);
  const { tx: x, ty, giro, escala } = input.alinhamento;
  const valores = { tx: x, ty, giro, escala, uploadConferidoId: vigenteId, salvoPorId: userId, salvoEm: new Date() };

  if (input.versaoLida === null) {
    try {
      await db.sobreposicaoAlinhamento.create({
        data: { camadaId: input.camadaId, formato: input.formato, ...valores, versao: 1 },
      });
      return { versao: 1 };
    } catch (err) {
      if (ehUnicoViolado(err)) throw new ActionError(MOTIVO_CORRIDA_ALINHAMENTO);
      throw err;
    }
  }
  const r = await db.sobreposicaoAlinhamento.updateMany({
    where: { camadaId: input.camadaId, formato: input.formato, versao: input.versaoLida },
    data: { ...valores, versao: input.versaoLida + 1 },
  });
  if (r.count !== 1) throw new ActionError(MOTIVO_CORRIDA_ALINHAMENTO);
  return { versao: input.versaoLida + 1 };
}

/** "Está certo": o alinhamento vale para o arquivo vigente. Só troca o arquivo conferido, com a mesma trava. */
export async function confirmarAlinhamentoNoBanco(
  db: Db,
  input: { camadaId: string; formato: Formato; versaoLida: number },
  userId: string,
): Promise<{ versao: number }> {
  const documentoId = await documentoDaCamada(db, input.camadaId);
  const vigenteId = await exigirVigente(db, documentoId, input.formato);
  const r = await db.sobreposicaoAlinhamento.updateMany({
    where: { camadaId: input.camadaId, formato: input.formato, versao: input.versaoLida },
    data: { uploadConferidoId: vigenteId, versao: input.versaoLida + 1, salvoPorId: userId, salvoEm: new Date() },
  });
  if (r.count !== 1) throw new ActionError(MOTIVO_CORRIDA_ALINHAMENTO);
  return { versao: input.versaoLida + 1 };
}
