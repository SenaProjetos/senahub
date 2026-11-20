import "server-only";
import { prisma } from "@/lib/prisma";
import { rotuloRevisao } from "@/lib/utils";
import { parseModeloId, refDocumento } from "@/modules/coordenacao/modelo-ref";
import { recebidosDoProjeto } from "@/modules/documentos-cliente/queries";
import { conteudoDoAlcanceSemSelos } from "@/modules/projetos/arquivos/link-publico";
import type { AlcanceArquivos } from "@/modules/projetos/arquivos/link-publico-regras";
import { uploadsComBloqueioDeDownload } from "@/modules/uploads/ciclo/service";
import { acessoDoUsuarioAoProjetoDoPortal, type UsuarioDaSessao } from "../acesso";
import { modeloServidoDaOrigem, versaoIfcDoRecebido, type UploadDaCadeia } from "./regras";

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
  /** Nome do arquivo IFC (o das Entregas; o da versão no recebido) — dois IFCs da mesma disciplina e revisão. */
  nomeArquivo: string;
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

/** IFCs que estão nas Entregas do alcance: o MESMO conteúdo da página (pastas do cliente), um por upload. */
async function ifcsDasEntregas(alcance: AlcanceArquivos) {
  const conteudo = await conteudoDoAlcanceSemSelos(alcance);
  if (!conteudo) return [];
  const porId = new Map<string, { id: string; nome: string; disciplinaId: string; disciplinaNome: string; versao: number }>();
  for (const d of [...conteudo.situacoes.flatMap((s) => s.disciplinas), ...conteudo.disciplinas]) {
    for (const fase of d.pastas) {
      for (const ext of fase.extensoes) {
        for (const a of ext.arquivos) {
          if (ehIfc(a.nome) && !porId.has(a.id)) {
            porId.set(a.id, { id: a.id, nome: a.nome, disciplinaId: d.id, disciplinaNome: d.nome, versao: a.versao });
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
 * recebido do cliente com IFC (a IFC mais nova já convertida, `versaoIfcDoRecebido`; nunca o Geral). `null` = a pessoa não entra no projeto.
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
      nomeArquivo: s.nome,
      situacao,
      url: situacao === "pronto" ? urlDoModelo(projetoId, s.servido) : null,
    };
  });

  // A versão servida de cada recebido depende de quais já converteram: lê as conversões de TODAS as versões IFC.
  const documentos = await recebidosDoProjeto(projetoId);
  const versoesIfc = documentos.flatMap((d) => d.versoes.filter((v) => ehIfc(v.nomeArquivo)).map((v) => v.id));
  const conversoesRecebidos = await prisma.conversaoModelo.findMany({
    where: { documentoVersaoId: { in: versoesIfc } },
    select: { documentoVersaoId: true, status: true },
  });
  const statusPorVersao = new Map(conversoesRecebidos.map((c) => [c.documentoVersaoId, c.status]));
  const concluidas = new Set(conversoesRecebidos.flatMap((c) => (c.status === "concluido" && c.documentoVersaoId ? [c.documentoVersaoId] : [])));
  const recebidos = documentos.flatMap((d) => {
    const versao = versaoIfcDoRecebido(d.versoes, concluidas);
    return versao ? [{ documento: d, versao }] : [];
  });
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
      nomeArquivo: r.versao.nomeArquivo,
      situacao,
      url: situacao === "pronto" ? urlDoModelo(projetoId, modeloId) : null,
    });
  }
  return modelos;
}

/**
 * A regra da rota `.frag` do portal: o modelo pedido é um dos que `modelosDoPortal` devolve PRONTO para esta pessoa —
 * a mesma lista da tela, nunca uma regra paralela. Assim um realinhado antigo (substituído por outro mais novo), a
 * origem quando já há realinhado servido, a versão IFC antiga de um recebido, a lixeira, o compartilhamento revogado,
 * o bloqueio de download, outro projeto ou outro cliente dão 404. `origemUploadId` = o IFC das Entregas de que o modelo
 * saiu (é ele que entra no histórico do documento); `null` no recebido.
 */
export async function modeloPermitidoNoPortal(
  user: UsuarioDaSessao,
  projetoId: string,
  modeloId: string,
): Promise<{ caminhoFrag: string; concluidoEm: Date | null; origemUploadId: string | null } | null> {
  const modelos = await modelosDoPortal(user, projetoId);
  const modelo = modelos?.find((m) => m.modeloId === modeloId && m.situacao === "pronto");
  if (!modelo) return null;
  const ref = parseModeloId(modelo.modeloId);
  const conversao = await prisma.conversaoModelo.findUnique({
    where: ref.tipo === "documento" ? { documentoVersaoId: ref.id } : { uploadId: ref.id },
    select: { status: true, caminhoFrag: true, concluidoEm: true },
  });
  if (conversao?.status !== "concluido" || !conversao.caminhoFrag) return null;
  return { caminhoFrag: conversao.caminhoFrag, concluidoEm: conversao.concluidoEm, origemUploadId: modelo.origemUploadId };
}
