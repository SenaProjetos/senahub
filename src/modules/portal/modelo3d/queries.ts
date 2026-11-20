import "server-only";
import { prisma } from "@/lib/prisma";
import { rotuloRevisao } from "@/lib/utils";
import { parseModeloId, refDocumento } from "@/modules/coordenacao/modelo-ref";
import { recebidosDoProjeto, type DocumentoItem } from "@/modules/documentos-cliente/queries";
import { conteudoDoAlcanceSemSelos, uploadLiberadoNoAlcance } from "@/modules/projetos/arquivos/link-publico";
import type { AlcanceArquivos } from "@/modules/projetos/arquivos/link-publico-regras";
import { uploadsComBloqueioDeDownload } from "@/modules/uploads/ciclo/service";
import { acessoDoUsuarioAoProjetoDoPortal, type UsuarioDaSessao } from "../acesso";
import { modeloServidoDaOrigem, type UploadDaCadeia } from "./regras";

export type ModeloDoPortal = {
  /** uploadId servido (a origem ou o realinhado mais recente dela) ou `d:<versaoId>` do IFC recebido. */
  modeloId: string;
  origem: "entrega" | "cliente";
  /** U das Entregas (de onde o modelo servido saiu); `null` no recebido. */
  origemUploadId: string | null;
  documentoRecebidoId: string | null;
  disciplinaId: string | null;
  /** "Estrutural · R00" (`rotuloRevisao`, como nas Entregas) | "Referência enviada por você · base.ifc". */
  rotulo: string;
  situacao: "pronto" | "preparando" | "erro";
  /** Rota do `.frag` no portal, só quando pronto. */
  url: string | null;
};

const ROTULO_RECEBIDO = "Referência enviada por você";
const ehIfc = (nome: string) => /\.ifc$/i.test(nome);

function situacaoDaConversao(status: string | null | undefined): ModeloDoPortal["situacao"] {
  if (status === "concluido") return "pronto";
  if (status === "erro") return "erro";
  return "preparando";
}

function urlDoModelo(projetoId: string, modeloId: string): string {
  return `/api/portal/projetos/${projetoId}/modelos/${modeloId}`;
}

/** A versão IFC que o portal mostra de um documento recebido: a mais recente com arquivo `.ifc`. */
function versaoIfcDoRecebido(d: DocumentoItem) {
  // `versoes` vem por número decrescente.
  return d.versoes.find((v) => ehIfc(v.nomeArquivo)) ?? null;
}

/** IFCs que estão nas Entregas do alcance: o MESMO conteúdo da página (pastas do cliente), um por upload. */
async function ifcsDasEntregas(alcance: AlcanceArquivos) {
  const conteudo = await conteudoDoAlcanceSemSelos(alcance);
  if (!conteudo) return [];
  const porId = new Map<string, { id: string; disciplinaId: string; disciplinaNome: string; versao: number }>();
  for (const d of [...conteudo.situacoes.flatMap((s) => s.disciplinas), ...conteudo.disciplinas]) {
    for (const fase of d.pastas) {
      for (const ext of fase.extensoes) {
        for (const a of ext.arquivos) {
          if (ehIfc(a.nome) && !porId.has(a.id)) {
            porId.set(a.id, { id: a.id, disciplinaId: d.id, disciplinaNome: d.nome, versao: a.versao });
          }
        }
      }
    }
  }
  return [...porId.values()];
}

/**
 * Uploads realinhados das disciplinas (os nós da cadeia). Vê a lixeira para a cadeia não quebrar num elo excluído,
 * mas um excluído nunca conta como convertido (não é servido).
 */
async function cadeiaDasDisciplinas(disciplinaIds: string[]): Promise<UploadDaCadeia[]> {
  if (disciplinaIds.length === 0) return [];
  const linhas = await prisma.upload.findMany({
    where: {
      disciplinaId: { in: disciplinaIds },
      realinhadoDeId: { not: null },
      excluidoEm: { not: undefined },
      substituidoPorId: { not: undefined },
    },
    select: { id: true, realinhadoDeId: true, versao: true, excluidoEm: true, conversao: { select: { status: true } } },
  });
  return linhas.map((u) => ({
    id: u.id,
    realinhadoDeId: u.realinhadoDeId,
    versao: u.versao,
    convertido: u.excluidoEm === null && u.conversao?.status === "concluido",
  }));
}

/**
 * Os modelos 3D que o cliente vê no projeto (spec 2026-11-20, "O que o cliente vê" e D4): um por IFC das Entregas sem
 * bloqueio de download — servido pelo realinhado convertido mais recente dele, ou por ele mesmo — e um por documento
 * recebido do cliente com IFC (a última versão IFC; nunca o Geral). `null` = a pessoa não entra no projeto.
 */
