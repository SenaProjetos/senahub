import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/with-action";
import { rotuloRevisao } from "@/lib/utils";
import { gravarEventoNoTx } from "@/modules/uploads/historico/service";
import { participaDoCiclo } from "./escopo";
import { CONTROLES_DE_PASTA, type EscopoBloqueio, type EstadoRevisao, type TipoControle } from "./estados";
import { decidirLiberacaoAutomatica, decidirPublicacao, restricaoDePendenciasPodeSair, type ArquivoDaRevisao } from "./regras";
import {
  MOTIVO_MUDOU,
  TRANSICOES,
  motivoParaNaoAplicar,
  motivoParaNaoRemover,
  motivoParaNaoTransicionar,
  type AcaoCiclo,
  type EstadoParaTransicao,
} from "./transicoes";

/**
 * O ÚNICO lugar que muda o estado de uma revisão ou aplica/remove um controle (ciclo documental,
 * ISO 19650). Toda escrita é numa transação, com o evento no histórico DENTRO dela (I8), e as
 * escritas de estado são `updateMany` condicionadas ao estado lido — duas pessoas decidindo ao mesmo
 * tempo não passam as duas (`MOTIVO_MUDOU`). Regras puras em `transicoes.ts` e `regras.ts`.
 *
 * `quem` nulo = SISTEMA (automações A1–A3, A7). Notificações (A6) vão DEPOIS do commit, em
 * `notificacoes.ts`, a partir do que estas funções devolvem.
 */

type Tx = Prisma.TransactionClient;
/** Quem age: uma pessoa, ou `null` para o sistema. */
export type QuemAge = { userId: string } | null;

const selectRevisao = {
  id: true,
  numero: true,
  estado: true,
  descricao: true,
  ultimaVersao: true,
  createdById: true,
  documentoId: true,
  documento: {
    select: {
      chave: true,
      nomeArquivo: true,
      titulo: true,
      disciplinaId: true,
      disciplina: { select: { projetoId: true, responsaveis: { select: { userId: true } } } },
    },
  },
  controles: {
    where: { removidoEm: null },
    select: { id: true, tipo: true, origem: true, escopos: true },
  },
  // O que VALE na revisão: fora da lixeira e não substituído por versão posterior.
  uploads: {
    where: { excluidoEm: null, substituidoPorId: null },
    select: { id: true, nomeArquivo: true, validado: true, autorId: true },
  },
} satisfies Prisma.DocumentoRevisaoSelect;

export type RevisaoCarregada = Prisma.DocumentoRevisaoGetPayload<{ select: typeof selectRevisao }>;

function extensao(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i > 0 ? nome.slice(i + 1).toLowerCase() : "";
}

export function arquivosDaRevisao(r: RevisaoCarregada): ArquivoDaRevisao[] {
  return r.uploads.map((u) => ({ id: u.id, nome: u.nomeArquivo, ext: extensao(u.nomeArquivo), validado: u.validado }));
}

export function estadoParaTransicao(r: RevisaoCarregada): EstadoParaTransicao {
  return {
    estado: r.estado as EstadoRevisao,
    participa: participaDoCiclo({ chave: r.documento.chave, extensoes: r.uploads.map((u) => extensao(u.nomeArquivo)) }),
    bloqueada: r.controles.some((c) => c.tipo === "bloqueio"),
  };
}

export async function carregarRevisao(db: Tx | typeof prisma, revisaoId: string): Promise<RevisaoCarregada> {
  const r = await db.documentoRevisao.findUnique({ where: { id: revisaoId }, select: selectRevisao });
  if (!r) throw new ActionError("Revisão não encontrada.");
  return r;
}

// ─────────────────────────────────────────────────────────────
// Primitivas (dentro de uma transação já aberta)
// ─────────────────────────────────────────────────────────────

/**
 * O link público e as pastas do cliente leem `DocumentoDisciplina.revisaoCompartilhadaId` /
 * `revisaoLiberadaObraId`. Desde o ciclo esses ponteiros são um ESPELHO do controle ativo
 * (enviado ao cliente / liberado para obra), escrito só aqui — assim o link continua igual e nunca
 * mostra uma revisão que o ciclo não liberou.
 */
const PONTEIRO_DO_CONTROLE: Partial<Record<TipoControle, "revisaoCompartilhadaId" | "revisaoLiberadaObraId">> = {
  enviado_cliente: "revisaoCompartilhadaId",
  liberado_obra: "revisaoLiberadaObraId",
};

