import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/with-action";
import { notificar, notificarMuitos } from "@/lib/notificar";
import { smtpConfigurado } from "@/lib/mail";
import { enviarEmailTemplate } from "@/lib/email-templates";
import { whereAudiencia } from "@/lib/audiencias";
import { can } from "@/lib/permissions";
import { copiarArquivo, removerArquivo } from "@/lib/storage";
import type { SessionUser } from "@/lib/session";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { destinatariosDaConclusao } from "@/modules/planejamento/conclusao-aviso";
import { acessoDoUsuarioAoProjetoDoPortal, type UsuarioDaSessao } from "@/modules/portal/acesso";
import { uploadLiberadoNoAlcance } from "@/modules/projetos/arquivos/link-publico";
import {
  aplicarControleNoTx,
  carregarRevisao,
  estadoParaTransicao,
  uploadsComBloqueioDeDownload,
} from "@/modules/uploads/ciclo/service";
import { exigirEscopoDaRevisao } from "@/modules/uploads/ciclo/acesso";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { criarPendenciaNoTx } from "@/modules/projetos/pendencias/criar-service";
import { criarApontamentoCoordenacaoNoTx, type CameraApontamento } from "@/modules/coordenacao/apontamento-service";
import { parseModeloId } from "@/modules/coordenacao/modelo-ref";
import { modelosDoPortal } from "@/modules/portal/modelo3d/queries";
import { colunasDaMarcacao } from "@/modules/projetos/pendencias/marcacao-schema";
import { MODOS_CALIBRACAO } from "@/modules/projetos/pendencias/medicao";
import { congelarMarcacao, dadosDoRascunho, type MarcacaoCongelada, type MarcacaoDoPedido } from "./conversao";
import {
  LIMITE_COMENTARIO,
  LIMITE_TEXTO_MARCACAO,
  MAX_MARCACOES,
  LIMITE_RESPOSTA,
  MOTIVO_JA_RESPONDIDO,
  motivoEmRevisao,
  motivoParaNaoAceitar,
  motivoParaNaoCancelar,
  motivoParaNaoRecusar,
  motivoDoAnexo,
  motivoDoLimiteDePedidos,
  revisaoNasPastas,
  linhaRespostaEmail,
  situacaoDaResposta,
  textoPedidoNovo,
  textoResposta,
  type EstadoDaRevisao,
  type SituacaoDaRevisao,
  type StatusPedido,
} from "./regras";
import {
  MAX_GUIDS_MARCACAO,
  ROTULO_MODELO_3D,
  apontamentoDaMarcacao,
  motivoParaNaoAceitarModelo,
  situacaoDaMarcacao,
} from "./modelo-regras";

/**
 * Pedido de revisão do cliente (spec 2026-11-19-portal-pedido-revisao-design.md). O ÚNICO lugar que grava
 * `PedidoRevisaoCliente`: toda troca de status é `updateMany` condicionado a `aguardando` (dois cliques, ou aceite e
 * cancelamento ao mesmo tempo, = um só vence). O aceite é a única porta para `Pendencia`/`ControleRevisao` (prancha) e
 * para `ApontamentoCoordenacao` (modelo 3D), pelos serviços de sempre.
 */

type Tx = Prisma.TransactionClient;

export const MOTIVO_PRANCHA_FORA = "Esta prancha não está nas suas entregas.";
export const MOTIVO_PEDIDO_NAO_ENCONTRADO = "Pedido não encontrado.";

function textoObrigatorio(valor: string, limite: number, vazio: string, longo: string): string {
  const t = valor.trim();
  if (!t) throw new ActionError(vazio);
  if (t.length > limite) throw new ActionError(longo);
  return t;
}

/**
 * A prancha em que o cliente quer pedir: conta do portal com acesso ao projeto, upload PDF nas Entregas (mesma regra
 * do download) e sem bloqueio de download. Devolve o que o pedido grava.
 */
export async function pranchaDoPedido(autor: UsuarioDaSessao, projetoId: string, uploadId: string) {
  const acesso = await acessoDoUsuarioAoProjetoDoPortal(autor, projetoId);
  if (!acesso.ok) throw new ActionError(MOTIVO_PRANCHA_FORA);
  const liberado = await uploadLiberadoNoAlcance(acesso.alcance, uploadId);
  if (!liberado || !liberado.nomeArquivo.toLowerCase().endsWith(".pdf")) throw new ActionError(MOTIVO_PRANCHA_FORA);
  if ((await uploadsComBloqueioDeDownload(prisma, [uploadId])).size > 0) throw new ActionError(MOTIVO_PRANCHA_FORA);
  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: { id: true, documentoId: true, revisaoId: true, disciplinaId: true },
  });
  if (!upload?.documentoId || !upload.revisaoId) throw new ActionError(MOTIVO_PRANCHA_FORA);
  return { projetoId, uploadId: upload.id, documentoId: upload.documentoId, revisaoId: upload.revisaoId };
}

