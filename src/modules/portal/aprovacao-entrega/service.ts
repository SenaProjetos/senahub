import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { diaDeSaoPaulo } from "@/lib/data";
import { promises as fs } from "node:fs";
import { resolverCaminho } from "@/lib/storage";
import { alcanceDoPortal } from "@/modules/projetos/arquivos/link-publico-regras";
import { conteudoDoAlcance } from "@/modules/projetos/arquivos/link-publico";
import { parcelasAFaturar } from "@/modules/juridico/contrato/parcelas-a-faturar-queries";
import { contaPodeVerConversa, podeVerConversaDoProjeto } from "@/modules/portal/mensagens/service";
import { candidatosDasEntregas, impressaoDigital, itemDesatualizado, type Candidato } from "./itens";
import {
  COMPROVANTE_VALIDADE_MS,
  COMPROVANTES_SEM_USO_MAX,
  MOTIVO_COMPROVANTES_DEMAIS,
  ITENS_MAX,
  MENSAGEM_MAX,
  MOTIVO_ANULACAO_MAX,
  MOTIVO_CANCELADO,
  MOTIVO_COMPROVANTE,
  MOTIVO_ITEM_FORA,
  MOTIVO_JA_ANULADA,
  MOTIVO_JA_RESPONDIDO,
  MOTIVO_NAO_ENCONTRADO,
  MOTIVO_PARCELA,
  MOTIVO_PEDIDO_MUDOU,
  MOTIVO_SEM_ITENS,
  NOME_POR_FORA_MAX,
  TITULO_MAX,
  instanteDoDiaPorFora,
  motivoDaDataPorFora,
  motivoDoComprovante,
  motivoDoTexto,
  motivoParaAnular,
  motivoParaCancelar,
  motivoParaResponder,
  type Resposta,
  type StatusAprovacao,
} from "./regras";

/**
 * Aprovação formal da entrega (spec `docs/superpowers/specs/2026-11-22-portal-aprovacao-entrega-design.md`). ÚNICO
 * escritor de `AprovacaoEntrega`, `AprovacaoEntregaItem`, `RespostaAprovacaoEntrega` e `ComprovanteAprovacaoEntrega`.
 *
 * Duas portas, conferidas AQUI: a equipe pela audiência da conversa com a coordenação (`podeVerConversaDoProjeto`), o
 * cliente pela regra de acesso do portal (`contaPodeVerConversa`: conta externa ativa de cliente ativo). Qualquer recusa
 * de porta é `MOTIVO_NAO_ENCONTRADO` — nunca diz se o pedido existe.
 *
 * Pacote e itens nunca se editam; resposta nunca se apaga (anular preenche `anuladaEm`). Toda troca de status é
 * `updateMany` condicionado ao status lido. Avisos ficam em `avisos.ts`, chamados depois do commit.
 */

type Tx = Prisma.TransactionClient;
export type Equipe = { userId: string; nome: string };
export type Conta = { userId: string; nome: string };

const naoEncontrado = () => new ActionError(MOTIVO_NAO_ENCONTRADO);

function texto(valor: string | null | undefined): string | null {
  const t = (valor ?? "").trim();
  return t.length > 0 ? t : null;
}

function obrigatorio(valor: string, limite: number, vazio: string, longo: string): string {
  const t = valor.trim();
  if (!t) throw new ActionError(vazio);
  if (t.length > limite) throw new ActionError(longo);
  return t;
}

async function exigirEquipe(userId: string, projetoId: string): Promise<void> {
  if (!(await podeVerConversaDoProjeto(userId, projetoId))) throw naoEncontrado();
}

async function pacote(aprovacaoId: string) {
  const a = await prisma.aprovacaoEntrega.findUnique({
    where: { id: aprovacaoId },
    select: { id: true, projetoId: true, status: true, impressaoDigital: true, enviadoEm: true },
  });
  if (!a) throw naoEncontrado();
  return a;
}

