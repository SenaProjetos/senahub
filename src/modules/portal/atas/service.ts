import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { diaDeSaoPaulo } from "@/lib/data";
import { removerArquivo } from "@/lib/storage";
import { contaPodeVerConversa, contasDoClienteDoProjeto, podeVerConversaDoProjeto } from "@/modules/portal/mensagens/service";
import { lerAnotacoes, sugerirTipoEResponsavel } from "./leitura-gemini";
import {
  COMENTARIO_FEITO_MAX,
  DESCRICAO_ITEM_MAX,
  ITENS_MAX,
  MOTIVO_DATA,
  MOTIVO_JA_TEM_RASCUNHO,
  MOTIVO_MOTIVO_REABRIR,
  MOTIVO_MOTIVO_RETIRAR,
  MOTIVO_NAO_ENCONTRADA,
  MOTIVO_OBSERVACAO,
  MOTIVO_PENDENCIA_NAO_ENCONTRADA,
  MOTIVO_RETIRADA,
  MOTIVO_SEM_PUBLICADA,
  MOTIVO_SEM_RASCUNHO,
  MOTIVO_TITULO,
  MOTIVO_REABRIR_MAX,
  MOTIVO_RETIRAR_MAX,
  OBSERVACAO_MAX,
  TEXTO_MAX,
  TITULO_ITEM_MAX,
  TITULO_MAX,
  motivoParaPendencia,
  motivoParaPublicar,
  motivoParaResponder,
  type ItemRascunho,
  type OperacaoPendencia,
  type RespostaAta,
  type SituacaoPendencia,
} from "./regras";
import { planejarPublicacao } from "./sincronizar";

/**
 * Atas de reunião (spec `docs/superpowers/specs/2026-11-22-portal-atas-reuniao-design.md`). ÚNICO escritor de
 * `ReuniaoProjeto`, `AtaVersao`, `AtaItem`, `PendenciaCliente`, `TarefaDaAta`, `ArquivoAta` e das Tarefas que a ata cria,
 * atualiza ou arquiva.
 *
 * Portas conferidas AQUI: a equipe pela audiência da conversa com a coordenação (`podeVerConversaDoProjeto`), o cliente
 * pela regra do portal (`contaPodeVerConversa`). Recusa de porta = "Ata não encontrada." / "Pendência não encontrada.".
 * Versão publicada nunca muda; toda troca de estado é `updateMany` condicionado ao estado lido. Avisos ficam em
 * `avisos.ts`, chamados depois do commit.
 */


export type Equipe = { userId: string; nome: string };
export type Conta = { userId: string; nome: string };

const naoEncontrada = () => new ActionError(MOTIVO_NAO_ENCONTRADA);
const pendenciaNaoEncontrada = () => new ActionError(MOTIVO_PENDENCIA_NAO_ENCONTRADA);

const dataDoBanco = (d: string) => new Date(`${d}T00:00:00.000Z`);
const diaIso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const diaBr = (d: Date) => {
  const [a, m, dd] = d.toISOString().slice(0, 10).split("-");
  return `${dd}/${m}/${a}`;
};

function diaValido(dia: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCDate() === Number(m[3]) && d.getUTCMonth() === Number(m[2]) - 1;
}

