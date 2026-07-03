"use server";

import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { notificar, type NotificacaoInput } from "@/lib/notificar";
import { emitParaCanal, emitParaUsuario, usuarioOnline } from "@/lib/socket";
import { getOrCreateDM } from "@/modules/chat/service";
import { DM_ROLES_EXCLUIDAS } from "@/modules/chat/roles";
import { randomBytes } from "node:crypto";
import { removerArquivo, salvarArquivo, lerArquivo } from "@/lib/storage";
import { extrairMencoes, mencionouTodos } from "@/modules/chat/mencoes";
import { agregarReacoes } from "@/modules/chat/queries";

const base = { modulo: "chat" } as const;

const PODE_MODERAR = ["admin", "supervisor"] as const;

/** Monta a notificação (sino + push) de uma mensagem nova — padroniza título/corpo/tag/href. */
function montarNotificacaoMensagem(
  autorNome: string,
  conteudo: string,
  canalId: string,
  opcoes?: { mencao?: boolean },
): NotificacaoInput {
  return {
    titulo: opcoes?.mencao
      ? `Você foi mencionado por ${autorNome}`
      : `Mensagem de ${autorNome}`,
    corpo: conteudo ? conteudo.slice(0, 120) : "📎 Anexo",
    href: `/chat?c=${canalId}`,
    tag: `chat-${canalId}`,
  };
}

const enviarSchema = z
  .object({
    canalId: z.string().min(1),
    conteudo: z.string().max(4000).default(""),
    anexoPath: z.string().optional(),
    anexoNome: z.string().optional(),
    anexoMime: z.string().optional(),
    respostaAId: z.string().optional(),
  })
  .refine((v) => v.conteudo.trim().length > 0 || !!v.anexoPath, {
    message: "Escreva uma mensagem ou anexe um arquivo.",
    path: ["conteudo"],
  });

async function exigirMembro(canalId: string, userId: string) {
  const m = await prisma.canalMembro.findUnique({
    where: { canalId_userId: { canalId, userId } },
  });
  if (!m) throw new ActionError("Você não participa deste canal.");
}

/** Distribui notificações (sino/push) de uma mensagem nova aos membros do canal. */
async function notificarMembros(canalId: string, autorId: string, autorNome: string, conteudo: string) {
  const canal = await prisma.canal.findUnique({
    where: { id: canalId },
    include: {
      membros: { select: { userId: true, silenciado: true, user: { select: { name: true, chatStatus: true } } } },
    },
  });
  const membros = canal?.membros ?? [];
  const offline = membros.filter((m) => m.userId !== autorId && !usuarioOnline(m.userId));

  // @todos / @all notificam todos os membros do canal (exceto o autor).
  const mencionadosNomes = extrairMencoes(conteudo).map((t) => t.slice(1).toLowerCase());
  const todos = mencionouTodos(conteudo);
  const mencionadosIds = new Set(
    membros
      .filter((m) => m.userId !== autorId && (todos || mencionadosNomes.includes(m.user.name.split(" ")[0].toLowerCase())))
      .map((m) => m.userId),
  );

  await Promise.all(
    offline.map((m) => {
      const opcoes = mencionadosIds.has(m.userId) ? { mencao: true } : undefined;
      return notificar(m.userId, montarNotificacaoMensagem(autorNome, conteudo, canalId, opcoes), {
        push: !m.silenciado && m.user.chatStatus !== "reuniao",
      });
    }),
  );
  // Mencionados online: só sino (sem push — o socket já cuida do badge/toast).
  for (const uid of mencionadosIds) {
    if (usuarioOnline(uid)) {
      void notificar(uid, montarNotificacaoMensagem(autorNome, conteudo, canalId, { mencao: true }), { push: false });
    }
  }
}