/** Muda o estado de UMA revisão. Arquivar tira os controles de pasta junto (I5). */
export async function transicionarNoTx(
  tx: Tx,
  r: RevisaoCarregada,
  acao: AcaoCiclo,
  opts: { quem: QuemAge; motivo?: string | null; detalhe?: Record<string, Prisma.InputJsonValue> },
): Promise<EstadoRevisao> {
  const motivoRecusa = motivoParaNaoTransicionar(acao, estadoParaTransicao(r), {
    ator: opts.quem ? "pessoa" : "sistema",
    motivo: opts.motivo,
  });
  if (motivoRecusa) throw new ActionError(motivoRecusa);

  const para = TRANSICOES[acao].para;
  const agora = new Date();
  const { count } = await tx.documentoRevisao.updateMany({
    where: { id: r.id, estado: r.estado },
    data: { estado: para, estadoEm: agora },
  });
  if (count !== 1) throw new ActionError(MOTIVO_MUDOU);

  await gravarEventoNoTx(tx, {
    documentoId: r.documentoId,
    revisaoId: r.id,
    tipo: "estado",
    userId: opts.quem?.userId ?? null,
    detalhe: {
      de: r.estado,
      para,
      revisao: r.numero,
      ...(opts.motivo?.trim() ? { motivo: opts.motivo.trim() } : {}),
      automatico: opts.quem === null,
      ...opts.detalhe,
    },
  });

  if (para === "arquivado") {
    for (const c of r.controles.filter((c) => CONTROLES_DE_PASTA.includes(c.tipo as TipoControle))) {
      await removerControleNoTx(tx, r, c, { quem: null, motivo: "Revisão arquivada" });
    }
  }
  return para;
}

export async function aplicarControleNoTx(
  tx: Tx,
  r: RevisaoCarregada,
  tipo: TipoControle,
  opts: { quem: QuemAge; motivo: string; escopos?: EscopoBloqueio[]; origem?: string | null; detalhe?: Record<string, Prisma.InputJsonValue> },
): Promise<string> {
  const recusa = motivoParaNaoAplicar(
    tipo,
    { ...estadoParaTransicao(r), estado: r.estado as EstadoRevisao, ativos: r.controles.map((c) => ({ tipo: c.tipo as TipoControle, origem: c.origem })) },
    { motivo: opts.motivo, escopos: opts.escopos },
  );
  if (recusa) throw new ActionError(recusa);

  const criado = await tx.controleRevisao.create({
    data: {
      revisaoId: r.id,
      tipo,
      escopos: tipo === "bloqueio" ? opts.escopos ?? [] : [],
      motivo: opts.motivo.trim(),
      automatico: opts.quem === null,
      origem: opts.origem ?? null,
      aplicadoPorId: opts.quem?.userId ?? null,
    },
    select: { id: true },
  });
  r.controles.push({ id: criado.id, tipo, origem: opts.origem ?? null, escopos: tipo === "bloqueio" ? opts.escopos ?? [] : [] });
  const ponteiro = PONTEIRO_DO_CONTROLE[tipo];
  if (ponteiro) await tx.documentoDisciplina.update({ where: { id: r.documentoId }, data: { [ponteiro]: r.id } });
  await gravarEventoNoTx(tx, {
    documentoId: r.documentoId,
    revisaoId: r.id,
    tipo: "controle_aplicado",
    userId: opts.quem?.userId ?? null,
    detalhe: {
      controle: tipo,
      motivo: opts.motivo.trim(),
      revisao: r.numero,
      automatico: opts.quem === null,
      ...(tipo === "bloqueio" ? { escopos: opts.escopos ?? [] } : {}),
      ...opts.detalhe,
    },
  });
  return criado.id;
}

export async function removerControleNoTx(
  tx: Tx,
  r: RevisaoCarregada,
  c: RevisaoCarregada["controles"][number],
  opts: { quem: QuemAge; motivo?: string | null },
): Promise<void> {
  const recusa = motivoParaNaoRemover({ tipo: c.tipo as TipoControle, origem: c.origem }, { ator: opts.quem ? "pessoa" : "sistema", motivo: opts.motivo });
  if (recusa) throw new ActionError(recusa);
  const { count } = await tx.controleRevisao.updateMany({
    where: { id: c.id, removidoEm: null },
    data: { removidoEm: new Date(), removidoPorId: opts.quem?.userId ?? null, motivoRemocao: opts.motivo?.trim() || null },
  });
  if (count !== 1) throw new ActionError(MOTIVO_MUDOU);
  r.controles = r.controles.filter((x) => x.id !== c.id);
  const ponteiro = PONTEIRO_DO_CONTROLE[c.tipo as TipoControle];
  if (ponteiro) {
    await tx.documentoDisciplina.updateMany({ where: { id: r.documentoId, [ponteiro]: r.id }, data: { [ponteiro]: null } });
  }
  await gravarEventoNoTx(tx, {
    documentoId: r.documentoId,
    revisaoId: r.id,
    tipo: "controle_removido",
    userId: opts.quem?.userId ?? null,
    detalhe: {
      controle: c.tipo,
      revisao: r.numero,
      ...(opts.motivo?.trim() ? { motivo: opts.motivo.trim() } : {}),
      automatico: opts.quem === null,
    },
  });
}