/** Marcação como vem da tela: a do pedido + as dimensões da página em pontos (só a cota usa, para medir). */
export type MarcacaoRecebida = MarcacaoDoPedido & { paginaPt?: { w: number; h: number } | null };

/**
 * Congela as marcações: textos conferidos e a cota recalculada pela calibração da prancha (por documento; linha
 * legada sem documento, pelo upload). Qualquer marcação inválida recusa o pedido inteiro, sem gravar nada.
 */
async function congelarMarcacoes(
  marcacoes: readonly MarcacaoRecebida[],
  prancha: { documentoId: string; uploadId: string },
): Promise<MarcacaoCongelada[]> {
  if (marcacoes.length > MAX_MARCACOES) throw new ActionError(`O pedido aceita no máximo ${MAX_MARCACOES} marcações.`);
  if (marcacoes.length === 0) return [];
  const calibracoes = await prisma.calibracaoPrancha.findMany({
    where: { OR: [{ documentoId: prancha.documentoId }, { uploadId: prancha.uploadId }] },
    select: { pagina: true, mmPorPonto: true, modo: true, documentoId: true },
  });
  const daPagina = (pagina: number) => {
    const c = calibracoes.find((x) => x.pagina === pagina && x.documentoId) ?? calibracoes.find((x) => x.pagina === pagina);
    const modo = MODOS_CALIBRACAO.find((m) => m === c?.modo);
    return c && modo ? { mmPorPonto: c.mmPorPonto, modo } : null;
  };
  const congeladas: MarcacaoCongelada[] = [];
  for (const m of marcacoes) {
    const texto = textoObrigatorio(
      m.texto,
      LIMITE_TEXTO_MARCACAO,
      "Escreva o que mudar em cada marcação.",
      `O texto de uma marcação passa de ${LIMITE_TEXTO_MARCACAO} caracteres.`,
    );
    const r = congelarMarcacao(
      { pagina: m.pagina, x: m.x, y: m.y, texto, marcacao: m.marcacao },
      { calibracao: daPagina(m.pagina), paginaPt: m.paginaPt ?? null },
    );
    if ("erro" in r) throw new ActionError(r.erro);
    congeladas.push(r);
  }
  return congeladas;
}

export async function criarPedidoNoBanco(p: {
  autor: UsuarioDaSessao;
  projetoId: string;
  uploadId: string;
  comentario: string;
  marcacoes?: readonly MarcacaoRecebida[];
}): Promise<{ id: string }> {
  const comentario = textoObrigatorio(
    p.comentario,
    LIMITE_COMENTARIO,
    "Escreva o que você quer revisar.",
    `O comentário passa de ${LIMITE_COMENTARIO} caracteres.`,
  );
  const prancha = await pranchaDoPedido(p.autor, p.projetoId, p.uploadId);
  const limite = motivoDoLimiteDePedidos(
    await prisma.pedidoRevisaoCliente.count({ where: { autorId: p.autor.id, projetoId: p.projetoId, status: "aguardando" } }),
  );
  if (limite) throw new ActionError(limite);
  const marcacoes = await congelarMarcacoes(p.marcacoes ?? [], prancha);
  const criado = await prisma.pedidoRevisaoCliente.create({
    data: {
      ...prancha,
      autorId: p.autor.id,
      comentario,
      marcacoes: {
        create: marcacoes.map((m, ordem) => ({
          ordem,
          pagina: m.pagina,
          x: m.x,
          y: m.y,
          texto: m.texto,
          ...colunasDaMarcacao(m.marcacao),
          medidaMm: m.medida?.mm ?? null,
          medidaFator: m.medida?.fator ?? null,
          medidaModo: m.medida?.modo ?? null,
        })),
      },
    },
    select: { id: true },
  });
  return criado;
}

/** O cliente (qualquer conta do MESMO cliente do projeto, com acesso ao portal) cancela enquanto aguarda. */
export async function cancelarPedidoNoBanco(p: { id: string; autor: UsuarioDaSessao }): Promise<void> {
  const pedido = await prisma.pedidoRevisaoCliente.findUnique({ where: { id: p.id }, select: { projetoId: true, status: true } });
  if (!pedido) throw new ActionError(MOTIVO_PEDIDO_NAO_ENCONTRADO);
  const acesso = await acessoDoUsuarioAoProjetoDoPortal(p.autor, pedido.projetoId);
  if (!acesso.ok) throw new ActionError(MOTIVO_PEDIDO_NAO_ENCONTRADO);
  const motivo = motivoParaNaoCancelar({ status: pedido.status as StatusPedido });
  if (motivo) throw new ActionError(motivo);
  const { count } = await prisma.pedidoRevisaoCliente.updateMany({
    where: { id: p.id, status: "aguardando" },
    data: { status: "cancelado", canceladoEm: new Date() },
  });
  if (count !== 1) throw new ActionError(MOTIVO_JA_RESPONDIDO);
}