export const enviarMensagem = defineAction(
  { ...base, acao: "enviar-mensagem", entidade: "Mensagem", schema: enviarSchema, audit: false },
  async (i, { user }) => {
    await exigirMembro(i.canalId, user.id);

    const msg = await prisma.mensagem.create({
      data: {
        canalId: i.canalId,
        autorId: user.id,
        conteudo: i.conteudo,
        anexoPath: i.anexoPath || null,
        anexoNome: i.anexoNome || null,
        anexoMime: i.anexoMime || null,
        respostaAId: i.respostaAId || null,
      },
      include: {
        autor: { select: { id: true, name: true, image: true } },
        respostaA: {
          select: { id: true, conteudo: true, excluidaEm: true, autor: { select: { name: true } } },
        },
      },
    });

    const payload = {
      id: msg.id,
      canalId: i.canalId,
      conteudo: msg.conteudo,
      fixada: false,
      editedAt: null,
      excluidaEm: null,
      encaminhada: false,
      anexoMime: msg.anexoMime,
      anexoNome: msg.anexoNome,
      autor: { id: msg.autor.id, name: msg.autor.name, image: msg.autor.image },
      createdAt: msg.createdAt,
      reacoes: [] as ReturnType<typeof agregarReacoes>,
      respostaA: msg.respostaA
        ? {
            id: msg.respostaA.id,
            conteudo: msg.respostaA.excluidaEm ? null : msg.respostaA.conteudo,
            autor: msg.respostaA.autor,
          }
        : null,
    };
    // Live (todos no room do canal).
    emitParaCanal(i.canalId, "mensagem", payload);
    await notificarMembros(i.canalId, user.id, msg.autor.name, i.conteudo);

    return payload;
  },
);

/** Encaminha uma mensagem para outra conversa (DM/grupo/canal). Copia o anexo. */
export const encaminharMensagem = defineAction(
  {
    ...base,
    acao: "encaminhar-mensagem",
    entidade: "Mensagem",
    schema: z.object({ mensagemId: z.string().min(1), canalId: z.string().min(1) }),
  },
  async (i, { user }) => {
    const origem = await prisma.mensagem.findUnique({ where: { id: i.mensagemId } });
    if (!origem || origem.excluidaEm) throw new ActionError("Mensagem não encontrada.");

    // Pode ler a origem? (membro do canal de origem ou perfil global)
    const ehGlobal = (PODE_MODERAR as readonly string[]).includes(user.role);
    if (!ehGlobal) {
      const m = await prisma.canalMembro.findUnique({
        where: { canalId_userId: { canalId: origem.canalId, userId: user.id } },
      });
      if (!m) throw new ActionError("Sem acesso à mensagem.");
    }
    // Precisa participar do destino para encaminhar.
    await exigirMembro(i.canalId, user.id);

    // Copia o anexo para um arquivo próprio (lifecycle independente da origem).
    let anexoPath: string | null = null;
    if (origem.anexoPath) {
      try {
        const ext = origem.anexoPath.includes(".") ? origem.anexoPath.slice(origem.anexoPath.lastIndexOf(".")) : "";
        const novo = `chat/${i.canalId}/${randomBytes(12).toString("hex")}${ext}`;
        await salvarArquivo(novo, await lerArquivo(origem.anexoPath));
        anexoPath = novo;
      } catch {
        anexoPath = null; // se a cópia falhar, encaminha só o texto
      }
    }

    const msg = await prisma.mensagem.create({
      data: {
        canalId: i.canalId,
        autorId: user.id,
        conteudo: origem.conteudo,
        encaminhada: true,
        anexoPath,
        anexoNome: anexoPath ? origem.anexoNome : null,
        anexoMime: anexoPath ? origem.anexoMime : null,
      },
      include: { autor: { select: { id: true, name: true, image: true } } },
    });

    const payload = {
      id: msg.id,
      canalId: i.canalId,
      conteudo: msg.conteudo,
      fixada: false,
      editedAt: null,
      excluidaEm: null,
      encaminhada: true,
      anexoMime: msg.anexoMime,
      anexoNome: msg.anexoNome,
      autor: { id: msg.autor.id, name: msg.autor.name, image: msg.autor.image },
      createdAt: msg.createdAt,
      reacoes: [] as ReturnType<typeof agregarReacoes>,
      respostaA: null,
    };
    emitParaCanal(i.canalId, "mensagem", payload);
    await notificarMembros(i.canalId, user.id, msg.autor.name, msg.conteudo);
    return { canalId: i.canalId };
  },
);

export const editarMensagem = defineAction(
  {
    ...base,
    acao: "editar-mensagem",
    entidade: "Mensagem",
    schema: z.object({ mensagemId: z.string().min(1), conteudo: z.string().min(1).max(4000) }),
  },
  async (i, { user }) => {
    const msg = await prisma.mensagem.findUnique({ where: { id: i.mensagemId } });
    if (!msg || msg.excluidaEm) throw new ActionError("Mensagem não encontrada.");
    const podeEditar =
      msg.autorId === user.id || (PODE_MODERAR as readonly string[]).includes(user.role);
    if (!podeEditar) throw new ActionError("Sem permissão para editar esta mensagem.");
    const atualizada = await prisma.mensagem.update({
      where: { id: i.mensagemId },
      data: { conteudo: i.conteudo, editedAt: new Date() },
    });
    emitParaCanal(msg.canalId, "mensagem-editada", {
      id: i.mensagemId,
      canalId: msg.canalId,
      conteudo: i.conteudo,
      editedAt: atualizada.editedAt,
    });
    return { id: i.mensagemId };
  },
);

