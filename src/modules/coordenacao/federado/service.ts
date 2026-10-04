// src/modules/coordenacao/federado/service.ts
import "server-only";

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { ActionError } from "@/lib/action-error";
import { existeArquivo, removerArquivo } from "@/lib/storage";
import { notificar } from "@/lib/notificar";
import { rotuloRevisao } from "@/lib/utils";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { modelosCoordenacao } from "@/modules/coordenacao/queries";
import { parseModeloId } from "@/modules/coordenacao/modelo-ref";
import { ORIGEM_MODELO_FEDERADO } from "@/modules/documentos-cliente/origens";
import { inspecionarIfc } from "./inspecao";
import { federar, type SpawnFederar } from "./federacao";
import { GRUPO_FEDERADO, MINUTOS_GERACAO_TRAVADA, avaliarSelecao, type CandidatoFederado } from "./regras";

export type ItemComposicao = {
  modeloId: string;
  tipo: "upload" | "documento";
  refId: string;
  caminho: string;
  nome: string;
  grupo: string;
  revisao: string;
  tamanho: number;
};

export type VersaoFederada = {
  versaoId: string;
  documentoId: string;
  numero: number;
  revisao: string;
  nomeArquivo: string;
  tamanho: number;
  criadoEm: string;
  autor: string | null;
  downloadUrl: string;
  composicao: { nome: string; grupo: string; revisao: string }[];
  avisos: string[];
};

/** `DocumentoVersao.tamanho` é `Int`: um arquivo maior que isto não cabe na linha (spec §5.4). */
const TAMANHO_MAX_INT = 2_147_483_647;

/** Modelos da Compatibilização, com o caminho do IFC e a inspeção de schema/unidade — na ordem do painel. */
export async function candidatosDoProjeto(projetoId: string): Promise<(CandidatoFederado & { item: ItemComposicao })[]> {
  const modelos = await modelosCoordenacao(projetoId);
  const uploadIds = modelos.filter((m) => m.tipo === "upload").map((m) => m.uploadId);
  const versaoIds = modelos.filter((m) => m.tipo === "documento").map((m) => parseModeloId(m.uploadId).id);
  const [uploads, versoes] = [
    await prisma.upload.findMany({ where: { id: { in: uploadIds } }, select: { id: true, caminho: true } }),
    await prisma.documentoVersao.findMany({ where: { id: { in: versaoIds } }, select: { id: true, caminho: true } }),
  ];
  const caminhoDe = new Map([...uploads, ...versoes].map((x) => [x.id, x.caminho]));

  const saida: (CandidatoFederado & { item: ItemComposicao })[] = [];
  for (const m of modelos) {
    const refId = parseModeloId(m.uploadId).id;
    const caminho = caminhoDe.get(refId) ?? "";
    const inspecao = caminho ? await inspecionarIfc(caminho) : null;
    const revisao = rotuloRevisao(m.versao);
    saida.push({
      modeloId: m.uploadId,
      nome: m.nomeArquivo,
      grupo: m.disciplinaNome,
      revisao,
      tamanho: m.tamanho,
      convertido: m.conversao?.status === "concluido",
      arquivoExiste: inspecao !== null,
      schema: inspecao?.schema ?? null,
      unidade: inspecao ? inspecao.unidade : undefined,
      item: { modeloId: m.uploadId, tipo: m.tipo, refId, caminho, nome: m.nomeArquivo, grupo: m.disciplinaNome, revisao, tamanho: m.tamanho },
    });
  }
  return saida;
}

/**
 * Libera geração que ficou viva demais (servidor reiniciou no meio): sem isso o projeto travaria para sempre.
 * `fila` conta da criação; `processando` conta do início — o child tem timeout de 30 min, então uma geração
 * que começou há menos de 45 min pode estar viva e não é tocada.
 */
async function liberarTravadas(projetoId: string) {
  const limite = new Date(Date.now() - MINUTOS_GERACAO_TRAVADA * 60 * 1000);
  await prisma.geracaoModeloFederado.updateMany({
    where: {
      projetoId,
      OR: [
        { status: "fila", criadoEm: { lt: limite } },
        { status: "processando", OR: [{ iniciadoEm: { lt: limite } }, { iniciadoEm: null }] },
      ],
    },
    data: { status: "erro", erro: "Interrompida — o servidor reiniciou durante a geração.", concluidoEm: new Date() },
  });
}