// ── Leituras de apoio ──────────────────────────────────────────────────────────────────────

/** O que o cliente vê hoje nas Entregas do portal, pela mesma montagem da página (`conteudoDoAlcance`). */
export async function candidatosDoProjeto(projetoId: string): Promise<Candidato[]> {
  const projeto = await prisma.projeto.findUnique({ where: { id: projetoId }, select: { id: true, codigo: true, nome: true } });
  if (!projeto) return [];
  const conteudo = await conteudoDoAlcance(alcanceDoPortal(projeto));
  return conteudo ? candidatosDasEntregas(conteudo) : [];
}

/** Parcelas que podem ser ligadas: o mesmo filtro de "Parcelas a faturar", só deste projeto E do cliente dele. */
export async function parcelasDoProjeto(projetoId: string): Promise<{ id: string; rotulo: string }[]> {
  const projeto = await prisma.projeto.findUnique({ where: { id: projetoId }, select: { clienteId: true } });
  if (!projeto?.clienteId) return [];
  const lista = await parcelasAFaturar({ projetoId, clienteId: projeto.clienteId });
  return lista.map((p) => ({ id: p.parcelaId, rotulo: `${p.contrato} — ${p.numero}. ${p.descricao}` }));
}

/**
 * Ids dos pacotes AGUARDANDO (entre `aprovacaoIds`) com algum item desatualizado: upload excluído, substituído ou fora
 * das Entregas atuais. Pacote respondido nunca vira desatualizado (o aceite é a prova).
 */
export async function desatualizadosDoProjeto(
  projetoId: string,
  aprovacaoIds: string[],
  /** As Entregas atuais, quando quem chama já as leu (evita montar a árvore duas vezes). */
  entregasProntas?: ReadonlySet<string>,
): Promise<Set<string>> {
  const fora = new Set<string>();
  if (aprovacaoIds.length === 0) return fora;
  const aguardando = await prisma.aprovacaoEntrega.findMany({
    where: { id: { in: aprovacaoIds }, projetoId, status: "aguardando" },
    select: { id: true },
  });
  if (aguardando.length === 0) return fora;
  const itens = await prisma.aprovacaoEntregaItem.findMany({
    where: { aprovacaoId: { in: aguardando.map((a) => a.id) } },
    select: { aprovacaoId: true, uploadId: true },
  });
  const nasEntregas = entregasProntas ?? new Set((await candidatosDoProjeto(projetoId)).map((c) => c.uploadId));
  const uploads = await prisma.upload.findMany({
    where: { id: { in: [...new Set(itens.map((i) => i.uploadId))] }, substituidoPorId: { not: undefined } },
    select: { id: true, excluidoEm: true, substituidoPorId: true },
  });
  const porId = new Map(uploads.map((u) => [u.id, u]));
  for (const i of itens) {
    const u = porId.get(i.uploadId);
    const desatualizado = itemDesatualizado({
      excluido: !u || u.excluidoEm !== null,
      substituido: u?.substituidoPorId != null,
      nasEntregas: nasEntregas.has(i.uploadId),
    });
    if (desatualizado) fora.add(i.aprovacaoId);
  }
  return fora;
}

// ── Envio ──────────────────────────────────────────────────────────────────────────────────