export const excluirMensagem = defineAction(
  {
    ...base,
    acao: "excluir-mensagem",
    entidade: "Mensagem",
    schema: z.object({ mensagemId: z.string().min(1) }),
  },
  async (i, { user }) => {
    const msg = await prisma.mensagem.findUnique({ where: { id: i.mensagemId } });
    if (!msg || msg.excluidaEm) throw new ActionError("Mensagem não encontrada.");
    const podeExcluir =
      msg.autorId === user.id || (PODE_MODERAR as readonly string[]).includes(user.role);
    if (!podeExcluir) throw new ActionError("Sem permissão para excluir esta mensagem.");
    await prisma.mensagem.update({
      where: { id: i.mensagemId },
      data: { excluidaEm: new Date() },
    });
    // Remove o arquivo do disco ao excluir a mensagem (C5-3).
    if (msg.anexoPath) void removerArquivo(msg.anexoPath);
    emitParaCanal(msg.canalId, "mensagem-excluida", { id: i.mensagemId, canalId: msg.canalId });
    return { id: i.mensagemId };
  },
);

export const reagir = defineAction(
  {
    ...base,
    acao: "reagir",
    schema: z.object({ mensagemId: z.string().min(1), emoji: z.string().min(1).max(10) }),
    audit: false,
  },
  async (i, { user }) => {
    const msg = await prisma.mensagem.findUnique({ where: { id: i.mensagemId } });
    if (!msg || msg.excluidaEm) throw new ActionError("Mensagem não encontrada.");
    await exigirMembro(msg.canalId, user.id);

    const existente = await prisma.mensagemReacao.findUnique({
      where: {
        mensagemId_userId_emoji: { mensagemId: i.mensagemId, userId: user.id, emoji: i.emoji },
      },
    });
    if (existente) {
      await prisma.mensagemReacao.delete({ where: { id: existente.id } });
    } else {
      await prisma.mensagemReacao.create({
        data: { mensagemId: i.mensagemId, userId: user.id, emoji: i.emoji },
      });
    }

    const reacoes = await prisma.mensagemReacao.findMany({
      where: { mensagemId: i.mensagemId },
      select: { emoji: true, userId: true, user: { select: { name: true } } },
    });
    const agregadas = agregarReacoes(reacoes);
    emitParaCanal(msg.canalId, "reacao", { mensagemId: i.mensagemId, reacoes: agregadas });
    return { mensagemId: i.mensagemId, reacoes: agregadas };
  },
);

/**
 * Marca o canal como lido para o usuário: avança o `lastReadAt` e cria recibos
 * (`MensagemLeitura`) APENAS para as mensagens novas desde o último `lastReadAt`
 * — em vez de reinserir a janela inteira a cada chamada (C4-2, achado #31).
 * No-op se o usuário não for membro.
 */
