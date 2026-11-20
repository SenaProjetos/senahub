import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";
import { rotuloRevisao } from "@/lib/utils";
import { escopoProjeto } from "@/modules/projetos/queries";
import { participaDoCiclo } from "@/modules/uploads/ciclo/escopo";
import { ROTULO_STATUS_PEDIDO, revisaoAindaNasEntregas, type StatusPedido } from "./regras";
import { acessoDoUsuarioAoProjetoDoPortal, type UsuarioDaSessao } from "@/modules/portal/acesso";
import { uploadLiberadoNoAlcance } from "@/modules/projetos/arquivos/link-publico";
import { uploadsComBloqueioDeDownload } from "@/modules/uploads/ciclo/service";
import { lerMarcacao } from "@/modules/projetos/pendencias/marcacao";
import { MODOS_CALIBRACAO, type ModoCalibracao } from "@/modules/projetos/pendencias/medicao";

/**
 * Leituras do pedido de revisão do cliente. Cada view leva só o que a tela mostra: o cliente nunca recebe quem
 * respondeu (só a resposta).
 */

const selectLinha = {
  id: true,
  status: true,
  comentario: true,
  resposta: true,
  createdAt: true,
  respondidoEm: true,
  revisaoId: true,
  uploadId: true,
  autor: { select: { name: true } },
  documento: { select: { chave: true, nomeArquivo: true, titulo: true } },
  revisao: { select: { numero: true, estado: true } },
  upload: { select: { nomeArquivo: true, substituidoPorId: true, excluidoEm: true } },
  anexos: { select: { id: true, nome: true, tamanho: true }, orderBy: { createdAt: "asc" } },
  _count: { select: { marcacoes: true } },
} satisfies Prisma.PedidoRevisaoClienteSelect;

type Linha = Prisma.PedidoRevisaoClienteGetPayload<{ select: typeof selectLinha }>;

/** A revisão do pedido ainda é a das Entregas? Mesma regra do aceite (`revisaoAindaNasEntregas`), lida da linha. */
function aindaNasEntregas(l: Linha): boolean {
  return revisaoAindaNasEntregas({
    estado: l.revisao.estado,
    participa: participaDoCiclo({ chave: l.documento.chave, extensoes: [] }),
    uploadSubstituido: l.upload.substituidoPorId !== null || l.upload.excluidoEm !== null,
    arquivada: l.revisao.estado === "arquivado",
  });
}

function baseDaView(l: Linha) {
  const status = l.status as StatusPedido;
  return {
    id: l.id,
    status,
    rotuloStatus: ROTULO_STATUS_PEDIDO[status],
    comentario: l.comentario,
    resposta: l.resposta,
    criadoEm: l.createdAt.toISOString(),
    respondidoEm: l.respondidoEm?.toISOString() ?? null,
    prancha: l.documento.titulo?.trim() || l.upload.nomeArquivo,
    arquivo: l.upload.nomeArquivo,
    uploadId: l.uploadId,
    revisao: rotuloRevisao(l.revisao.numero),
    autorNome: l.autor.name,
    marcacoes: l._count.marcacoes,
    anexos: l.anexos.map((a) => ({ id: a.id, nome: a.nome, tamanho: a.tamanho })),
    /** Só faz sentido enquanto aguarda: a prancha ganhou revisão nova e o pedido não pode mais ser aceito. */
    revisaoSubstituida: status === "aguardando" && !aindaNasEntregas(l),
  };
}

export type PedidoPortalView = ReturnType<typeof baseDaView>;