export async function enviarAprovacao(p: {
  projetoId: string;
  quem: Equipe;
  titulo: string;
  mensagem: string | null;
  uploadIds: string[];
  parcelaId: string | null;
}): Promise<{ id: string }> {
  await exigirEquipe(p.quem.userId, p.projetoId);
  const titulo = obrigatorio(p.titulo, TITULO_MAX, "Dê um título ao pedido.", `O título passa de ${TITULO_MAX} caracteres.`);
  const mensagem = texto(p.mensagem);
  if (mensagem && mensagem.length > MENSAGEM_MAX) throw new ActionError("A mensagem passa de 1.000 caracteres.");
  const ids = [...new Set(p.uploadIds)];
  if (ids.length === 0) throw new ActionError(MOTIVO_SEM_ITENS);
  if (ids.length > ITENS_MAX) throw new ActionError(`Um pedido aceita até ${ITENS_MAX} arquivos.`);

  const candidatos = await candidatosDoProjeto(p.projetoId);
  const porUpload = new Map(candidatos.map((c) => [c.uploadId, c]));
  if (ids.some((id) => !porUpload.has(id))) throw new ActionError(MOTIVO_ITEM_FORA);
  if (p.parcelaId && !(await parcelasDoProjeto(p.projetoId)).some((x) => x.id === p.parcelaId)) {
    throw new ActionError(MOTIVO_PARCELA);
  }

  const uploads = await prisma.upload.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      hashSha256: true,
      nomeArquivo: true,
      documentoId: true,
      revisaoId: true,
      disciplinaId: true,
      documento: { select: { titulo: true, nomeArquivo: true } },
    },
  });
  if (uploads.length !== ids.length) throw new ActionError(MOTIVO_ITEM_FORA);
  const upPorId = new Map(uploads.map((u) => [u.id, u]));
  // Na ordem da lista das Entregas (disciplina, fase, nome), não na ordem dos cliques.
  const escolhidos = candidatos.filter((c) => ids.includes(c.uploadId));
  const itens = escolhidos.map((c, ordem) => {
    const u = upPorId.get(c.uploadId)!;
    return {
      uploadId: u.id,
      revisaoId: u.revisaoId,
      documentoId: u.documentoId,
      disciplinaId: c.disciplinaId,
      disciplinaNome: c.disciplinaNome,
      faseSigla: c.faseRotulo,
      documentoTitulo: u.documento?.titulo?.trim() || u.documento?.nomeArquivo || u.nomeArquivo,
      revisaoRotulo: c.revisaoRotulo,
      nomeArquivo: u.nomeArquivo,
      hashSha256: u.hashSha256,
      ordem,
    };
  });

  const criado = await prisma.$transaction(async (tx) => {
    const a = await tx.aprovacaoEntrega.create({
      data: {
        projetoId: p.projetoId,
        titulo,
        mensagem,
        impressaoDigital: impressaoDigital(itens),
        parcelaId: p.parcelaId,
        enviadoPorId: p.quem.userId,
        enviadoPorNome: p.quem.nome,
      },
      select: { id: true },
    });
    await tx.aprovacaoEntregaItem.createMany({ data: itens.map((i) => ({ ...i, aprovacaoId: a.id })) });
    return a;
  });
  return { id: criado.id };
}

// ── Resposta ───────────────────────────────────────────────────────────────────────────────

/**
 * Dentro da transação: trava as linhas `Upload` dos itens (a troca de arquivo do ciclo grava `substituidoPorId`
 * nelas, então espera ou é esperada), relê excluído/substituído e decide com as Entregas lidas antes (`nasEntregas`).
 * Depois troca o status aguardando → respondido (condicionado) e grava a resposta.
 */