/** Erro do índice "uma publicada por documento" numa corrida vira a mesma frase de "mudou". */
async function emTransacao<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(fn);
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") throw new ActionError(MOTIVO_MUDOU);
    throw err;
  }
}

async function configDoProjeto(db: Tx | typeof prisma, projetoId: string) {
  const c = await db.configDocumentosProjeto.findUnique({ where: { projetoId } });
  return {
    liberarObraAutomaticamente: c?.liberarObraAutomaticamente ?? false,
    permitirPublicarComPendencias: c?.permitirPublicarComPendencias ?? false,
    diasAlertaCompartilhado: c?.diasAlertaCompartilhado ?? 7,
  };
}

// ─────────────────────────────────────────────────────────────
// Operações (cada uma é UMA transação)
// ─────────────────────────────────────────────────────────────

export type ResultadoTransicao = {
  revisaoId: string;
  documentoId: string;
  projetoId: string;
  disciplinaId: string;
  /** Título do documento, ou o nome do arquivo — para as mensagens. */
  nome: string;
  numero: number;
  para: EstadoRevisao;
  /** Autores dos arquivos da revisão + quem criou a revisão (destino das notificações ao autor). */
  autores: string[];
};

function resultado(r: RevisaoCarregada, para: EstadoRevisao): ResultadoTransicao {
  const autores = new Set(r.uploads.map((u) => u.autorId));
  if (r.createdById) autores.add(r.createdById);
  return {
    revisaoId: r.id,
    documentoId: r.documentoId,
    projetoId: r.documento.disciplina.projetoId,
    disciplinaId: r.documento.disciplinaId,
    nome: r.documento.titulo ?? r.documento.nomeArquivo,
    numero: r.numero,
    para,
    autores: [...autores],
  };
}

/**
 * Em andamento → em análise. `verificar` recebe a revisão carregada dentro da transação e lança
 * `ActionError` com a correção específica quando algo falha (A4, `envio-analise.ts`).
 */
export async function enviarParaAnaliseNoBanco(p: {
  revisaoId: string;
  quem: { userId: string };
  /** Descrição da revisão digitada no envio — gravada antes da verificação, que a exige da R01 em diante. */
  descricao?: string | null;
  verificar?: (r: RevisaoCarregada, tx: Tx) => Promise<Record<string, Prisma.InputJsonValue> | void>;
}): Promise<ResultadoTransicao> {
  return emTransacao(async (tx) => {
    const r = await carregarRevisao(tx, p.revisaoId);
    const estrutura = motivoParaNaoTransicionar("enviar_analise", estadoParaTransicao(r), { ator: "pessoa" });
    if (estrutura) throw new ActionError(estrutura);
    if (p.descricao !== undefined) {
      const descricao = p.descricao?.trim() || null;
      await tx.documentoRevisao.update({ where: { id: r.id }, data: { descricao } });
      r.descricao = descricao;
    }
    const detalhe = (await p.verificar?.(r, tx)) ?? undefined;
    const para = await transicionarNoTx(tx, r, "enviar_analise", { quem: p.quem, detalhe });
    return resultado(r, para);
  });
}

/** Em análise → em andamento, com motivo (A8). */
export async function devolverNoBanco(p: { revisaoId: string; quem: { userId: string }; motivo: string }): Promise<ResultadoTransicao> {
  return emTransacao(async (tx) => {
    const r = await carregarRevisao(tx, p.revisaoId);
    const para = await transicionarNoTx(tx, r, "devolver", { quem: p.quem, motivo: p.motivo });
    return resultado(r, para);
  });
}