async function marcarCanalLido(
  canalId: string,
  user: { id: string; name: string },
  limite: number,
) {
  const membro = await prisma.canalMembro.findUnique({
    where: { canalId_userId: { canalId, userId: user.id } },
    select: { lastReadAt: true },
  });
  if (!membro) return;
  const anterior = membro.lastReadAt;

  const novas = await prisma.mensagem.findMany({
    where: {
      canalId,
      autorId: { not: user.id },
      excluidaEm: null,
      ...(anterior ? { createdAt: { gt: anterior } } : {}),
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: limite,
  });

  await prisma.canalMembro.update({
    where: { canalId_userId: { canalId, userId: user.id } },
    data: { lastReadAt: new Date() },
  });

  if (novas.length > 0) {
    await prisma.mensagemLeitura.createMany({
      data: novas.map((m) => ({ mensagemId: m.id, userId: user.id })),
      skipDuplicates: true,
    });
    emitParaCanal(canalId, "leitura", { canalId, leitorId: user.id, leitorNome: user.name });
  }
  emitParaUsuario(user.id, "chat-lido-proprio", { canalId });
}

export const marcarLido = defineAction(
  { ...base, acao: "marcar-lido", schema: z.object({ canalId: z.string().min(1) }), audit: false },
  async (i, { user }) => {
    await marcarCanalLido(i.canalId, user, 200);
    return { canalId: i.canalId };
  },
);

export const fixarMensagem = defineAction(
  {
    ...base,
    acao: "fixar-mensagem",
    entidade: "Mensagem",
    schema: z.object({ mensagemId: z.string().min(1), fixar: z.boolean() }),
  },
  async (i, { user }) => {
    const msg = await prisma.mensagem.findUnique({ where: { id: i.mensagemId } });
    if (!msg) throw new ActionError("Mensagem não encontrada.");
    await exigirMembro(msg.canalId, user.id);
    await prisma.mensagem.update({ where: { id: i.mensagemId }, data: { fixada: i.fixar } });
    emitParaCanal(msg.canalId, "fixada", {
      mensagemId: i.mensagemId,
      canalId: msg.canalId,
      fixada: i.fixar,
      conteudo: msg.conteudo,
      autorNome: user.name,
    });
    return { id: i.mensagemId };
  },
);

export const silenciarCanal = defineAction(
  {
    ...base,
    acao: "silenciar-canal",
    schema: z.object({ canalId: z.string().min(1), silenciar: z.boolean() }),
    audit: false,
  },
  async (i, { user }) => {
    await prisma.canalMembro.updateMany({
      where: { canalId: i.canalId, userId: user.id },
      data: { silenciado: i.silenciar },
    });
    return { canalId: i.canalId, silenciado: i.silenciar };
  },
);

export const marcarTudoLido = defineAction(
  { ...base, acao: "marcar-tudo-lido", schema: z.object({ canalId: z.string().min(1) }), audit: false },
  async (i, { user }) => {
    await exigirMembro(i.canalId, user.id);
    await marcarCanalLido(i.canalId, user, 500);
    return { canalId: i.canalId };
  },
);

export const definirStatusChat = defineAction(
  {
    ...base,
    acao: "status-chat",
    schema: z.object({ status: z.enum(["disponivel", "ocupado", "reuniao"]) }),
    audit: false,
  },
  async (i, { user }) => {
    await prisma.user.update({ where: { id: user.id }, data: { chatStatus: i.status } });
    emitParaUsuario(user.id, "status-proprio", { status: i.status });
    // Broadcast para todos os canais do usuário para que os outros membros atualizem o indicador.
    const canaisDoUser = await prisma.canalMembro.findMany({
      where: { userId: user.id },
      select: { canalId: true },
    });
    for (const c of canaisDoUser) {
      emitParaCanal(c.canalId, "status-chat", { userId: user.id, status: i.status });
    }
    return { status: i.status };
  },
);

// ─── C5-2: Grupos ad-hoc ────────────────────────────────────────────────────

export const criarGrupo = defineAction(
  {
    ...base,
    acao: "criar-grupo",
    entidade: "Canal",
    schema: z.object({
      nome: z.string().min(1).max(80),
      membroIds: z.array(z.string().min(1)).min(1).max(49),
    }),
  },
  async (i, { user }) => {
    const membros = [...new Set([user.id, ...i.membroIds])];
    const canal = await prisma.canal.create({
      data: {
        tipo: "grupo",
        nome: i.nome,
        criadoPorId: user.id,
        membros: { create: membros.map((userId) => ({ userId })) },
      },
    });
    for (const userId of membros) {
      emitParaUsuario(userId, "entrar-canal-novo", { canalId: canal.id });
    }
    return { canalId: canal.id };
  },
);

export const adicionarMembroGrupo = defineAction(
  {
    ...base,
    acao: "adicionar-membro-grupo",
    entidade: "Canal",
    schema: z.object({ canalId: z.string().min(1), usuarioId: z.string().min(1) }),
  },
  async (i, { user }) => {
    const canal = await prisma.canal.findUnique({ where: { id: i.canalId } });
    if (!canal || canal.tipo !== "grupo") throw new ActionError("Grupo não encontrado.");
    const podeGerenciar =
      canal.criadoPorId === user.id || (PODE_MODERAR as readonly string[]).includes(user.role);
    if (!podeGerenciar) throw new ActionError("Sem permissão para gerenciar este grupo.");
    await prisma.canalMembro.upsert({
      where: { canalId_userId: { canalId: i.canalId, userId: i.usuarioId } },
      create: { canalId: i.canalId, userId: i.usuarioId },
      update: {},
    });
    emitParaUsuario(i.usuarioId, "entrar-canal-novo", { canalId: i.canalId });
    return { canalId: i.canalId };
  },
);

export const removerMembroGrupo = defineAction(
  {
    ...base,
    acao: "remover-membro-grupo",
    entidade: "Canal",
    schema: z.object({ canalId: z.string().min(1), usuarioId: z.string().min(1) }),
  },
  async (i, { user }) => {
    const canal = await prisma.canal.findUnique({ where: { id: i.canalId } });
    if (!canal || canal.tipo !== "grupo") throw new ActionError("Grupo não encontrado.");
    const saindoSiMesmo = i.usuarioId === user.id;
    const podeGerenciar =
      saindoSiMesmo ||
      canal.criadoPorId === user.id ||
      (PODE_MODERAR as readonly string[]).includes(user.role);
    if (!podeGerenciar) throw new ActionError("Sem permissão para remover este membro.");
    await prisma.canalMembro.deleteMany({
      where: { canalId: i.canalId, userId: i.usuarioId },
    });
    emitParaUsuario(i.usuarioId, "sair-canal", { canalId: i.canalId });
    return { canalId: i.canalId };
  },
);

export const renomearGrupo = defineAction(
  {
    ...base,
    acao: "renomear-grupo",
    entidade: "Canal",
    schema: z.object({ canalId: z.string().min(1), nome: z.string().min(1).max(80) }),
  },
  async (i, { user }) => {
    const canal = await prisma.canal.findUnique({ where: { id: i.canalId } });
    if (!canal || canal.tipo !== "grupo") throw new ActionError("Grupo não encontrado.");
    const podeGerenciar =
      canal.criadoPorId === user.id || (PODE_MODERAR as readonly string[]).includes(user.role);
    if (!podeGerenciar) throw new ActionError("Sem permissão para renomear este grupo.");
    await prisma.canal.update({ where: { id: i.canalId }, data: { nome: i.nome } });
    emitParaCanal(i.canalId, "grupo-renomeado", { canalId: i.canalId, nome: i.nome });
    return { canalId: i.canalId };
  },
);

/** Define o ícone (emoji da galeria) do grupo. Limpa a imagem de capa custom. */
export const definirIconeGrupo = defineAction(
  {
    ...base,
    acao: "definir-icone-grupo",
    entidade: "Canal",
    schema: z.object({ canalId: z.string().min(1), icone: z.string().max(16).nullable() }),
  },
  async (i, { user }) => {
    const canal = await prisma.canal.findUnique({ where: { id: i.canalId } });
    if (!canal || canal.tipo !== "grupo") throw new ActionError("Grupo não encontrado.");
    const podeGerenciar =
      canal.criadoPorId === user.id || (PODE_MODERAR as readonly string[]).includes(user.role);
    if (!podeGerenciar) throw new ActionError("Sem permissão para alterar este grupo.");
    if (canal.imagemCapa) void removerArquivo(canal.imagemCapa);
    await prisma.canal.update({
      where: { id: i.canalId },
      data: { icone: i.icone, imagemCapa: null },
    });
    emitParaCanal(i.canalId, "grupo-atualizado", {
      canalId: i.canalId,
      icone: i.icone,
      imagemCapa: null,
    });
    return { canalId: i.canalId };
  },
);

// ────────────────────────────────────────────────────────────────────────────

export const abrirDM = defineAction(
  {
    ...base,
    acao: "abrir-dm",
    entidade: "Canal",
    schema: z.object({ usuarioId: z.string().min(1) }),
    audit: false,
  },
  async (i, { user }) => {
    if (i.usuarioId === user.id) throw new ActionError("Não é possível abrir DM consigo mesmo.");
    const alvo = await prisma.user.findUnique({
      where: { id: i.usuarioId },
      select: { role: true, ativo: true },
    });
    if (!alvo || !alvo.ativo || (DM_ROLES_EXCLUIDAS as readonly string[]).includes(alvo.role)) {
      throw new ActionError("Usuário indisponível para conversa.");
    }
    const canal = await getOrCreateDM(user.id, i.usuarioId);
    emitParaUsuario(user.id, "entrar-canal-novo", { canalId: canal.id });
    emitParaUsuario(i.usuarioId, "entrar-canal-novo", { canalId: canal.id });
    return { canalId: canal.id };
  },
);