export async function criarGeracao(a: { projetoId: string; modeloIds: string[]; autorId: string }): Promise<{ geracaoId: string }> {
  const candidatos = await candidatosDoProjeto(a.projetoId);
  const desconhecido = a.modeloIds.find((id) => !candidatos.some((c) => c.modeloId === id));
  if (desconhecido) throw new ActionError("Um dos modelos marcados não existe mais. Recarregue a página.");
  const avaliacao = avaliarSelecao(candidatos, a.modeloIds);
  const bloqueado = candidatos.find((c) => a.modeloIds.includes(c.modeloId) && avaliacao.motivos[c.modeloId]);
  if (bloqueado) throw new ActionError(`${bloqueado.nome}: ${avaliacao.motivos[bloqueado.modeloId]}`);
  if (!avaliacao.podeGerar) throw new ActionError(avaliacao.motivoGerar ?? "Não foi possível gerar.");

  await liberarTravadas(a.projetoId);
  // Ordem do painel, não a do clique: o primeiro é o mestre (schema, unidade, IfcProject).
  const composicao = candidatos.filter((c) => avaliacao.validos.includes(c.modeloId)).map((c) => c.item);
  try {
    const g = await prisma.geracaoModeloFederado.create({
      data: { projetoId: a.projetoId, autorId: a.autorId, composicao: composicao as unknown as Prisma.InputJsonValue, status: "fila" },
      select: { id: true },
    });
    return { geracaoId: g.id };
  } catch (e) {
    // Índice único parcial "uma geração viva por projeto": dois cliques ao mesmo tempo não criam duas.
    if ((e as { code?: string }).code === "P2002") {
      throw new ActionError("Já há uma geração do modelo federado em andamento neste projeto.");
    }
    throw e;
  }
}

async function avisarAutor(autorId: string, projetoId: string, titulo: string, corpo: string) {
  await notificar(
    autorId,
    { titulo, corpo, href: `/projetos/${projetoId}/arquivos?pasta=desenvolvimento&area=federado` },
    { categoria: "coordenacao" },
  );
}

function contarConcluidas(db: Pick<Prisma.TransactionClient, "geracaoModeloFederado">, projetoId: string): Promise<number> {
  return db.geracaoModeloFederado.count({ where: { projetoId, status: "concluido" } });
}

/** A linha deixou de estar `processando` (foi liberada como travada): o resultado desta execução é descartado. */
class GeracaoLiberada extends Error {}