/** Publicado → arquivado à mão (documento cancelado/obsoleto), com motivo. */
export async function arquivarNoBanco(p: { revisaoId: string; quem: { userId: string }; motivo: string }): Promise<ResultadoTransicao> {
  return emTransacao(async (tx) => {
    const r = await carregarRevisao(tx, p.revisaoId);
    const para = await transicionarNoTx(tx, r, "arquivar", { quem: p.quem, motivo: p.motivo });
    return resultado(r, para);
  });
}

export type ResultadoPublicacao = ResultadoTransicao & {
  /** A1: revisões que saíram do caminho, com o que perderam. */
  substituidas: { revisaoId: string; numero: number; perdeuLiberacaoObra: boolean }[];
  /** N4: o envio ao cliente passou da anterior para esta. */
  enviadoAoClienteHerdado: boolean;
  /** A3: restrição automática aplicada (publicado com pendências). */
  restricaoPendencias: boolean;
  /** A2: o que aconteceu com a liberação automática. */
  liberacaoObra: "liberada" | "nao_configurado" | "restricao";
};

/**
 * Em análise → publicado (aprovação humana, D2-a/D3-c), com as automações na MESMA transação:
 *  - A1: a publicada anterior e qualquer outra revisão aberta do documento vão para arquivado
 *    ("Substituída pela revisão N") e perdem liberado para obra / enviado ao cliente.
 *  - N4: se a anterior estava enviada ao cliente, a nova fica enviada também.
 *  - A3: com pendências permitidas, aplica a restrição automática.
 *  - A2: com a opção do projeto ligada e sem restrição, libera para obra.
 * Bloqueio numa revisão anterior impede o arquivamento dela — e com isso a publicação inteira (I7).
 */
export async function publicarNoBanco(p: {
  revisaoId: string;
  quem: { userId: string };
  justificativa?: string | null;
}): Promise<ResultadoPublicacao> {
  return emTransacao(async (tx) => {
    const r = await carregarRevisao(tx, p.revisaoId);
    const estrutura = motivoParaNaoTransicionar("publicar", estadoParaTransicao(r), { ator: "pessoa" });
    if (estrutura) throw new ActionError(estrutura);

    const projetoId = r.documento.disciplina.projetoId;
    const config = await configDoProjeto(tx, projetoId);
    const pendencias = await tx.pendencia.findMany({
      where: { documentoId: r.documentoId, excluidoEm: null },
      select: { status: true, severidade: true, publicadoEm: true },
    });
    const decisao = decidirPublicacao({
      arquivos: arquivosDaRevisao(r),
      pendencias,
      permitirComPendencias: config.permitirPublicarComPendencias,
      justificativa: p.justificativa,
    });
    if (!decisao.ok) throw new ActionError(decisao.motivo);

    // A1 — ANTES de publicar, as revisões anteriores ainda vivas saem do caminho. Nesta ordem porque o
    // índice "uma publicada por documento" é imediato: publicar primeiro veria duas no meio da transação.
    // Uma revisão mais NOVA (legado anterior ao ciclo) fica onde está: arquivá-la apagaria trabalho.
    const outras = await tx.documentoRevisao.findMany({
      where: {
        documentoId: r.documentoId,
        numero: { lt: r.numero },
        estado: { in: ["em_andamento", "compartilhado", "publicado"] },
      },
      select: { id: true },
      orderBy: { numero: "asc" },
    });
    const substituidas: ResultadoPublicacao["substituidas"] = [];
    let anteriorEnviadaAoCliente = false;
    for (const { id } of outras) {
      const o = await carregarRevisao(tx, id);
      const perdeuLiberacaoObra = o.controles.some((c) => c.tipo === "liberado_obra");
      if (o.controles.some((c) => c.tipo === "enviado_cliente")) anteriorEnviadaAoCliente = true;
      await transicionarNoTx(tx, o, "substituir", { quem: null, motivo: `Substituída pela revisão ${rotuloRevisao(r.numero)}` });
      substituidas.push({ revisaoId: o.id, numero: o.numero, perdeuLiberacaoObra });
    }
    const para = await transicionarNoTx(tx, r, "publicar", {
      quem: p.quem,
      detalhe: decisao.restricao && p.justificativa?.trim() ? { justificativa: p.justificativa.trim() } : undefined,
    });
    r.estado = para;

    // N4 — quem já mandava ao cliente continua mandando: a revisão nova entra no lugar.
    if (anteriorEnviadaAoCliente) {
      await aplicarControleNoTx(tx, r, "enviado_cliente", {
        quem: null,
        origem: "publicacao",
        motivo: "A revisão anterior estava enviada ao cliente; a publicada entra no lugar",
      });
    }

    // A3 — publicado com pendências: restrição automática (sai sozinha quando forem resolvidas).
    if (decisao.restricao) {
      await aplicarControleNoTx(tx, r, "restricao", {
        quem: null,
        origem: "pendencias",
        motivo: decisao.restricao.motivo,
        detalhe: p.justificativa?.trim() ? { justificativa: p.justificativa.trim() } : undefined,
      });
    }

    // A2 — liberação para obra automática.
    const liberacao = decidirLiberacaoAutomatica({
      liberarAutomaticamente: config.liberarObraAutomaticamente,
      temRestricao: r.controles.some((c) => c.tipo === "restricao"),
    });
    if (liberacao === "liberar") {
      await aplicarControleNoTx(tx, r, "liberado_obra", { quem: null, origem: "publicacao", motivo: "Liberação automática na publicação" });
    }

    return {
      ...resultado(r, para),
      substituidas,
      enviadoAoClienteHerdado: anteriorEnviadaAoCliente,
      restricaoPendencias: decisao.restricao !== null,
      liberacaoObra: liberacao === "liberar" ? "liberada" : liberacao,
    };
  });
}