async function gravarRespostaNoTx(
  tx: Tx,
  a: { id: string; impressaoDigital: string },
  nasEntregas: Set<string>,
  equipe: boolean,
  dados: Omit<Prisma.RespostaAprovacaoEntregaUncheckedCreateInput, "aprovacaoId" | "impressaoDigital">,
): Promise<string> {
  const itens = await tx.aprovacaoEntregaItem.findMany({ where: { aprovacaoId: a.id }, select: { uploadId: true } });
  const ids = itens.map((i) => i.uploadId);
  const travados = await tx.$queryRaw<{ id: string; excluidoEm: Date | null; substituidoPorId: string | null }[]>`
    SELECT id, "excluidoEm", "substituidoPorId" FROM upload WHERE id = ANY(${ids}::text[]) ORDER BY id FOR UPDATE`;
  const porId = new Map(travados.map((u) => [u.id, u]));
  const desatualizado = ids.some((id) => {
    const u = porId.get(id);
    return itemDesatualizado({ excluido: !u || u.excluidoEm !== null, substituido: u?.substituidoPorId != null, nasEntregas: nasEntregas.has(id) });
  });
  const atual = await tx.aprovacaoEntrega.findUnique({ where: { id: a.id }, select: { status: true } });
  if (!atual) throw naoEncontrado();
  const motivo = motivoParaResponder({ status: atual.status, desatualizado, equipe });
  if (motivo) throw new ActionError(motivo);

  const mudou = await tx.aprovacaoEntrega.updateMany({ where: { id: a.id, status: "aguardando" }, data: { status: "respondido" } });
  if (mudou.count !== 1) {
    const agora = await tx.aprovacaoEntrega.findUnique({ where: { id: a.id }, select: { status: true } });
    throw new ActionError(agora?.status === "cancelado" ? MOTIVO_CANCELADO : MOTIVO_JA_RESPONDIDO);
  }
  const r = await tx.respostaAprovacaoEntrega.create({
    data: { ...dados, aprovacaoId: a.id, impressaoDigital: a.impressaoDigital },
    select: { id: true },
  });
  return r.id;
}

function traduzirCorrida(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ActionError(MOTIVO_JA_RESPONDIDO);
  throw e;
}

export async function responderPeloPortal(p: {
  aprovacaoId: string;
  conta: Conta;
  resposta: Resposta;
  texto: string | null;
  impressaoDigital: string;
}): Promise<{ projetoId: string; respostaId: string }> {
  const a = await pacote(p.aprovacaoId);
  if (!(await contaPodeVerConversa(p.conta.userId, a.projetoId))) throw naoEncontrado();
  // O cliente não vê pedido cancelado: responder um dá a mesma frase da porta (não confirma que existe).
  if (a.status === "cancelado") throw naoEncontrado();
  if (p.impressaoDigital !== a.impressaoDigital) throw new ActionError(MOTIVO_PEDIDO_MUDOU);
  const motivoTexto = motivoDoTexto(p.resposta, p.texto);
  if (motivoTexto) throw new ActionError(motivoTexto);
  const nasEntregas = new Set((await candidatosDoProjeto(a.projetoId)).map((c) => c.uploadId));

  try {
    const respostaId = await prisma.$transaction((tx) =>
      gravarRespostaNoTx(tx, a, nasEntregas, false, {
        resposta: p.resposta,
        texto: texto(p.texto),
        origem: "portal",
        respondidoPorId: p.conta.userId,
        respondidoPorNome: p.conta.nome,
        respondidoEm: new Date(),
      }),
    );
    return { projetoId: a.projetoId, respostaId };
  } catch (e) {
    traduzirCorrida(e);
  }
}

export async function registrarPorFora(p: {
  aprovacaoId: string;
  quem: Equipe;
  resposta: Resposta;
  texto: string | null;
  dia: string;
  respondidoPorNome: string;
  comprovanteId: string;
}): Promise<{ projetoId: string; respostaId: string }> {
  const a = await pacote(p.aprovacaoId);
  await exigirEquipe(p.quem.userId, a.projetoId);
  // Status antes do comprovante: em pedido respondido ou cancelado, a frase certa é a do status.
  const motivoStatus = motivoParaCancelar(a.status);
  if (motivoStatus) throw new ActionError(motivoStatus);
  const motivoTexto = motivoDoTexto(p.resposta, p.texto);
  if (motivoTexto) throw new ActionError(motivoTexto);
  const motivoData = motivoDaDataPorFora({ dia: p.dia, enviadoEm: a.enviadoEm, hoje: diaDeSaoPaulo() });
  if (motivoData) throw new ActionError(motivoData);
  const nome = obrigatorio(
    p.respondidoPorNome,
    NOME_POR_FORA_MAX,
    "Informe quem respondeu.",
    `O nome passa de ${NOME_POR_FORA_MAX} caracteres.`,
  );
  if (!p.comprovanteId) throw new ActionError(MOTIVO_COMPROVANTE);
  const nasEntregas = new Set((await candidatosDoProjeto(a.projetoId)).map((c) => c.uploadId));

  try {
    const respostaId = await prisma.$transaction(async (tx) => {
      const usado = await tx.comprovanteAprovacaoEntrega.updateMany({
        where: { id: p.comprovanteId, aprovacaoId: a.id, enviadoPorId: p.quem.userId, usadoEm: null },
        data: { usadoEm: new Date() },
      });
      if (usado.count !== 1) throw new ActionError(MOTIVO_COMPROVANTE);
      return gravarRespostaNoTx(tx, a, nasEntregas, true, {
        resposta: p.resposta,
        texto: texto(p.texto),
        origem: "equipe",
        respondidoPorNome: nome,
        registradoPorId: p.quem.userId,
        registradoPorNome: p.quem.nome,
        respondidoEm: instanteDoDiaPorFora(p.dia),
        comprovanteId: p.comprovanteId,
      });
    });
    return { projetoId: a.projetoId, respostaId };
  } catch (e) {
    traduzirCorrida(e);
  }
}