/** Pedidos do projeto para o portal (todas as contas do mesmo cliente veem todos). */
export async function pedidosDoProjetoNoPortal(projetoId: string, clienteId: string): Promise<PedidoPortalView[]> {
  const linhas = await prisma.pedidoRevisaoCliente.findMany({
    where: { projetoId, projeto: { clienteId } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: selectLinha,
  });
  return linhas.map(baseDaView);
}

export type FiltroFila = "aguardando" | "respondidos";

const selectFila = {
  ...selectLinha,
  projeto: { select: { id: true, codigo: true, nome: true } },
} satisfies Prisma.PedidoRevisaoClienteSelect;

function viewDaFila(l: Prisma.PedidoRevisaoClienteGetPayload<{ select: typeof selectFila }>) {
  return { ...baseDaView(l), projeto: l.projeto };
}

export type PedidoFilaView = ReturnType<typeof viewDaFila>;

/** Fila da coordenação (`/arquivos/pedidos-cliente`): só projetos que a pessoa enxerga. */
export async function pedidosParaCoordenacao(user: SessionUser, filtro: FiltroFila): Promise<PedidoFilaView[]> {
  const linhas = await prisma.pedidoRevisaoCliente.findMany({
    where: {
      projeto: escopoProjeto(user),
      status: filtro === "aguardando" ? "aguardando" : { not: "aguardando" },
    },
    orderBy: { createdAt: filtro === "aguardando" ? "asc" : "desc" },
    take: 200,
    select: selectFila,
  });
  return linhas.map(viewDaFila);
}

export async function contarPedidosAguardando(user: SessionUser): Promise<number> {
  return prisma.pedidoRevisaoCliente.count({ where: { projeto: escopoProjeto(user), status: "aguardando" } });
}

/** Detalhe de um pedido para a coordenação, com as marcações e o aviso de outro pedido já aceito na revisão. */
export async function pedidoParaCoordenacao(user: SessionUser, id: string) {
  const l = await prisma.pedidoRevisaoCliente.findFirst({
    where: { id, projeto: escopoProjeto(user) },
    select: {
      ...selectFila,
      respondidoPor: { select: { name: true } },
      marcacoes: { orderBy: { ordem: "asc" }, select: { id: true, ordem: true, pagina: true, texto: true, pendenciaId: true } },
    },
  });
  if (!l) return null;
  const outroAceito = await prisma.pedidoRevisaoCliente.count({
    where: { revisaoId: l.revisaoId, status: "aceito", id: { not: l.id } },
  });
  return {
    ...viewDaFila(l),
    respondidoPor: l.respondidoPor?.name ?? null,
    listaMarcacoes: l.marcacoes,
    jaHaPedidoAceitoNaRevisao: outroAceito > 0,
  };
}

export type PedidoDetalheView = NonNullable<Awaited<ReturnType<typeof pedidoParaCoordenacao>>>;

// ─────────────────────────────────────────────────────────────
// Visualizador da prancha (portal e detalhe da coordenação)
// ─────────────────────────────────────────────────────────────

type CalibracaoLida = { pagina: number; mmPorPonto: number; modo: ModoCalibracao };

/** Calibrações da prancha por documento (revisão nova herda a escala), ou pelo upload em linha legada. */
async function calibracoesDe(uploadId: string, documentoId: string | null): Promise<CalibracaoLida[]> {
  const linhas = await prisma.calibracaoPrancha.findMany({
    where: documentoId ? { documentoId } : { uploadId },
    orderBy: { pagina: "asc" },
    select: { pagina: true, mmPorPonto: true, modo: true },
  });
  return linhas.flatMap((l) => {
    const modo = MODOS_CALIBRACAO.find((m) => m === l.modo);
    return modo ? [{ pagina: l.pagina, mmPorPonto: l.mmPorPonto, modo }] : [];
  });
}

const selectMarcacao = {
  id: true,
  ordem: true,
  pagina: true,
  x: true,
  y: true,
  texto: true,
  marcacaoTipo: true,
  marcacaoGeo: true,
  medidaMm: true,
} satisfies Prisma.MarcacaoPedidoClienteSelect;

function marcaDeLeitura(m: Prisma.MarcacaoPedidoClienteGetPayload<{ select: typeof selectMarcacao }>, numero: number) {
  return {
    id: m.id,
    numero,
    pagina: m.pagina,
    x: m.x,
    y: m.y,
    texto: m.texto,
    marcacao: lerMarcacao(m.marcacaoTipo, m.marcacaoGeo),
    medidaMm: m.medidaMm,
  };
}

export type MarcaDeLeituraView = ReturnType<typeof marcaDeLeitura>;

/**
 * A prancha para o visualizador do portal: só PDF das Entregas da conta (mesma regra do download), sem bloqueio de
 * download. Leva as calibrações (cota) e as marcações dos pedidos AGUARDANDO desta revisão, de qualquer conta do
 * mesmo cliente — para ninguém pedir duas vezes a mesma coisa.
 */
export async function pranchaParaPortal(user: UsuarioDaSessao, projetoId: string, uploadId: string) {
  const acesso = await acessoDoUsuarioAoProjetoDoPortal(user, projetoId);
  if (!acesso.ok) return null;
  const liberado = await uploadLiberadoNoAlcance(acesso.alcance, uploadId);
  if (!liberado || !liberado.nomeArquivo.toLowerCase().endsWith(".pdf")) return null;
  if ((await uploadsComBloqueioDeDownload(prisma, [uploadId])).size > 0) return null;
  const up = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: {
      nomeArquivo: true,
      documentoId: true,
      revisaoId: true,
      revisao: { select: { numero: true } },
      disciplina: { select: { projeto: { select: { nome: true } } } },
    },
  });
  if (!up) return null;
  const aguardando = up.revisaoId
    ? await prisma.marcacaoPedidoCliente.findMany({
        where: { pedido: { revisaoId: up.revisaoId, status: "aguardando", projetoId } },
        orderBy: [{ pedido: { createdAt: "asc" } }, { ordem: "asc" }],
        select: selectMarcacao,
      })
    : [];
  return {
    nome: up.nomeArquivo,
    revisao: up.revisao ? rotuloRevisao(up.revisao.numero) : "",
    projetoNome: up.disciplina.projeto.nome,
    calibracoes: await calibracoesDe(uploadId, up.documentoId),
    aguardando: aguardando.map((m, i) => marcaDeLeitura(m, i + 1)),
  };
}

/** Marcações de UM pedido + calibrações, para o detalhe da coordenação (escopo já conferido por quem chama). */
export async function marcacoesDoPedido(pedidoId: string) {
  const p = await prisma.pedidoRevisaoCliente.findUnique({
    where: { id: pedidoId },
    select: {
      uploadId: true,
      documentoId: true,
      marcacoes: { orderBy: { ordem: "asc" }, select: selectMarcacao },
    },
  });
  if (!p) return null;
  return {
    calibracoes: await calibracoesDe(p.uploadId, p.documentoId),
    marcacoes: p.marcacoes.map((m, i) => marcaDeLeitura(m, i + 1)),
  };
}