/** Aplica um controle à mão (liberar para obra, enviar ao cliente, bloquear, restringir). */
export async function aplicarControleNoBanco(p: {
  revisaoId: string;
  tipo: TipoControle;
  quem: { userId: string };
  motivo: string;
  escopos?: EscopoBloqueio[];
}): Promise<ResultadoTransicao & { tipo: TipoControle }> {
  return emTransacao(async (tx) => {
    const r = await carregarRevisao(tx, p.revisaoId);
    await aplicarControleNoTx(tx, r, p.tipo, { quem: p.quem, motivo: p.motivo, escopos: p.escopos });
    return { ...resultado(r, r.estado as EstadoRevisao), tipo: p.tipo };
  });
}

/** Remove um controle à mão — o registro fica, com quem/quando/por quê. */
export async function removerControleNoBanco(p: {
  controleId: string;
  quem: { userId: string };
  motivo: string;
}): Promise<ResultadoTransicao & { tipo: TipoControle }> {
  return emTransacao(async (tx) => {
    const c = await tx.controleRevisao.findUnique({ where: { id: p.controleId }, select: { revisaoId: true, removidoEm: true } });
    if (!c || c.removidoEm) throw new ActionError("Este controle já foi removido.");
    const r = await carregarRevisao(tx, c.revisaoId);
    const ativo = r.controles.find((x) => x.id === p.controleId);
    if (!ativo) throw new ActionError("Este controle já foi removido.");
    await removerControleNoTx(tx, r, ativo, { quem: p.quem, motivo: p.motivo });
    return { ...resultado(r, r.estado as EstadoRevisao), tipo: ativo.tipo as TipoControle };
  });
}

/** A3, volta: tira a restrição automática dos apontamentos quando nada mais está em aberto. */
export async function liberarRestricaoDePendencias(documentoId: string): Promise<number> {
  return emTransacao(async (tx) => {
    const abertos = await tx.pendencia.findMany({
      where: { documentoId, excluidoEm: null },
      select: { status: true, severidade: true, publicadoEm: true },
    });
    if (!restricaoDePendenciasPodeSair(abertos)) return 0;
    const restricoes = await tx.controleRevisao.findMany({
      where: { removidoEm: null, tipo: "restricao", origem: "pendencias", revisao: { documentoId } },
      select: { revisaoId: true },
    });
    let removidas = 0;
    for (const { revisaoId } of restricoes) {
      const r = await carregarRevisao(tx, revisaoId);
      for (const c of r.controles.filter((x) => x.tipo === "restricao" && x.origem === "pendencias")) {
        await removerControleNoTx(tx, r, c, { quem: null, motivo: "Todos os apontamentos foram resolvidos" });
        removidas++;
      }
    }
    return removidas;
  });
}

// ─────────────────────────────────────────────────────────────
// Guardas usadas por outras rotas e ações (I6, I7)
// ─────────────────────────────────────────────────────────────

/**
 * I7: bloqueio ativo com o escopo pedido, em alguma revisão dos arquivos. Devolve a frase de recusa ou
 * `null`. Arquivo sem revisão (legado/pasta) nunca é bloqueado por aqui.
 */