/** A revisão do pedido ainda é a das Entregas? Lê o estado do ciclo e se o PDF do pedido foi substituído/excluído. */
export async function estadoDaRevisaoDoPedido(
  db: Tx | typeof prisma,
  pedido: { revisaoId: string; uploadId: string },
): Promise<EstadoDaRevisao> {
  const r = await carregarRevisao(db, pedido.revisaoId);
  const up = await db.upload.findFirst({
    where: { id: pedido.uploadId, substituidoPorId: { not: undefined } },
    select: { substituidoPorId: true, excluidoEm: true },
  });
  const doc = await db.documentoDisciplina.findUnique({
    where: { id: r.documentoId },
    select: { revisaoCompartilhadaId: true, revisaoLiberadaObraId: true },
  });
  return {
    ...revisaoNasPastas(doc, r.id),
    estado: r.estado,
    participa: estadoParaTransicao(r).participa,
    uploadSubstituido: up?.substituidoPorId != null,
    uploadExcluido: !up || up.excluidoEm !== null,
    arquivada: r.estado === "arquivado",
  };
}

export type ResultadoAceite = { emRevisao: boolean; jaEstavaEmRevisao: boolean; rascunhos: number };

/**
 * Aceita: status → aceito; revisão publicada do ciclo ganha "Em revisão" (motivo = o pedido), se ainda não tiver —
 * sem avisar os projetistas (nada chega a eles antes da rodada). Uma transação; a linha da revisão é travada para
 * dois aceites de pedidos diferentes na mesma revisão não disputarem a marca.
 */
export async function aceitarPedidoNoBanco(p: {
  id: string;
  quem: { id: string; podeValidar: boolean };
  resposta: string | null;
}): Promise<ResultadoAceite> {
  const resposta = p.resposta?.trim() ? p.resposta.trim() : null;
  if (resposta && resposta.length > LIMITE_RESPOSTA) throw new ActionError(`A resposta passa de ${LIMITE_RESPOSTA} caracteres.`);
  return prisma.$transaction(async (tx) => {
    const pedido = await tx.pedidoRevisaoCliente.findUnique({
      where: { id: p.id },
      select: {
        id: true,
        tipo: true,
        status: true,
        revisaoId: true,
        uploadId: true,
        comentario: true,
        autor: { select: { name: true } },
        upload: { select: { documentoId: true, disciplinaId: true, disciplina: { select: { projetoId: true } } } },
        marcacoes: {
          orderBy: { ordem: "asc" },
          select: { id: true, pagina: true, x: true, y: true, texto: true, marcacaoTipo: true, marcacaoGeo: true, medidaMm: true, medidaFator: true, medidaModo: true },
        },
        _count: { select: { anexos: true } },
      },
    });
    // O pedido de modelo tem o seu aceite (`aceitarPedidoModeloNoBanco`); aqui só a prancha, com os três campos.
    if (!pedido || pedido.tipo !== "prancha" || !pedido.revisaoId || !pedido.uploadId || !pedido.upload) {
      throw new ActionError(MOTIVO_PEDIDO_NAO_ENCONTRADO);
    }
    const revisaoId = pedido.revisaoId;
    await tx.$queryRaw`SELECT id FROM documento_revisao WHERE id = ${revisaoId} FOR UPDATE`;
    const revisao = await estadoDaRevisaoDoPedido(tx, { revisaoId, uploadId: pedido.uploadId });
    const motivo = motivoParaNaoAceitar({ status: pedido.status as StatusPedido, podeValidar: p.quem.podeValidar, revisao });
    if (motivo) throw new ActionError(motivo);

    const { count } = await tx.pedidoRevisaoCliente.updateMany({
      where: { id: pedido.id, status: "aguardando" },
      data: { status: "aceito", resposta, respondidoPorId: p.quem.id, respondidoEm: new Date() },
    });
    if (count !== 1) throw new ActionError(MOTIVO_JA_RESPONDIDO);

    let emRevisao = false;
    let jaEstavaEmRevisao = false;
    if (revisao.participa && revisao.estado === "publicado") {
      const r = await carregarRevisao(tx, revisaoId);
      jaEstavaEmRevisao = r.controles.some((c) => c.tipo === "em_revisao");
      if (!jaEstavaEmRevisao) {
        await aplicarControleNoTx(tx, r, "em_revisao", {
          quem: { userId: p.quem.id },
          motivo: motivoEmRevisao(pedido.comentario),
          origem: "pedido_cliente",
          detalhe: { pedidoId: pedido.id },
        });
        emRevisao = true;
      }
    }

    // Cada marcação vira um RASCUNHO de apontamento de quem aceitou, no mesmo PDF, pelo caminho único de criação.
    const upload = {
      id: pedido.uploadId,
      documentoId: pedido.upload.documentoId,
      disciplinaId: pedido.upload.disciplinaId,
      projetoId: pedido.upload.disciplina.projetoId,
    };
    for (const m of pedido.marcacoes) {
      const criada = await criarPendenciaNoTx(tx, {
        upload,
        autorId: p.quem.id,
        dados: dadosDoRascunho(m, { nomeAutor: pedido.autor.name, temAnexos: pedido._count.anexos > 0 }),
      });
      await tx.marcacaoPedidoCliente.update({ where: { id: m.id }, data: { pendenciaId: criada.id } });
    }
    return { emRevisao, jaEstavaEmRevisao, rascunhos: pedido.marcacoes.length };
  });
}