function cortar(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

function obrigatorio(valor: string, max: number, vazio: string, longo: string): string {
  const t = valor.trim();
  if (!t) throw new ActionError(vazio);
  if (t.length > max) throw new ActionError(longo);
  return t;
}

async function exigirEquipe(userId: string, projetoId: string): Promise<void> {
  if (!(await podeVerConversaDoProjeto(userId, projetoId))) throw naoEncontrada();
}

async function reuniaoDaVersao(versaoId: string) {
  const v = await prisma.ataVersao.findUnique({ where: { id: versaoId }, select: { id: true, reuniaoId: true, estado: true, numero: true } });
  if (!v) throw naoEncontrada();
  const r = await prisma.reuniaoProjeto.findUnique({
    where: { id: v.reuniaoId },
    select: { id: true, projetoId: true, titulo: true, data: true, retiradaEm: true },
  });
  if (!r) throw naoEncontrada();
  return { versao: v, reuniao: r };
}

// ── Leituras de apoio ──────────────────────────────────────────────────────────────────────

/** Membros internos ativos do projeto: quem pode ser responsável de uma tarefa da equipe. */
export async function membrosInternosDoProjeto(projetoId: string): Promise<{ id: string; nome: string }[]> {
  const membros = await prisma.projetoMembro.findMany({
    where: { projetoId, user: { ativo: true, tipo: "interno" } },
    select: { user: { select: { id: true, name: true } } },
  });
  return membros.map((m) => ({ id: m.user.id, nome: m.user.name })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

// ── Criar e editar o rascunho ──────────────────────────────────────────────────────────────

/** Monta o texto inicial da ata a partir do que o Gemini escreveu: o resumo e, se houver, os detalhes. */
function textoInicial(resumo: string, detalhes: string): string {
  const partes = [resumo.trim()];
  if (detalhes.trim()) partes.push(`### Detalhes\n\n${detalhes.trim()}`);
  return partes.filter(Boolean).join("\n\n");
}

export async function criarReuniaoComRascunho(p: {
  projetoId: string;
  quem: Equipe;
  titulo?: string | null;
  data?: string | null;
  texto: string;
}): Promise<{ reuniaoId: string; versaoId: string }> {
  await exigirEquipe(p.quem.userId, p.projetoId);
  const lidas = lerAnotacoes(p.texto);
  const texto = textoInicial(lidas.resumo, lidas.detalhes);
  if (texto.length > TEXTO_MAX) {
    throw new ActionError("As anotações passam de 20.000 caracteres. Cole só as anotações do Gemini, sem a transcrição.");
  }
  const data = p.data && diaValido(p.data) ? p.data : lidas.data && diaValido(lidas.data) ? lidas.data : diaDeSaoPaulo();
  const titulo = cortar((p.titulo?.trim() || lidas.titulo || `Reunião de ${diaBr(dataDoBanco(data))}`).trim(), TITULO_MAX);

  const projeto = await prisma.projeto.findUnique({ where: { id: p.projetoId }, select: { cliente: { select: { nome: true } } } });
  const membros = await membrosInternosDoProjeto(p.projetoId);
  const contas = await contasDoClienteDoProjeto(p.projetoId);
  const candidatos = { membros, contas: contas.map((c) => ({ nome: c.nome })), cliente: projeto?.cliente?.nome ?? null };

  const itens: Omit<ItemRascunho, "prazo">[] = [
    ...lidas.decisoes.map((d) => ({ chave: randomUUID(), tipo: "decisao" as const, titulo: d.titulo, descricao: d.descricao, responsavelId: null })),
    ...lidas.etapas.map((e) => {
      const s = sugerirTipoEResponsavel(e.responsavelBruto, candidatos);
      return { chave: randomUUID(), tipo: s.tipo, titulo: e.titulo, descricao: e.descricao, responsavelId: s.responsavelId };
    }),
  ].slice(0, ITENS_MAX);

  return prisma.$transaction(async (tx) => {
    const reuniao = await tx.reuniaoProjeto.create({
      data: { projetoId: p.projetoId, titulo, data: dataDoBanco(data), criadaPorId: p.quem.userId },
      select: { id: true },
    });
    const versao = await tx.ataVersao.create({ data: { reuniaoId: reuniao.id, numero: 1, texto }, select: { id: true } });
    if (itens.length > 0) {
      await tx.ataItem.createMany({
        data: itens.map((i, ordem) => ({
          versaoId: versao.id,
          chave: i.chave,
          tipo: i.tipo,
          titulo: cortar(i.titulo, TITULO_ITEM_MAX),
          descricao: i.descricao ? cortar(i.descricao, DESCRICAO_ITEM_MAX) : null,
          responsavelId: i.responsavelId,
          ordem,
        })),
      });
    }
    return { reuniaoId: reuniao.id, versaoId: versao.id };
  });
}

/** Chaves que um item do rascunho pode carregar: as que esta reunião já conhece. Outra = chave nova (nunca de outra ata). */
async function chavesDaReuniao(reuniaoId: string): Promise<Set<string>> {
  const itens = await prisma.ataItem.findMany({ where: { versao: { reuniaoId } }, select: { chave: true } });
  return new Set(itens.map((i) => i.chave));
}

export async function salvarRascunho(p: {
  versaoId: string;
  quem: Equipe;
  texto: string;
  itens: ItemRascunho[];
  titulo: string;
  data: string;
}): Promise<{ reuniaoId: string }> {
  const { versao, reuniao } = await reuniaoDaVersao(p.versaoId);
  await exigirEquipe(p.quem.userId, reuniao.projetoId);
  if (reuniao.retiradaEm) throw new ActionError(MOTIVO_RETIRADA);
  if (versao.estado !== "rascunho") throw new ActionError(MOTIVO_SEM_RASCUNHO);
  const titulo = obrigatorio(p.titulo, TITULO_MAX, MOTIVO_TITULO, `O título passa de ${TITULO_MAX} caracteres.`);
  if (!diaValido(p.data)) throw new ActionError(MOTIVO_DATA);
  const texto = p.texto.trim();
  if (texto.length > TEXTO_MAX) throw new ActionError("O texto da ata passa de 20.000 caracteres.");
  if (p.itens.length > ITENS_MAX) throw new ActionError(`A ata aceita até ${ITENS_MAX} itens.`);
  const conhecidas = await chavesDaReuniao(reuniao.id);
  const usadas = new Set<string>();
  const itens = p.itens.map((i, ordem) => {
    const t = i.titulo.trim();
    if (t.length > TITULO_ITEM_MAX) throw new ActionError(`O título de um item passa de ${TITULO_ITEM_MAX} caracteres.`);
    const d = i.descricao?.trim() || null;
    if (d && d.length > DESCRICAO_ITEM_MAX) throw new ActionError("A descrição de um item passa de 2.000 caracteres.");
    if (i.prazo && !diaValido(i.prazo)) throw new ActionError("Informe um prazo válido.");
    // Chave repetida ou desconhecida (vinda da tela) vira chave nova: a identidade só passa entre versões desta ata.
    const chave = conhecidas.has(i.chave) && !usadas.has(i.chave) ? i.chave : randomUUID();
    usadas.add(chave);
    return {
      versaoId: versao.id,
      chave,
      tipo: i.tipo,
      titulo: t,
      descricao: d,
      responsavelId: i.tipo === "tarefa_equipe" ? i.responsavelId || null : null,
      prazo: i.tipo === "decisao" || !i.prazo ? null : dataDoBanco(i.prazo),
      ordem,
    };
  });

  await prisma.$transaction(async (tx) => {
    // Mesma ordem de trava do publicar (reunião, depois versão): salvar e publicar juntos não dão deadlock.
    await tx.$queryRaw`SELECT id FROM reuniao_projeto WHERE id = ${reuniao.id} FOR UPDATE`;
    // Ata já publicada: título e data da correção ficam no rascunho e só vão para a reunião ao publicar (o cliente
    // lê os da reunião). Ata nunca publicada: o cliente não vê nada, a reunião pode mudar já.
    const publicada = await tx.ataVersao.count({ where: { reuniaoId: reuniao.id, estado: { not: "rascunho" } } });
    const r = await tx.ataVersao.updateMany({
      where: { id: versao.id, estado: "rascunho" },
      data: publicada > 0 ? { texto, titulo, data: dataDoBanco(p.data) } : { texto },
    });
    if (r.count !== 1) throw new ActionError(MOTIVO_SEM_RASCUNHO);
    if (publicada === 0) await tx.reuniaoProjeto.update({ where: { id: reuniao.id }, data: { titulo, data: dataDoBanco(p.data) } });
    await tx.ataItem.deleteMany({ where: { versaoId: versao.id } });
    if (itens.length > 0) await tx.ataItem.createMany({ data: itens });
  });
  return { reuniaoId: reuniao.id };
}

export async function descartarRascunho(p: { versaoId: string; quem: Equipe }): Promise<{ reuniaoId: string; projetoId: string; reuniaoApagada: boolean }> {
  const { versao, reuniao } = await reuniaoDaVersao(p.versaoId);
  await exigirEquipe(p.quem.userId, reuniao.projetoId);
  if (versao.estado !== "rascunho") throw new ActionError(MOTIVO_SEM_RASCUNHO);
  // Sob a trava da reunião (a mesma do publicar): um publicar no mesmo instante espera, e a contagem relida aqui
  // decide se a reunião inteira sai (nunca publicada) ou só o rascunho.
  const r = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM reuniao_projeto WHERE id = ${reuniao.id} FOR UPDATE`;
    const ainda = await tx.ataVersao.count({ where: { id: versao.id, estado: "rascunho" } });
    if (ainda !== 1) throw new ActionError(MOTIVO_SEM_RASCUNHO);
    const publicadas = await tx.ataVersao.count({ where: { reuniaoId: reuniao.id, estado: { not: "rascunho" } } });
    if (publicadas > 0) {
      await tx.ataVersao.deleteMany({ where: { id: versao.id, estado: "rascunho" } });
      return { apagada: false, caminhos: [] as string[] };
    }
    const arquivos = await tx.arquivoAta.findMany({ where: { reuniaoId: reuniao.id }, select: { caminho: true } });
    await tx.reuniaoProjeto.delete({ where: { id: reuniao.id } });
    return { apagada: true, caminhos: arquivos.map((a) => a.caminho) };
  });
  for (const c of r.caminhos) {
    try {
      await removerArquivo(c);
    } catch (e) {
      console.error("[atas] arquivo da ata descartada não removido:", c, e);
    }
  }
  return { reuniaoId: reuniao.id, projetoId: reuniao.projetoId, reuniaoApagada: r.apagada };
}

// ── Publicar ───────────────────────────────────────────────────────────────────────────────

function descricaoDaTarefa(descricao: string | null, reuniao: { titulo: string; data: Date }): string {
  const origem = `Origem: ata de ${diaBr(reuniao.data)} — ${reuniao.titulo}`;
  return descricao?.trim() ? `${descricao.trim()}\n\n${origem}` : origem;
}

const paraItem = (i: { chave: string; tipo: ItemRascunho["tipo"]; titulo: string; descricao: string | null; responsavelId: string | null; prazo: Date | null }): ItemRascunho => ({
  chave: i.chave,
  tipo: i.tipo,
  titulo: i.titulo,
  descricao: i.descricao,
  responsavelId: i.responsavelId,
  prazo: diaIso(i.prazo),
});

export type TarefaAvisada = { tarefaId: string; responsavelId: string; titulo: string };

export async function publicar(p: { versaoId: string; quem: Equipe }): Promise<{ reuniaoId: string; projetoId: string; tarefasNovas: TarefaAvisada[]; tarefasArquivadas: string[] }> {
  const { versao, reuniao } = await reuniaoDaVersao(p.versaoId);
  await exigirEquipe(p.quem.userId, reuniao.projetoId);
  if (versao.estado !== "rascunho") throw new ActionError(MOTIVO_SEM_RASCUNHO);
  const membros = new Set((await membrosInternosDoProjeto(reuniao.projetoId)).map((m) => m.id));
  const status = await prisma.tarefaStatus.findFirst({ where: { ativo: true }, orderBy: { ordem: "asc" }, select: { id: true, concluido: true } });
  if (!status) throw new ActionError("Nenhuma coluna de tarefas configurada.");

  const tarefasNovas = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM reuniao_projeto WHERE id = ${reuniao.id} FOR UPDATE`;
    const r = await tx.reuniaoProjeto.findUnique({ where: { id: reuniao.id }, select: { titulo: true, data: true, retiradaEm: true } });
    if (!r) throw naoEncontrada();
    if (r.retiradaEm) throw new ActionError(MOTIVO_RETIRADA);
    const rascunho = await tx.ataVersao.findFirst({ where: { id: versao.id, estado: "rascunho" }, select: { id: true, texto: true, titulo: true, data: true } });
    if (!rascunho) throw new ActionError(MOTIVO_SEM_RASCUNHO);
    // A correção trouxe título/data novos: valem a partir desta publicação (as Tarefas novas já citam os novos).
    if (rascunho.titulo || rascunho.data) {
      await tx.reuniaoProjeto.update({
        where: { id: reuniao.id },
        data: { ...(rascunho.titulo ? { titulo: rascunho.titulo } : {}), ...(rascunho.data ? { data: rascunho.data } : {}) },
      });
      if (rascunho.titulo) r.titulo = rascunho.titulo;
      if (rascunho.data) r.data = rascunho.data;
    }
    const novos = (await tx.ataItem.findMany({ where: { versaoId: rascunho.id }, orderBy: { ordem: "asc" } })).map(paraItem);
    const motivo = motivoParaPublicar({ texto: rascunho.texto, itens: novos, membros });
    if (motivo) throw new ActionError(motivo);
    const vigente = await tx.ataVersao.findFirst({ where: { reuniaoId: reuniao.id, estado: "publicada" }, select: { id: true } });
    const anteriores = vigente ? (await tx.ataItem.findMany({ where: { versaoId: vigente.id } })).map(paraItem) : [];
    const ligacoesTodas = await tx.tarefaDaAta.findMany({ where: { reuniaoId: reuniao.id }, select: { id: true, chave: true, tarefaId: true } });
    // Tarefa apagada à mão no quadro deixa a ligação órfã (sem FK, de propósito): ela sai, e o item volta a "criar".
    const vivas = new Set(
      (await tx.tarefa.findMany({ where: { id: { in: ligacoesTodas.map((l) => l.tarefaId) } }, select: { id: true } })).map((t) => t.id),
    );
    const orfas = ligacoesTodas.filter((l) => !vivas.has(l.tarefaId));
    if (orfas.length > 0) await tx.tarefaDaAta.deleteMany({ where: { id: { in: orfas.map((l) => l.id) } } });
    const ligacoes = ligacoesTodas.filter((l) => vivas.has(l.tarefaId));
    const tarefaDaChave = new Map(ligacoes.map((l) => [l.chave, l.tarefaId]));
    const pendencias = await tx.pendenciaCliente.findMany({ where: { reuniaoId: reuniao.id }, select: { chave: true, situacao: true } });
    const plano = planejarPublicacao({
      anteriores,
      novos,
      tarefasExistentes: new Set(tarefaDaChave.keys()),
      pendenciasExistentes: new Map(pendencias.map((x) => [x.chave, x.situacao as SituacaoPendencia])),
    });
    const avisar: TarefaAvisada[] = [];
    const arquivadas: string[] = [];
    const agora = new Date();

    for (const i of plano.tarefas.criar) {
      const t = await tx.tarefa.create({
        data: {
          titulo: i.titulo,
          descricao: descricaoDaTarefa(i.descricao, r),
          statusId: status.id,
          concluidaEm: status.concluido ? agora : null,
          prazo: i.prazo ? dataDoBanco(i.prazo) : null,
          projetoId: reuniao.projetoId,
          criadorId: p.quem.userId,
          responsaveis: { create: [{ userId: i.responsavelId! }] },
        },
        select: { id: true },
      });
      await tx.tarefaDaAta.create({ data: { reuniaoId: reuniao.id, chave: i.chave, tarefaId: t.id } });
      avisar.push({ tarefaId: t.id, responsavelId: i.responsavelId!, titulo: i.titulo });
    }
    for (const chave of plano.tarefas.desarquivar) {
      const id = tarefaDaChave.get(chave);
      if (id) await tx.tarefa.updateMany({ where: { id }, data: { arquivada: false } });
    }
    for (const u of plano.tarefas.atualizar) {
      const id = tarefaDaChave.get(u.chave);
      if (!id) continue;
      const atual = await tx.tarefa.findUnique({ where: { id }, select: { concluidaEm: true, titulo: true } });
      if (!atual || atual.concluidaEm) continue;
      const data: Prisma.TarefaUncheckedUpdateInput = {};
      if (u.campos.titulo !== undefined) data.titulo = u.campos.titulo;
      if (u.campos.descricao !== undefined) data.descricao = descricaoDaTarefa(u.campos.descricao, r);
      if (u.campos.prazo !== undefined) data.prazo = u.campos.prazo ? dataDoBanco(u.campos.prazo) : null;
      if (Object.keys(data).length > 0) await tx.tarefa.update({ where: { id }, data });
      if (u.campos.responsavelId) {
        await tx.tarefaResponsavel.deleteMany({ where: { tarefaId: id } });
        await tx.tarefaResponsavel.create({ data: { tarefaId: id, userId: u.campos.responsavelId } });
        avisar.push({ tarefaId: id, responsavelId: u.campos.responsavelId, titulo: u.campos.titulo ?? atual.titulo });
      }
    }
    for (const chave of plano.tarefas.arquivar) {
      const id = tarefaDaChave.get(chave);
      if (!id) continue;
      const a = await tx.tarefa.updateMany({ where: { id, concluidaEm: null }, data: { arquivada: true } });
      if (a.count === 1) arquivadas.push(id);
    }

    for (const i of plano.pendencias.criar) {
      await tx.pendenciaCliente.create({
        data: {
          reuniaoId: reuniao.id,
          projetoId: reuniao.projetoId,
          chave: i.chave,
          titulo: i.titulo,
          descricao: i.descricao,
          prazo: i.prazo ? dataDoBanco(i.prazo) : null,
        },
      });
    }
    for (const chave of plano.pendencias.reabrirCancelada) {
      // Volta "limpa": nada do ciclo anterior (feito, conferência, reabertura) segue valendo.
      await tx.pendenciaCliente.updateMany({
        where: { chave, situacao: "cancelada" },
        data: {
          situacao: "aberta",
          canceladaEm: null,
          feitaEm: null,
          feitaPorId: null,
          feitaPorNome: null,
          comentarioFeito: null,
          conferidaEm: null,
          conferidaPorId: null,
          reabertaEm: null,
          reabertaPorId: null,
          motivoReabertura: null,
        },
      });
    }
    for (const u of plano.pendencias.atualizar) {
      const data: Prisma.PendenciaClienteUpdateManyMutationInput = {};
      if (u.campos.titulo !== undefined) data.titulo = u.campos.titulo;
      if (u.campos.descricao !== undefined) data.descricao = u.campos.descricao;
      if (u.campos.prazo !== undefined) data.prazo = u.campos.prazo ? dataDoBanco(u.campos.prazo) : null;
      if (Object.keys(data).length > 0) await tx.pendenciaCliente.updateMany({ where: { chave: u.chave, situacao: { not: "conferida" } }, data });
    }
    for (const chave of plano.pendencias.cancelar) {
      await tx.pendenciaCliente.updateMany({
        where: { chave, situacao: { notIn: ["conferida", "cancelada"] } },
        data: { situacao: "cancelada", canceladaEm: agora },
      });
    }

    if (vigente) {
      const s = await tx.ataVersao.updateMany({ where: { id: vigente.id, estado: "publicada" }, data: { estado: "substituida" } });
      if (s.count !== 1) throw new ActionError(MOTIVO_SEM_RASCUNHO);
    }
    const pub = await tx.ataVersao.updateMany({
      where: { id: rascunho.id, estado: "rascunho" },
      data: { estado: "publicada", publicadaEm: agora, publicadaPorId: p.quem.userId, publicadaPorNome: p.quem.nome },
    });
    if (pub.count !== 1) throw new ActionError(MOTIVO_SEM_RASCUNHO);
    return { avisar, arquivadas };
  });
  return { reuniaoId: reuniao.id, projetoId: reuniao.projetoId, tarefasNovas: tarefasNovas.avisar, tarefasArquivadas: tarefasNovas.arquivadas };
}

export async function corrigirAta(p: { reuniaoId: string; quem: Equipe }): Promise<{ versaoId: string; projetoId: string }> {
  const reuniao = await prisma.reuniaoProjeto.findUnique({ where: { id: p.reuniaoId }, select: { id: true, projetoId: true, retiradaEm: true } });
  if (!reuniao) throw naoEncontrada();
  await exigirEquipe(p.quem.userId, reuniao.projetoId);
  if (reuniao.retiradaEm) throw new ActionError(MOTIVO_RETIRADA);
  const vigente = await prisma.ataVersao.findFirst({ where: { reuniaoId: reuniao.id, estado: "publicada" }, select: { id: true, texto: true } });
  if (!vigente) throw new ActionError(MOTIVO_SEM_PUBLICADA);
  const itens = await prisma.ataItem.findMany({ where: { versaoId: vigente.id }, orderBy: { ordem: "asc" } });
  const ultima = await prisma.ataVersao.aggregate({ where: { reuniaoId: reuniao.id }, _max: { numero: true } });
  try {
    const versaoId = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM reuniao_projeto WHERE id = ${reuniao.id} FOR UPDATE`;
      const retirada = await tx.reuniaoProjeto.findUnique({ where: { id: reuniao.id }, select: { retiradaEm: true } });
      if (retirada?.retiradaEm) throw new ActionError(MOTIVO_RETIRADA);
      const v = await tx.ataVersao.create({
        data: { reuniaoId: reuniao.id, numero: (ultima._max.numero ?? 0) + 1, texto: vigente.texto },
        select: { id: true },
      });
      if (itens.length > 0) {
        await tx.ataItem.createMany({
          data: itens.map((i) => ({
            versaoId: v.id,
            chave: i.chave,
            tipo: i.tipo,
            titulo: i.titulo,
            descricao: i.descricao,
            responsavelId: i.responsavelId,
            prazo: i.prazo,
            ordem: i.ordem,
          })),
        });
      }
      return v.id;
    });
    return { versaoId, projetoId: reuniao.projetoId };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ActionError(MOTIVO_JA_TEM_RASCUNHO);
    throw e;
  }
}

// ── Resposta do cliente ────────────────────────────────────────────────────────────────────

export async function responderAta(p: {
  versaoId: string;
  conta: Conta;
  resposta: RespostaAta;
  observacao: string | null;
}): Promise<{ reuniaoId: string; projetoId: string }> {
  const { versao, reuniao } = await reuniaoDaVersao(p.versaoId);
  if (!(await contaPodeVerConversa(p.conta.userId, reuniao.projetoId))) throw naoEncontrada();
  // O cliente não sabe de rascunho: versão não publicada = não encontrada.
  if (versao.estado === "rascunho") throw naoEncontrada();
  const observacao = p.observacao?.trim() || null;
  if (p.resposta === "observacoes" && !observacao) throw new ActionError(MOTIVO_OBSERVACAO);
  if (observacao && observacao.length > OBSERVACAO_MAX) throw new ActionError("A observação passa de 2.000 caracteres.");
  const atual = await prisma.ataVersao.findUnique({ where: { id: versao.id }, select: { estado: true, resposta: true } });
  const motivo = motivoParaResponder({ estado: atual?.estado ?? "substituida", resposta: atual?.resposta ?? null, retirada: reuniao.retiradaEm !== null });
  if (motivo) throw new ActionError(motivo);
  const r = await prisma.ataVersao.updateMany({
    where: { id: versao.id, estado: "publicada", resposta: null },
    data: {
      resposta: p.resposta,
      observacao: p.resposta === "observacoes" ? observacao : null,
      respondidaPorId: p.conta.userId,
      respondidaPorNome: p.conta.nome,
      respondidaEm: new Date(),
    },
  });
  if (r.count !== 1) {
    const depois = await prisma.ataVersao.findUnique({ where: { id: versao.id }, select: { estado: true, resposta: true } });
    throw new ActionError(
      motivoParaResponder({ estado: depois?.estado ?? "substituida", resposta: depois?.resposta ?? "concorda", retirada: false }) ?? MOTIVO_SEM_PUBLICADA,
    );
  }
  return { reuniaoId: reuniao.id, projetoId: reuniao.projetoId };
}

// ── Retirar ────────────────────────────────────────────────────────────────────────────────

export async function retirarAta(p: { reuniaoId: string; quem: Equipe; motivo: string }): Promise<{ reuniaoId: string; projetoId: string }> {
  const reuniao = await prisma.reuniaoProjeto.findUnique({ where: { id: p.reuniaoId }, select: { id: true, projetoId: true, retiradaEm: true } });
  if (!reuniao) throw naoEncontrada();
  await exigirEquipe(p.quem.userId, reuniao.projetoId);
  if (reuniao.retiradaEm) throw new ActionError(MOTIVO_RETIRADA);
  const motivo = obrigatorio(p.motivo, MOTIVO_RETIRAR_MAX, MOTIVO_MOTIVO_RETIRAR, `O motivo passa de ${MOTIVO_RETIRAR_MAX} caracteres.`);
  const publicadas = await prisma.ataVersao.count({ where: { reuniaoId: reuniao.id, estado: { not: "rascunho" } } });
  if (publicadas === 0) throw new ActionError(MOTIVO_SEM_PUBLICADA);
  const agora = new Date();

  await prisma.$transaction(async (tx) => {
    // Mesma trava do publicar: uma publicação no mesmo instante termina antes, e as Tarefas dela entram no arquivamento.
    await tx.$queryRaw`SELECT id FROM reuniao_projeto WHERE id = ${reuniao.id} FOR UPDATE`;
    const r = await tx.reuniaoProjeto.updateMany({
      where: { id: reuniao.id, retiradaEm: null },
      data: { retiradaEm: agora, retiradaPorId: p.quem.userId, retiradaPorNome: p.quem.nome, motivoRetirada: motivo },
    });
    if (r.count !== 1) throw new ActionError(MOTIVO_RETIRADA);
    const ligacoes = await tx.tarefaDaAta.findMany({ where: { reuniaoId: reuniao.id }, select: { tarefaId: true } });
    if (ligacoes.length > 0) {
      await tx.tarefa.updateMany({ where: { id: { in: ligacoes.map((l) => l.tarefaId) }, concluidaEm: null }, data: { arquivada: true } });
    }
    await tx.pendenciaCliente.updateMany({
      where: { reuniaoId: reuniao.id, situacao: { in: ["aberta", "reaberta", "aguardando_conferencia"] } },
      data: { situacao: "cancelada", canceladaEm: agora },
    });
    await tx.ataVersao.deleteMany({ where: { reuniaoId: reuniao.id, estado: "rascunho" } });
  });
  return { reuniaoId: reuniao.id, projetoId: reuniao.projetoId };
}

// ── Pendências do cliente ──────────────────────────────────────────────────────────────────

async function pendencia(pendenciaId: string) {
  const pd = await prisma.pendenciaCliente.findUnique({
    where: { id: pendenciaId },
    select: { id: true, projetoId: true, reuniaoId: true, situacao: true },
  });
  if (!pd) throw pendenciaNaoEncontrada();
  const r = await prisma.reuniaoProjeto.findUnique({ where: { id: pd.reuniaoId }, select: { retiradaEm: true } });
  if (!r || r.retiradaEm) throw pendenciaNaoEncontrada();
  return pd;
}

async function trocarSituacao(
  pd: { id: string; situacao: SituacaoPendencia },
  op: OperacaoPendencia,
  para: SituacaoPendencia,
  data: Prisma.PendenciaClienteUpdateManyMutationInput,
): Promise<void> {
  const motivo = motivoParaPendencia(op, pd.situacao);
  if (motivo) throw new ActionError(motivo);
  const de: SituacaoPendencia[] = op === "feito" ? ["aberta", "reaberta"] : ["aguardando_conferencia"];
  const r = await prisma.pendenciaCliente.updateMany({ where: { id: pd.id, situacao: { in: de } }, data: { ...data, situacao: para } });
  if (r.count !== 1) {
    const atual = await prisma.pendenciaCliente.findUnique({ where: { id: pd.id }, select: { situacao: true } });
    throw new ActionError(motivoParaPendencia(op, (atual?.situacao ?? "cancelada") as SituacaoPendencia) ?? MOTIVO_PENDENCIA_NAO_ENCONTRADA);
  }
}

export async function marcarPendenciaFeita(p: { pendenciaId: string; conta: Conta; comentario: string | null }): Promise<{ projetoId: string }> {
  const pd = await pendencia(p.pendenciaId);
  if (!(await contaPodeVerConversa(p.conta.userId, pd.projetoId))) throw pendenciaNaoEncontrada();
  if (pd.situacao === "cancelada") throw pendenciaNaoEncontrada();
  const comentario = p.comentario?.trim() || null;
  if (comentario && comentario.length > COMENTARIO_FEITO_MAX) throw new ActionError("O comentário passa de 1.000 caracteres.");
  await trocarSituacao(pd as { id: string; situacao: SituacaoPendencia }, "feito", "aguardando_conferencia", {
    feitaEm: new Date(),
    feitaPorId: p.conta.userId,
    feitaPorNome: p.conta.nome,
    comentarioFeito: comentario,
  });
  return { projetoId: pd.projetoId };
}

export async function conferirPendencia(p: { pendenciaId: string; quem: Equipe }): Promise<{ projetoId: string }> {
  const pd = await pendencia(p.pendenciaId);
  if (!(await podeVerConversaDoProjeto(p.quem.userId, pd.projetoId))) throw pendenciaNaoEncontrada();
  await trocarSituacao(pd as { id: string; situacao: SituacaoPendencia }, "conferir", "conferida", {
    conferidaEm: new Date(),
    conferidaPorId: p.quem.userId,
  });
  return { projetoId: pd.projetoId };
}

export async function reabrirPendencia(p: { pendenciaId: string; quem: Equipe; motivo: string }): Promise<{ projetoId: string }> {
  const pd = await pendencia(p.pendenciaId);
  if (!(await podeVerConversaDoProjeto(p.quem.userId, pd.projetoId))) throw pendenciaNaoEncontrada();
  const motivo = obrigatorio(p.motivo, MOTIVO_REABRIR_MAX, MOTIVO_MOTIVO_REABRIR, `O motivo passa de ${MOTIVO_REABRIR_MAX} caracteres.`);
  await trocarSituacao(pd as { id: string; situacao: SituacaoPendencia }, "reabrir", "reaberta", {
    reabertaEm: new Date(),
    reabertaPorId: p.quem.userId,
    motivoReabertura: motivo,
  });
  return { projetoId: pd.projetoId };
}

/** Uso interno das rotas e leituras: a reunião existe e a pessoa é da equipe do projeto dela. */
export async function exigirReuniaoDaEquipe(reuniaoId: string, userId: string): Promise<{ projetoId: string }> {
  const r = await prisma.reuniaoProjeto.findUnique({ where: { id: reuniaoId }, select: { projetoId: true } });
  if (!r) throw naoEncontrada();
  await exigirEquipe(userId, r.projetoId);
  return { projetoId: r.projetoId };
}

export { diaIso };

// ── Arquivos internos (anotações originais e transcrição) ──────────────────────────────────

export type ArquivoNovo = { tipo: "anotacoes" | "transcricao"; caminho: string; nome: string; tamanho: number };

/** Registra os arquivos já gravados no disco (quem chama apaga os arquivos se isto lançar). */
export async function registrarArquivosDaAta(reuniaoId: string, quem: Equipe, arquivos: readonly ArquivoNovo[]): Promise<{ id: string }[]> {
  await exigirReuniaoDaEquipe(reuniaoId, quem.userId);
  // Tudo ou nada: nunca fica linha apontando para arquivo que a rota apagou.
  return prisma.$transaction(async (tx) => {
    const criados: { id: string }[] = [];
    for (const a of arquivos) {
      criados.push(
        await tx.arquivoAta.create({
          data: { reuniaoId, tipo: a.tipo, caminho: a.caminho, nome: a.nome, tamanho: a.tamanho, enviadoPorId: quem.userId },
          select: { id: true },
        }),
      );
    }
    return criados;
  });
}

/** O arquivo para baixar: só a equipe da audiência (interna e ativa). `null` em qualquer recusa. */
export async function arquivoParaEquipe(arquivoId: string, userId: string): Promise<{ caminho: string; nome: string } | null> {
  const a = await prisma.arquivoAta.findUnique({ where: { id: arquivoId }, select: { caminho: true, nome: true, reuniaoId: true } });
  if (!a) return null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { tipo: true, ativo: true } });
  if (!u || u.tipo !== "interno" || !u.ativo) return null;
  const r = await prisma.reuniaoProjeto.findUnique({ where: { id: a.reuniaoId }, select: { projetoId: true } });
  if (!r || !(await podeVerConversaDoProjeto(userId, r.projetoId))) return null;
  return { caminho: a.caminho, nome: a.nome };
}