export async function motivoBloqueioDosUploads(
  db: Tx | typeof prisma,
  uploadIds: readonly string[],
  escopo: EscopoBloqueio,
): Promise<string | null> {
  if (uploadIds.length === 0) return null;
  const bloqueio = await db.controleRevisao.findFirst({
    where: { removidoEm: null, tipo: "bloqueio", escopos: { has: escopo }, revisao: { uploads: { some: { id: { in: [...uploadIds] } } } } },
    select: { motivo: true, revisao: { select: { numero: true, documento: { select: { nomeArquivo: true } } } } },
  });
  if (!bloqueio) return null;
  const acao = escopo === "download" ? "baixado" : escopo === "exclusao" ? "excluído" : "atualizado";
  return `${bloqueio.revisao.documento.nomeArquivo} (${rotuloRevisao(bloqueio.revisao.numero)}) está bloqueado e não pode ser ${acao}: ${bloqueio.motivo}`;
}

/** I2/I3 na validação: algum dos arquivos é de revisão publicada ou arquivada? */
export async function temRevisaoCongelada(db: Tx | typeof prisma, uploadIds: readonly string[]): Promise<boolean> {
  if (uploadIds.length === 0) return false;
  const n = await db.upload.count({
    where: { id: { in: [...uploadIds] }, substituidoPorId: { not: undefined }, revisao: { estado: { in: ["publicado", "arquivado"] } } },
  });
  return n > 0;
}

/** I7 em lote (.zip): os arquivos com bloqueio de download ativo — o .zip sai sem eles. */
export async function uploadsComBloqueioDeDownload(db: Tx | typeof prisma, uploadIds: readonly string[]): Promise<Set<string>> {
  if (uploadIds.length === 0) return new Set();
  const linhas = await db.upload.findMany({
    where: {
      id: { in: [...uploadIds] },
      substituidoPorId: { not: undefined },
      revisao: { controles: { some: { removidoEm: null, tipo: "bloqueio", escopos: { has: "download" } } } },
    },
    select: { id: true },
  });
  return new Set(linhas.map((l) => l.id));
}

/**
 * I9: dos arquivos pedidos, os que estão numa revisão com liberação para obra ativa e ainda valem
 * (não substituídos). É o recorte de quem tem `arquivos:somente_liberado_obra`.
 */
export async function uploadsLiberadosParaObra(db: Tx | typeof prisma, uploadIds: readonly string[]): Promise<Set<string>> {
  if (uploadIds.length === 0) return new Set();
  const linhas = await db.upload.findMany({
    where: {
      id: { in: [...uploadIds] },
      revisao: { controles: { some: { removidoEm: null, tipo: "liberado_obra" } } },
    },
    select: { id: true },
  });
  return new Set(linhas.map((l) => l.id));
}

/** I7 para envio: bloqueio de atualização em qualquer revisão viva do documento impede arquivo novo. */
export async function motivoBloqueioDoDocumento(db: Tx | typeof prisma, documentoId: string): Promise<string | null> {
  const bloqueio = await db.controleRevisao.findFirst({
    where: { removidoEm: null, tipo: "bloqueio", escopos: { has: "atualizacao" }, revisao: { documentoId } },
    select: { motivo: true, revisao: { select: { numero: true } } },
  });
  return bloqueio ? `Este documento está bloqueado para atualização (${rotuloRevisao(bloqueio.revisao.numero)}): ${bloqueio.motivo}` : null;
}

/**
 * I6 com D5-b: arquivo de revisão publicada ou arquivada não vai para a lixeira — só um admin, com
 * motivo. Devolve a frase de recusa ou `null`.
 */
export async function motivoExclusaoProtegida(
  db: Tx | typeof prisma,
  uploadIds: readonly string[],
  opts: { ehAdmin: boolean; motivo?: string | null },
): Promise<string | null> {
  if (uploadIds.length === 0) return null;
  const protegido = await db.upload.findFirst({
    where: { id: { in: [...uploadIds] }, revisao: { estado: { in: ["publicado", "arquivado"] } } },
    select: { nomeArquivo: true, revisao: { select: { numero: true, estado: true } } },
  });
  if (!protegido?.revisao) return null;
  if (opts.ehAdmin && opts.motivo?.trim()) return null;
  const estado = protegido.revisao.estado === "publicado" ? "publicada" : "arquivada";
  return opts.ehAdmin
    ? `${protegido.nomeArquivo} é de uma revisão ${estado}: informe o motivo da exclusão.`
    : `${protegido.nomeArquivo} é de uma revisão ${estado} e não pode ser excluído. Só um administrador pode, com motivo.`;
}