export async function recusarPedidoNoBanco(p: { id: string; quem: { id: string }; resposta: string }): Promise<void> {
  const pedido = await prisma.pedidoRevisaoCliente.findUnique({ where: { id: p.id }, select: { status: true } });
  if (!pedido) throw new ActionError(MOTIVO_PEDIDO_NAO_ENCONTRADO);
  const motivo = motivoParaNaoRecusar({ status: pedido.status as StatusPedido, resposta: p.resposta });
  if (motivo) throw new ActionError(motivo);
  const resposta = p.resposta.trim();
  if (resposta.length > LIMITE_RESPOSTA) throw new ActionError(`A resposta passa de ${LIMITE_RESPOSTA} caracteres.`);
  const { count } = await prisma.pedidoRevisaoCliente.updateMany({
    where: { id: p.id, status: "aguardando" },
    data: { status: "recusado", resposta, respondidoPorId: p.quem.id, respondidoEm: new Date() },
  });
  if (count !== 1) throw new ActionError(MOTIVO_JA_RESPONDIDO);
}

// ─────────────────────────────────────────────────────────────
// Pedido no modelo 3D (spec 2026-11-20-portal-visualizador-3d-design.md, "Pedir revisão no modelo")
// ─────────────────────────────────────────────────────────────

export const MOTIVO_MODELO_FORA = "Este modelo não está disponível para você neste projeto.";

/** Marcação 3D como vem da tela (o schema já conferiu formato e tamanhos). */
export type MarcacaoModeloRecebida = {
  modeloId: string;
  guids: string[];
  ponto: [number, number, number];
  camera: CameraApontamento;
  texto: string;
};

/**
 * O cliente pede revisão no modelo 3D: só comentário, ou com marcações — cada uma num modelo que o portal mostra
 * PRONTO para esta conta (`modelosDoPortal`), de onde vêm a origem nas Entregas e o documento recebido. Mesmas regras do
 * pedido na prancha: comentário 1–4000, texto 1–900, até 50 marcações, até 20 aguardando por conta e projeto.
 */
export async function criarPedidoModeloNoBanco(p: {
  autor: UsuarioDaSessao;
  projetoId: string;
  comentario: string;
  marcacoes: readonly MarcacaoModeloRecebida[];
}): Promise<{ id: string; marcacaoIds: string[] }> {
  const comentario = textoObrigatorio(
    p.comentario,
    LIMITE_COMENTARIO,
    "Escreva o que você quer revisar.",
    `O comentário passa de ${LIMITE_COMENTARIO} caracteres.`,
  );
  if (p.marcacoes.length > MAX_MARCACOES) throw new ActionError(`O pedido aceita no máximo ${MAX_MARCACOES} marcações.`);
  const modelos = await modelosDoPortal(p.autor, p.projetoId);
  if (!modelos) throw new ActionError(MOTIVO_MODELO_FORA);
  const prontos = new Map(modelos.filter((m) => m.situacao === "pronto").map((m) => [m.modeloId, m]));
  const marcacoes = p.marcacoes.map((m, ordem) => {
    const texto = textoObrigatorio(
      m.texto,
      LIMITE_TEXTO_MARCACAO,
      "Escreva o que mudar em cada marcação.",
      `O texto de uma marcação passa de ${LIMITE_TEXTO_MARCACAO} caracteres.`,
    );
    const modelo = prontos.get(m.modeloId);
    if (!modelo) throw new ActionError(MOTIVO_MODELO_FORA);
    if (m.guids.length > MAX_GUIDS_MARCACAO) throw new ActionError(`Uma marcação aceita no máximo ${MAX_GUIDS_MARCACAO} elementos.`);
    return {
      ordem,
      modeloId: modelo.modeloId,
      origemUploadId: modelo.origemUploadId,
      documentoRecebidoId: modelo.documentoRecebidoId,
      guids: [...m.guids],
      ponto: [...m.ponto],
      camera: { position: [...m.camera.position], target: [...m.camera.target] },
      texto,
    };
  });
  const limite = motivoDoLimiteDePedidos(
    await prisma.pedidoRevisaoCliente.count({ where: { autorId: p.autor.id, projetoId: p.projetoId, status: "aguardando" } }),
  );
  if (limite) throw new ActionError(limite);
  const criado = await prisma.pedidoRevisaoCliente.create({
    data: {
      tipo: "modelo",
      projetoId: p.projetoId,
      autorId: p.autor.id,
      comentario,
      marcacoesModelo: { create: marcacoes },
    },
    select: { id: true, marcacoesModelo: { orderBy: { ordem: "asc" }, select: { id: true } } },
  });
  return { id: criado.id, marcacaoIds: criado.marcacoesModelo.map((m) => m.id) };
}

