"use server";

import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { notificar } from "@/lib/notificar";
import { emitParaCanal, emitParaUsuario, usuarioOnline } from "@/lib/socket";
import { getOrCreateDM } from "@/modules/chat/service";

const base = { modulo: "chat" } as const;

const enviarSchema = z
  .object({
    canalId: z.string().min(1),
    conteudo: z.string().max(4000).default(""),
    anexoPath: z.string().optional(),
    anexoNome: z.string().optional(),
    anexoMime: z.string().optional(),
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
      },
      include: { autor: { select: { id: true, name: true } } },
    });

    const payload = {
      id: msg.id,
      canalId: i.canalId,
      conteudo: msg.conteudo,
      anexoMime: msg.anexoMime,
      anexoNome: msg.anexoNome,
      autor: { id: msg.autor.id, name: msg.autor.name },
      createdAt: msg.createdAt,
    };
    // Live (todos no room do canal recebem → tocam som no cliente).
    emitParaCanal(i.canalId, "mensagem", payload);

    // Push para membros offline (dor histórica: notificar todas as conversas).
    const canal = await prisma.canal.findUnique({
      where: { id: i.canalId },
      include: { membros: { select: { userId: true } } },
    });
    const offline = (canal?.membros ?? [])
      .map((m) => m.userId)
      .filter((id) => id !== user.id && !usuarioOnline(id));
    await Promise.all(
      offline.map((id) =>
        notificar(id, {
          titulo: `Mensagem de ${msg.autor.name}`,
          corpo: i.conteudo ? i.conteudo.slice(0, 120) : "📎 Anexo",
          href: `/chat?c=${i.canalId}`,
          tag: `chat-${i.canalId}`,
        }),
      ),
    );

    return payload;
  },
);

export const marcarLido = defineAction(
  { ...base, acao: "marcar-lido", schema: z.object({ canalId: z.string().min(1) }), audit: false },
  async (i, { user }) => {
    await prisma.canalMembro.updateMany({
      where: { canalId: i.canalId, userId: user.id },
      data: { lastReadAt: new Date() },
    });
    // Recibos de leitura por mensagem (E6): marca as mensagens de outros como lidas.
    const msgs = await prisma.mensagem.findMany({
      where: { canalId: i.canalId, autorId: { not: user.id } },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    if (msgs.length > 0) {
      await prisma.mensagemLeitura.createMany({
        data: msgs.map((m) => ({ mensagemId: m.id, userId: user.id })),
        skipDuplicates: true,
      });
      // Recibo ao vivo: avisa o canal que este usuário leu (autores atualizam ✓✓).
      emitParaCanal(i.canalId, "leitura", { canalId: i.canalId, leitorId: user.id, leitorNome: user.name });
    }
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
    emitParaCanal(msg.canalId, "fixada", { mensagemId: i.mensagemId, fixada: i.fixar });
    return { id: i.mensagemId };
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
    return { status: i.status };
  },
);

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
    const canal = await getOrCreateDM(user.id, i.usuarioId);
    // Garante que ambos entrem no room ao vivo.
    emitParaUsuario(user.id, "entrar-canal-novo", { canalId: canal.id });
    emitParaUsuario(i.usuarioId, "entrar-canal-novo", { canalId: canal.id });
    return { canalId: canal.id };
  },
);