// ── Cancelar e anular ──────────────────────────────────────────────────────────────────────

export async function cancelarAprovacao(p: { aprovacaoId: string; quem: Equipe }): Promise<{ projetoId: string }> {
  const a = await pacote(p.aprovacaoId);
  await exigirEquipe(p.quem.userId, a.projetoId);
  const motivo = motivoParaCancelar(a.status);
  if (motivo) throw new ActionError(motivo);
  const r = await prisma.aprovacaoEntrega.updateMany({
    where: { id: a.id, status: "aguardando" },
    data: { status: "cancelado", canceladoPorId: p.quem.userId, canceladoEm: new Date() },
  });
  if (r.count !== 1) {
    const agora = await prisma.aprovacaoEntrega.findUnique({ where: { id: a.id }, select: { status: true } });
    throw new ActionError(motivoParaCancelar((agora?.status ?? "cancelado") as StatusAprovacao) ?? MOTIVO_CANCELADO);
  }
  return { projetoId: a.projetoId };
}

export async function anularResposta(p: {
  respostaId: string;
  quem: Equipe;
  motivo: string;
}): Promise<{ projetoId: string; aprovacaoId: string }> {
  const r = await prisma.respostaAprovacaoEntrega.findUnique({
    where: { id: p.respostaId },
    select: { id: true, aprovacaoId: true, anuladaEm: true },
  });
  if (!r) throw naoEncontrado();
  const a = await pacote(r.aprovacaoId);
  await exigirEquipe(p.quem.userId, a.projetoId);
  const motivo = obrigatorio(
    p.motivo,
    MOTIVO_ANULACAO_MAX,
    "Explique por que a resposta está sendo anulada.",
    `O motivo passa de ${MOTIVO_ANULACAO_MAX} caracteres.`,
  );
  const recusa = motivoParaAnular({ status: a.status, respostaAtiva: r.anuladaEm === null });
  if (recusa) throw new ActionError(recusa);

  await prisma.$transaction(async (tx) => {
    const anulada = await tx.respostaAprovacaoEntrega.updateMany({
      where: { id: r.id, anuladaEm: null },
      data: { anuladaEm: new Date(), anuladaPorId: p.quem.userId, anuladaPorNome: p.quem.nome, motivoAnulacao: motivo },
    });
    if (anulada.count !== 1) throw new ActionError(MOTIVO_JA_ANULADA);
    const voltou = await tx.aprovacaoEntrega.updateMany({
      where: { id: r.aprovacaoId, status: "respondido" },
      data: { status: "aguardando" },
    });
    if (voltou.count !== 1) throw new ActionError(MOTIVO_JA_ANULADA);
  });
  return { projetoId: a.projetoId, aprovacaoId: r.aprovacaoId };
}

// ── Comprovante da resposta por fora ───────────────────────────────────────────────────────