type MarcaComOrigem = { modeloId: string; origemUploadId: string | null; documentoRecebidoId: string | null };
type OrigemLida = { id: string; revisaoId: string | null; disciplinaId: string } | null;

/** O IFC das Entregas de cada marcação (vendo lixeira e versão trocada: a situação é decidida depois). */
async function origensDasMarcacoes(db: Tx | typeof prisma, marcas: readonly MarcaComOrigem[]): Promise<Map<string, OrigemLida>> {
  const origens = new Map<string, OrigemLida>();
  for (const m of marcas) {
    if (!m.origemUploadId || origens.has(m.origemUploadId)) continue;
    const u = await db.upload.findFirst({
      where: { id: m.origemUploadId, excluidoEm: { not: undefined }, substituidoPorId: { not: undefined } },
      select: { id: true, revisaoId: true, disciplinaId: true },
    });
    origens.set(m.origemUploadId, u);
  }
  return origens;
}

/** As revisões das Entregas marcadas (ordem fixa: é a ordem das travas). */
function revisoesDasOrigens(origens: Map<string, OrigemLida>): string[] {
  return [...new Set([...origens.values()].flatMap((o) => (o?.revisaoId ? [o.revisaoId] : [])))].sort();
}

async function situacoesComOrigens(
  db: Tx | typeof prisma,
  marcas: readonly MarcaComOrigem[],
  origens: Map<string, OrigemLida>,
): Promise<SituacaoDaRevisao[]> {
  const porOrigem = new Map<string, SituacaoDaRevisao>();
  const porDocumento = new Map<string, SituacaoDaRevisao>();
  const situacoes: SituacaoDaRevisao[] = [];
  for (const m of marcas) {
    if (m.origemUploadId) {
      let s = porOrigem.get(m.origemUploadId);
      if (!s) {
        const u = origens.get(m.origemUploadId);
        s = u?.revisaoId
          ? situacaoDaMarcacao({ origem: "entrega", revisao: await estadoDaRevisaoDoPedido(db, { revisaoId: u.revisaoId, uploadId: u.id }) })
          : "retirada";
        porOrigem.set(m.origemUploadId, s);
      }
      situacoes.push(s);
    } else if (m.documentoRecebidoId) {
      let s = porDocumento.get(m.documentoRecebidoId);
      if (!s) {
        const doc = await db.documento.findUnique({ where: { id: m.documentoRecebidoId }, select: { id: true } });
        s = situacaoDaMarcacao({ origem: "cliente", documentoExiste: doc !== null });
        porDocumento.set(m.documentoRecebidoId, s);
      }
      situacoes.push(s);
    } else {
      situacoes.push("retirada");
    }
  }
  return situacoes;
}

/** A situação de cada marcação de um pedido de modelo — a mesma leitura do aceite, para a fila e o portal. */
export async function situacoesDasMarcacoesModelo(
  db: Tx | typeof prisma,
  marcas: readonly MarcaComOrigem[],
): Promise<SituacaoDaRevisao[]> {
  return situacoesComOrigens(db, marcas, await origensDasMarcacoes(db, marcas));
}

/**
 * A muralha de aceitar/recusar um pedido de modelo: `projetos:ver` + projeto visível (o recebido do cliente não tem
 * disciplina) e, para cada revisão das Entregas marcada, a muralha da disciplina dona (`exigirEscopoDaRevisao`).
 */
export async function exigirEscopoDoPedidoModelo(user: SessionUser, pedidoId: string): Promise<void> {
  const p = await prisma.pedidoRevisaoCliente.findUnique({
    where: { id: pedidoId },
    select: {
      tipo: true,
      projetoId: true,
      marcacoesModelo: { select: { modeloId: true, origemUploadId: true, documentoRecebidoId: true } },
    },
  });
  if (!p || p.tipo !== "modelo") throw new ActionError(MOTIVO_PEDIDO_NAO_ENCONTRADO);
  if (!(await can(user, "projetos", "ver")) || !(await projetoVisivel(user, p.projetoId))) {
    throw new ActionError(MOTIVO_PEDIDO_NAO_ENCONTRADO);
  }
  for (const revisaoId of revisoesDasOrigens(await origensDasMarcacoes(prisma, p.marcacoesModelo))) {
    await exigirEscopoDaRevisao(user, revisaoId);
  }
}

/** A disciplina do apontamento: a do upload servido; IFC recebido (`d:`) não tem. */
async function disciplinaDoModelo(tx: Tx, modeloId: string, origem: OrigemLida): Promise<string | null> {
  const ref = parseModeloId(modeloId);
  if (ref.tipo === "documento") return null;
  const u = await tx.upload.findFirst({
    where: { id: ref.id, excluidoEm: { not: undefined }, substituidoPorId: { not: undefined } },
    select: { disciplinaId: true },
  });
  return u?.disciplinaId ?? origem?.disciplinaId ?? null;
}

export type ResultadoAceiteModelo = { apontamentos: number; emRevisao: number };