export async function modelosDoPortal(user: UsuarioDaSessao, projetoId: string): Promise<ModeloDoPortal[] | null> {
  const acesso = await acessoDoUsuarioAoProjetoDoPortal(user, projetoId);
  if (!acesso.ok) return null;

  const entregas = await ifcsDasEntregas(acesso.alcance);
  const bloqueados = await uploadsComBloqueioDeDownload(prisma, entregas.map((e) => e.id));
  const liberados = entregas.filter((e) => !bloqueados.has(e.id));

  const cadeia = await cadeiaDasDisciplinas([...new Set(liberados.map((e) => e.disciplinaId))]);
  const servidos = liberados.map((e) => ({ ...e, servido: modeloServidoDaOrigem(e.id, cadeia) }));
  const conversoes = await prisma.conversaoModelo.findMany({
    where: { uploadId: { in: servidos.map((s) => s.servido) } },
    select: { uploadId: true, status: true },
  });
  const statusPorUpload = new Map(conversoes.map((c) => [c.uploadId, c.status]));

  const modelos: ModeloDoPortal[] = servidos.map((s) => {
    const situacao = situacaoDaConversao(statusPorUpload.get(s.servido));
    return {
      modeloId: s.servido,
      origem: "entrega",
      origemUploadId: s.id,
      documentoRecebidoId: null,
      disciplinaId: s.disciplinaId,
      // O mesmo rótulo das Entregas (R00 = emissão original).
      rotulo: `${s.disciplinaNome} · ${rotuloRevisao(s.versao)}`,
      situacao,
      url: situacao === "pronto" ? urlDoModelo(projetoId, s.servido) : null,
    };
  });

  const recebidos = (await recebidosDoProjeto(projetoId))
    .map((d) => ({ documento: d, versao: versaoIfcDoRecebido(d) }))
    .filter((r): r is { documento: DocumentoItem; versao: NonNullable<ReturnType<typeof versaoIfcDoRecebido>> } => r.versao !== null);
  const conversoesRecebidos = await prisma.conversaoModelo.findMany({
    where: { documentoVersaoId: { in: recebidos.map((r) => r.versao.id) } },
    select: { documentoVersaoId: true, status: true },
  });
  const statusPorVersao = new Map(conversoesRecebidos.map((c) => [c.documentoVersaoId, c.status]));
  for (const r of recebidos) {
    const modeloId = refDocumento(r.versao.id);
    const situacao = situacaoDaConversao(statusPorVersao.get(r.versao.id));
    modelos.push({
      modeloId,
      origem: "cliente",
      origemUploadId: null,
      documentoRecebidoId: r.documento.id,
      disciplinaId: null,
      rotulo: `${ROTULO_RECEBIDO} · ${r.versao.nomeArquivo}`,
      situacao,
      url: situacao === "pronto" ? urlDoModelo(projetoId, modeloId) : null,
    });
  }
  return modelos;
}

/** Teto da subida pela cadeia de realinhamento (proteção contra ciclo/dado corrompido). */
const MAX_ELOS = 100;

/**
 * A regra da rota `.frag` do portal: o projeto é da pessoa e o modelo pedido é (a) um IFC das Entregas sem bloqueio de
 * download, ou um realinhado descendente dele, ou (b) a versão IFC que o portal mostra de um documento recebido — com
 * conversão concluída. Nunca outro upload, material do Geral, outro projeto ou outro cliente. `origemUploadId` = o IFC
 * das Entregas de que o modelo saiu (é ele que entra no histórico do documento); `null` no recebido.
 */
export async function modeloPermitidoNoPortal(
  user: UsuarioDaSessao,
  projetoId: string,
  modeloId: string,
): Promise<{ caminhoFrag: string; concluidoEm: Date | null; origemUploadId: string | null } | null> {
  const acesso = await acessoDoUsuarioAoProjetoDoPortal(user, projetoId);
  if (!acesso.ok) return null;
  const ref = parseModeloId(modeloId);

  if (ref.tipo === "documento") {
    const recebidos = await recebidosDoProjeto(projetoId);
    if (!recebidos.some((d) => versaoIfcDoRecebido(d)?.id === ref.id)) return null;
    const conversao = await prisma.conversaoModelo.findUnique({
      where: { documentoVersaoId: ref.id },
      select: { status: true, caminhoFrag: true, concluidoEm: true },
    });
    if (conversao?.status !== "concluido" || !conversao.caminhoFrag) return null;
    return { caminhoFrag: conversao.caminhoFrag, concluidoEm: conversao.concluidoEm, origemUploadId: null };
  }

  // `findUnique` não passa pelo filtro da lixeira: a exclusão é conferida aqui.
  const pedido = await prisma.upload.findUnique({
    where: { id: ref.id },
    select: {
      excluidoEm: true,
      realinhadoDeId: true,
      nomeArquivo: true,
      conversao: { select: { status: true, caminhoFrag: true, concluidoEm: true } },
    },
  });
  if (!pedido || pedido.excluidoEm || !ehIfc(pedido.nomeArquivo)) return null;
  const conversao = pedido.conversao;
  if (conversao?.status !== "concluido" || !conversao.caminhoFrag) return null;

  // O pedido e cada ancestral dele pela cadeia de realinhamento: algum precisa estar nas Entregas.
  const candidatos = [ref.id];
  let pai = pedido.realinhadoDeId;
  while (pai && !candidatos.includes(pai) && candidatos.length < MAX_ELOS) {
    candidatos.push(pai);
    const linha = await prisma.upload.findUnique({ where: { id: pai }, select: { realinhadoDeId: true } });
    pai = linha?.realinhadoDeId ?? null;
  }
  for (const id of candidatos) {
    if (!(await uploadLiberadoNoAlcance(acesso.alcance, id))) continue;
    if ((await uploadsComBloqueioDeDownload(prisma, [id])).size > 0) return null;
    return { caminhoFrag: conversao.caminhoFrag, concluidoEm: conversao.concluidoEm, origemUploadId: id };
  }
  return null;
}