/**
 * Porta do envio do comprovante, antes de ler o corpo da requisição: equipe da audiência e pacote aguardando.
 * Devolve o projeto, para o caminho no disco.
 */
export async function exigirComprovanteAceito(p: { aprovacaoId: string; userId: string }): Promise<{ projetoId: string }> {
  const a = await pacote(p.aprovacaoId);
  await exigirEquipe(p.userId, a.projetoId);
  const motivo = motivoParaCancelar(a.status);
  if (motivo) throw new ActionError(motivo);
  return { projetoId: a.projetoId };
}

/** Registra o comprovante já gravado no disco (quem chama apaga o arquivo se isto lançar). */
export async function gravarComprovante(p: {
  aprovacaoId: string;
  quem: Equipe;
  caminho: string;
  nome: string;
  tamanho: number;
  tipo: string;
}): Promise<{ comprovanteId: string }> {
  await exigirComprovanteAceito({ aprovacaoId: p.aprovacaoId, userId: p.quem.userId });
  const motivo = motivoDoComprovante({ nome: p.nome, tamanho: p.tamanho });
  if (motivo) throw new ActionError(motivo);
  const semUso = await prisma.comprovanteAprovacaoEntrega.count({
    where: { aprovacaoId: p.aprovacaoId, enviadoPorId: p.quem.userId, usadoEm: null },
  });
  if (semUso >= COMPROVANTES_SEM_USO_MAX) throw new ActionError(MOTIVO_COMPROVANTES_DEMAIS);
  const c = await prisma.comprovanteAprovacaoEntrega.create({
    data: { aprovacaoId: p.aprovacaoId, enviadoPorId: p.quem.userId, caminho: p.caminho, nome: p.nome, tamanho: p.tamanho, tipo: p.tipo },
    select: { id: true },
  });
  return { comprovanteId: c.id };
}

/** O comprovante para baixar: só a equipe da audiência do projeto do pacote. `null` em qualquer recusa. */
export async function comprovanteParaEquipe(
  comprovanteId: string,
  userId: string,
): Promise<{ caminho: string; nome: string; tipo: string } | null> {
  const c = await prisma.comprovanteAprovacaoEntrega.findUnique({
    where: { id: comprovanteId },
    select: { caminho: true, nome: true, tipo: true, aprovacao: { select: { projetoId: true } } },
  });
  if (!c) return null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { tipo: true, ativo: true } });
  if (!u || u.tipo !== "interno" || !u.ativo) return null;
  if (!(await podeVerConversaDoProjeto(userId, c.aprovacao.projetoId))) return null;
  return { caminho: c.caminho, nome: c.nome, tipo: c.tipo };
}

/**
 * Job diário: apaga (arquivo e registro) o comprovante enviado há mais de 24 h e nunca usado numa resposta. O ARQUIVO sai
 * primeiro: se o disco recusar (arquivo preso no Windows), a linha fica e a próxima rodada tenta de novo — nunca sobra
 * arquivo sem linha. A linha só sai com `usadoEm` ainda nulo (um registro por fora no mesmo instante vence; aí o arquivo
 * já apagado é o risco aceito: a rota de download responde 404).
 */
export async function limparComprovantesNaoUsados(agora: Date = new Date()): Promise<number> {
  const limite = new Date(agora.getTime() - COMPROVANTE_VALIDADE_MS);
  const velhos = await prisma.comprovanteAprovacaoEntrega.findMany({
    where: { usadoEm: null, criadoEm: { lt: limite } },
    select: { id: true, caminho: true },
  });
  let n = 0;
  for (const c of velhos) {
    try {
      await fs.unlink(resolverCaminho(c.caminho));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("[aprovacao-entrega] arquivo do comprovante não removido (tenta amanhã):", c.caminho, e);
        continue;
      }
    }
    const r = await prisma.comprovanteAprovacaoEntrega.deleteMany({ where: { id: c.id, usadoEm: null } });
    if (r.count === 1) n += 1;
  }
  return n;
}