/**
 * Aceita um pedido de modelo, numa transação: status → aceito (`updateMany` condicionado); cada marcação vira um
 * apontamento 3D da coordenação (aberto, sem tarefa, autor = quem aceitou) no modelo que o cliente viu, numerado no
 * projeto; cada revisão das Entregas marcada fica "Em revisão" uma vez só (publicada no ciclo, sem marca ativa), sem
 * avisar os projetistas. O recebido do cliente não marca revisão. A imagem da vista é COPIADA depois da transação (o
 * arquivo do pedido fica com o pedido); se a cópia falha, o apontamento fica sem imagem.
 */
export async function aceitarPedidoModeloNoBanco(p: {
  id: string;
  quem: { id: string };
  resposta: string | null;
}): Promise<ResultadoAceiteModelo> {
  const resposta = p.resposta?.trim() ? p.resposta.trim() : null;
  if (resposta && resposta.length > LIMITE_RESPOSTA) throw new ActionError(`A resposta passa de ${LIMITE_RESPOSTA} caracteres.`);
  const { resultado, copias, projetoId } = await prisma.$transaction(async (tx) => {
    // Trava o pedido: aceite × cancelamento × outro aceite do MESMO pedido esperam aqui, e só um passa do updateMany.
    await tx.$queryRaw`SELECT id FROM pedido_revisao_cliente WHERE id = ${p.id} FOR UPDATE`;
    const pedido = await tx.pedidoRevisaoCliente.findUnique({
      where: { id: p.id },
      select: {
        id: true,
        tipo: true,
        status: true,
        projetoId: true,
        comentario: true,
        autor: { select: { name: true } },
        _count: { select: { anexos: true } },
        marcacoesModelo: {
          orderBy: { ordem: "asc" },
          select: { id: true, modeloId: true, origemUploadId: true, documentoRecebidoId: true, guids: true, camera: true, texto: true, snapshotPath: true },
        },
      },
    });
    if (!pedido || pedido.tipo !== "modelo") throw new ActionError(MOTIVO_PEDIDO_NAO_ENCONTRADO);
    const origens = await origensDasMarcacoes(tx, pedido.marcacoesModelo);
    const revisoes = revisoesDasOrigens(origens);
    // Trava as revisões (ordem fixa, sem impasse): dois aceites na mesma revisão não disputam a marca "Em revisão".
    for (const revisaoId of revisoes) await tx.$queryRaw`SELECT id FROM documento_revisao WHERE id = ${revisaoId} FOR UPDATE`;
    const situacoes = await situacoesComOrigens(tx, pedido.marcacoesModelo, origens);
    const motivo = motivoParaNaoAceitarModelo({ status: pedido.status as StatusPedido, situacoes });
    if (motivo) throw new ActionError(motivo);

    const { count } = await tx.pedidoRevisaoCliente.updateMany({
      where: { id: pedido.id, status: "aguardando" },
      data: { status: "aceito", resposta, respondidoPorId: p.quem.id, respondidoEm: new Date() },
    });
    if (count !== 1) throw new ActionError(MOTIVO_JA_RESPONDIDO);

    let emRevisao = 0;
    for (const revisaoId of revisoes) {
      const r = await carregarRevisao(tx, revisaoId);
      if (!estadoParaTransicao(r).participa || r.estado !== "publicado") continue;
      if (r.controles.some((c) => c.tipo === "em_revisao")) continue;
      await aplicarControleNoTx(tx, r, "em_revisao", {
        quem: { userId: p.quem.id },
        motivo: motivoEmRevisao(pedido.comentario),
        origem: "pedido_cliente",
        detalhe: { pedidoId: pedido.id },
      });
      emRevisao++;
    }

    const ctx = { nomeAutor: pedido.autor.name, temAnexos: pedido._count.anexos > 0 };
    const copias: { de: string; apontamentoId: string }[] = [];
    for (const m of pedido.marcacoesModelo) {
      const origem = m.origemUploadId ? (origens.get(m.origemUploadId) ?? null) : null;
      const criado = await criarApontamentoCoordenacaoNoTx(tx, {
        ...apontamentoDaMarcacao(m, ctx),
        projetoId: pedido.projetoId,
        disciplinaId: await disciplinaDoModelo(tx, m.modeloId, origem),
        autorId: p.quem.id,
      });
      await tx.marcacaoModeloCliente.update({ where: { id: m.id }, data: { apontamentoId: criado.id } });
      if (m.snapshotPath) copias.push({ de: m.snapshotPath, apontamentoId: criado.id });
    }
    return { resultado: { apontamentos: pedido.marcacoesModelo.length, emRevisao }, copias, projetoId: pedido.projetoId };
  });

  // O mesmo caminho da rota de snapshot da coordenação (`/api/coordenacao/snapshot`).
  for (const c of copias) {
    const para = `coordenacao/apontamentos/${projetoId}/${c.apontamentoId}.png`;
    try {
      await copiarArquivo(c.de, para);
      await prisma.apontamentoCoordenacao.update({ where: { id: c.apontamentoId }, data: { snapshotPath: para } });
    } catch (e) {
      console.error("[pedido-revisao] imagem da marcação não copiada para o apontamento:", c.apontamentoId, e);
    }
  }
  return resultado;
}