export async function processarGeracao(geracaoId: string, deps: { rodar?: SpawnFederar; notificarAutor?: boolean } = {}): Promise<void> {
  const tomada = await prisma.geracaoModeloFederado.updateMany({
    where: { id: geracaoId, status: "fila" },
    data: { status: "processando", iniciadoEm: new Date() },
  });
  if (tomada.count !== 1) return; // outra execução já pegou, ou foi liberada como travada

  const g = await prisma.geracaoModeloFederado.findUniqueOrThrow({
    where: { id: geracaoId },
    include: { projeto: { select: { codigo: true, clienteId: true } }, autor: { select: { name: true } } },
  });
  const composicao = g.composicao as unknown as ItemComposicao[];
  const notificarAutor = deps.notificarAutor !== false;

  const falhar = async (erro: string) => {
    const r = await prisma.geracaoModeloFederado.updateMany({
      where: { id: geracaoId, status: "processando" },
      data: { status: "erro", erro, concluidoEm: new Date() },
    });
    if (r.count === 1 && notificarAutor) {
      await avisarAutor(g.autorId, g.projetoId, "Não foi possível gerar o modelo federado", erro);
    }
  };

  for (const item of composicao) {
    if (!(await existeArquivo(item.caminho))) return falhar(`O arquivo de ${item.nome} (${item.grupo}) não está mais no servidor.`);
  }

  // Revisão nunca é reaproveitada (spec §7: a composição diz PARA SEMPRE o que entrou em cada R): conta as gerações
  // concluídas do projeto, não as versões que sobraram — excluir a R01 (ou o federado inteiro) não devolve o número.
  const concluidasAntes = await contarConcluidas(prisma, g.projetoId);
  const numero = concluidasAntes + 1;
  const nomeArquivo = `${formatarCodigo(g.projeto.codigo)}-FEDERADO-${rotuloRevisao(numero)}.ifc`;
  const saida = `documentos/${g.projeto.clienteId}/${randomBytes(12).toString("hex")}.ifc`;

  const r = await federar(
    {
      entradas: composicao.map((c) => ({ caminho: c.caminho, rotulo: c.nome })),
      saida,
      cabecalho: {
        nomeArquivo,
        autor: g.autor.name ?? "SenaHub",
        quando: new Date().toISOString().slice(0, 19),
        composicao: composicao.map((c) => ({ nome: c.nome, grupo: c.grupo, revisao: c.revisao })),
      },
    },
    deps.rodar,
  );
  if (!r.ok) {
    // O child só apaga o parcial nos próprios caminhos de erro; timeout (kill) ou queda por memória deixam GBs no disco.
    await removerArquivo(`${saida}.parcial`);
    await removerArquivo(saida);
    return falhar(r.erro);
  }
  if (r.tamanho > TAMANHO_MAX_INT) {
    await removerArquivo(saida);
    return falhar("O modelo federado passou de 2 GB. Desmarque algum modelo e gere de novo.");
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Não pode mudar (uma geração viva por projeto); se mudou, falha em vez de gravar um R repetido.
      if ((await contarConcluidas(tx, g.projetoId)) !== concluidasAntes) throw new Error("Contagem de gerações concluídas mudou.");
      // Lido aqui dentro: o federado pode ter sido excluído enquanto o child rodava.
      const doc = await tx.documento.findFirst({ where: { projetoId: g.projetoId, origem: ORIGEM_MODELO_FEDERADO }, select: { id: true } });
      const documentoId =
        doc?.id ??
        (
          await tx.documento.create({
            data: {
              clienteId: g.projeto.clienteId,
              projetoId: g.projetoId,
              origem: ORIGEM_MODELO_FEDERADO,
              canal: "interno",
              nome: GRUPO_FEDERADO,
              categoria: "modelo_federado",
              autorId: g.autorId,
            },
            select: { id: true },
          })
        ).id;
      const versao = await tx.documentoVersao.create({
        data: { documentoId, numero, caminho: saida, nomeArquivo, mime: "application/x-step", tamanho: r.tamanho, hashSha256: r.sha256, autorId: g.autorId },
        select: { id: true },
      });
      const fim = await tx.geracaoModeloFederado.updateMany({
        where: { id: geracaoId, status: "processando" },
        data: { status: "concluido", documentoVersaoId: versao.id, avisos: r.avisos, concluidoEm: new Date() },
      });
      if (fim.count !== 1) throw new GeracaoLiberada();
    });
  } catch (e) {
    await removerArquivo(saida);
    if (e instanceof GeracaoLiberada) return;
    console.error(`[federado] falha ao registrar a geração ${geracaoId}:`, e);
    return falhar("Falha ao registrar o modelo federado. Tente gerar de novo.");
  }
  if (notificarAutor) {
    await avisarAutor(g.autorId, g.projetoId, `Modelo federado ${rotuloRevisao(numero)} pronto`, `${composicao.length} modelos em ${nomeArquivo}.`);
  }
}

export async function ultimaGeracao(projetoId: string) {
  return prisma.geracaoModeloFederado.findFirst({
    where: { projetoId },
    orderBy: { criadoEm: "desc" },
    select: {
      id: true, status: true, erro: true, avisos: true, criadoEm: true, concluidoEm: true,
      autor: { select: { name: true } },
      documentoVersao: { select: { id: true, numero: true, nomeArquivo: true } },
    },
  });
}

export async function versoesDoModeloFederado(projetoId: string): Promise<VersaoFederada[]> {
  const doc = await prisma.documento.findFirst({
    where: { projetoId, origem: ORIGEM_MODELO_FEDERADO },
    select: {
      id: true,
      versoes: {
        orderBy: { numero: "desc" },
        select: {
          id: true, numero: true, nomeArquivo: true, tamanho: true, createdAt: true,
          geracaoFederado: { select: { composicao: true, avisos: true, autor: { select: { name: true } } } },
        },
      },
    },
  });
  if (!doc) return [];
  return doc.versoes.map((v) => ({
    versaoId: v.id,
    documentoId: doc.id,
    numero: v.numero,
    revisao: rotuloRevisao(v.numero),
    nomeArquivo: v.nomeArquivo,
    tamanho: v.tamanho,
    criadoEm: v.createdAt.toISOString(),
    autor: v.geracaoFederado?.autor.name ?? null,
    downloadUrl: `/api/documentos/${v.id}/download`,
    composicao: ((v.geracaoFederado?.composicao ?? []) as unknown as ItemComposicao[]).map((c) => ({ nome: c.nome, grupo: c.grupo, revisao: c.revisao })),
    avisos: (v.geracaoFederado?.avisos ?? []) as string[],
  }));
}