// ─────────────────────────────────────────────────────────────
// Anexos (rota /api/portal/pedidos/[id]/anexos)
// ─────────────────────────────────────────────────────────────

export const MOTIVO_ANEXO_SO_AUTOR = "Só quem fez o pedido anexa arquivos, e só enquanto ele aguarda a equipe.";

/**
 * Checagem barata ANTES de gravar o arquivo no disco: autor, aguardando, limite e extensão. A mesma checagem se
 * repete na transação de `gravarAnexoNoBanco` (dois envios ao mesmo tempo não passam de 5).
 */
export async function motivoParaAnexar(p: { pedidoId: string; userId: string; nome: string }): Promise<string | null> {
  const pedido = await prisma.pedidoRevisaoCliente.findUnique({
    where: { id: p.pedidoId },
    select: { autorId: true, status: true, _count: { select: { anexos: true } } },
  });
  if (!pedido || pedido.autorId !== p.userId || pedido.status !== "aguardando") return MOTIVO_ANEXO_SO_AUTOR;
  return motivoDoAnexo({ nome: p.nome, jaTem: pedido._count.anexos });
}

export async function gravarAnexoNoBanco(p: {
  pedidoId: string;
  userId: string;
  nome: string;
  caminho: string;
  tamanho: number;
  mime: string;
}): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM pedido_revisao_cliente WHERE id = ${p.pedidoId} FOR UPDATE`;
    const pedido = await tx.pedidoRevisaoCliente.findUnique({
      where: { id: p.pedidoId },
      select: { autorId: true, status: true, _count: { select: { anexos: true } } },
    });
    if (!pedido || pedido.autorId !== p.userId || pedido.status !== "aguardando") throw new ActionError(MOTIVO_ANEXO_SO_AUTOR);
    const motivo = motivoDoAnexo({ nome: p.nome, jaTem: pedido._count.anexos });
    if (motivo) throw new ActionError(motivo);
    return tx.anexoPedidoCliente.create({
      data: { pedidoId: p.pedidoId, nome: p.nome, caminho: p.caminho, tamanho: p.tamanho, mime: p.mime },
      select: { id: true },
    });
  });
}

/**
 * Quem baixa um anexo: a coordenação (`arquivos:alterar_status` + projeto no escopo) ou uma conta do portal com
 * acesso ao projeto do pedido. Devolve o arquivo ou null (a rota responde 404 nos dois casos).
 */
export async function anexoParaBaixar(
  user: (UsuarioDaSessao & { superUsuario?: boolean }) | null,
  anexoId: string,
  /** `revisaoId` nulo = pedido de modelo (o gate é o do pedido inteiro, `exigirEscopoDoPedidoModelo`). */
  podeCoordenar: (p: { projetoId: string; revisaoId: string | null; pedidoId: string }) => Promise<boolean>,
): Promise<{ nome: string; caminho: string; mime: string; projetoId: string } | null> {
  if (!user) return null;
  const anexo = await prisma.anexoPedidoCliente.findUnique({
    where: { id: anexoId },
    select: { nome: true, caminho: true, mime: true, pedido: { select: { id: true, projetoId: true, revisaoId: true } } },
  });
  if (!anexo) return null;
  const projetoId = anexo.pedido.projetoId;
  const pode =
    user.tipo === "externo"
      ? (await acessoDoUsuarioAoProjetoDoPortal(user, projetoId)).ok
      : await podeCoordenar({ projetoId, revisaoId: anexo.pedido.revisaoId, pedidoId: anexo.pedido.id });
  return pode ? { nome: anexo.nome, caminho: anexo.caminho, mime: anexo.mime, projetoId } : null;
}

// ─────────────────────────────────────────────────────────────
// Avisos — depois da escrita, e nunca a derrubam
// ─────────────────────────────────────────────────────────────

/**
 * Pedido novo: sino para a coordenação do projeto (membros com papel de coordenação; sem nenhum, os gestores — mesma
 * regra de `destinatariosDaConclusao`), categoria `pedido_revisao_cliente`. `notificar` entra como parâmetro para o
 * smoke rodar sem disparar nada.
 */
export async function avisarPedidoNovo(
  pedidoId: string,
  notificar: (ids: string[], n: { titulo: string; corpo: string; href: string }, o: { categoria: string }) => Promise<void> = notificarMuitos,
): Promise<{ avisados: number }> {
  try {
    const p = await prisma.pedidoRevisaoCliente.findUnique({
      where: { id: pedidoId },
      select: {
        projetoId: true,
        autorId: true,
        autor: { select: { name: true } },
        projeto: { select: { codigo: true } },
        upload: { select: { nomeArquivo: true } },
      },
    });
    if (!p) return { avisados: 0 };
    // Só quem abre a fila (`arquivos:alterar_status`): um link que cai em /sem-permissao não ajuda ninguém.
    const quemAbre = async (ids: string[]) => {
      const pessoas = await prisma.user.findMany({
        where: { id: { in: ids }, ativo: true },
        select: { id: true, ativo: true, superUsuario: true, perfilId: true, tipo: true },
      });
      const podem: string[] = [];
      for (const u of pessoas) if (await can(u, "arquivos", "alterar_status")) podem.push(u.id);
      return podem;
    };
    const membros = await prisma.projetoMembro.findMany({
      where: { projetoId: p.projetoId, papel: { contains: "coord", mode: "insensitive" } },
      select: { userId: true },
    });
    const coord = (await quemAbre(membros.map((m) => m.userId))).map((userId) => ({ userId }));
    const gestores =
      coord.length > 0
        ? []
        : (await quemAbre((await prisma.user.findMany({ where: whereAudiencia("global"), select: { id: true } })).map((g) => g.id))).map((id) => ({ id }));
    const destino = destinatariosDaConclusao({
      coordenadores: coord.map((c) => c.userId),
      gestores: gestores.map((g) => g.id),
      autorId: p.autorId,
    });
    if (destino.length === 0) return { avisados: 0 };
    const texto = textoPedidoNovo({
      projetoCodigo: formatarCodigo(p.projeto.codigo),
      autorNome: p.autor.name,
      prancha: p.upload?.nomeArquivo ?? ROTULO_MODELO_3D,
    });
    await notificar(destino, { ...texto, href: `/arquivos/pedidos-cliente/${pedidoId}` }, { categoria: "pedido_revisao_cliente" });
    return { avisados: destino.length };
  } catch (e) {
    console.error("[pedido-revisao] aviso do pedido novo falhou:", e);
    return { avisados: 0 };
  }
}

type EnviarEmail = (to: string, slug: string, vars: Record<string, string>) => Promise<boolean>;

/**
 * Resposta (aceito/recusado): sino + e-mail para quem pediu, sem esperar o resumo diário. Sem SMTP, só o sino. O
 * e-mail não tem opção de desligar: é a resposta a uma ação da própria pessoa.
 */
export async function avisarResposta(
  pedidoId: string,
  deps: {
    notificar: (userId: string, n: { titulo: string; corpo: string; href: string }) => Promise<void>;
    enviarEmail: EnviarEmail | null;
  } = { notificar, enviarEmail: smtpConfigurado() ? enviarEmailTemplate : null },
): Promise<{ sino: boolean; email: boolean }> {
  let sino = false;
  let email = false;
  try {
    const p = await prisma.pedidoRevisaoCliente.findUnique({
      where: { id: pedidoId },
      select: {
        status: true,
        resposta: true,
        projetoId: true,
        autorId: true,
        autor: { select: { name: true, email: true } },
        projeto: { select: { nome: true } },
        upload: { select: { nomeArquivo: true } },
      },
    });
    if (!p || (p.status !== "aceito" && p.status !== "recusado")) return { sino, email };
    const href = `/portal/${p.projetoId}`;
    const prancha = p.upload?.nomeArquivo ?? ROTULO_MODELO_3D;
    await deps.notificar(p.autorId, { ...textoResposta({ status: p.status, prancha }), href });
    sino = true;
    if (deps.enviarEmail && p.autor.email) {
      const app = (process.env.APP_URL ?? "").replace(/\/+$/, "");
      email = await deps.enviarEmail(p.autor.email, "pedido-revisao-respondido", {
        nome: p.autor.name.trim().split(/\s+/)[0] ?? "",
        projeto: p.projeto.nome,
        prancha,
        situacao: situacaoDaResposta(p.status),
        resposta: linhaRespostaEmail(p.resposta),
        url: `${app}${href}`,
      });
    }
  } catch (e) {
    console.error("[pedido-revisao] aviso da resposta falhou:", e);
  }
  return { sino, email };
}

// ─────────────────────────────────────────────────────────────
// Purga do PDF (lixeira): o banco leva os pedidos em cascata, o disco não
// ─────────────────────────────────────────────────────────────

/** Caminhos dos anexos dos pedidos destes uploads — lidos ANTES de apagar o upload (depois a cascata já os levou). */
export async function caminhosDosAnexosDosUploads(uploadIds: readonly string[]): Promise<string[]> {
  if (uploadIds.length === 0) return [];
  const anexos = await prisma.anexoPedidoCliente.findMany({
    where: { pedido: { uploadId: { in: [...uploadIds] } } },
    select: { caminho: true },
  });
  return anexos.map((a) => a.caminho);
}

/** Apaga do disco os anexos de pedidos que a purga levou. Nunca lança: falha vira log, a purga segue. */
export async function removerArquivosDosAnexos(caminhos: readonly string[]): Promise<void> {
  for (const c of caminhos) {
    try {
      await removerArquivo(c);
    } catch (e) {
      console.error("[pedido-revisao] anexo não removido do disco:", c, e);
    }
  }
}
