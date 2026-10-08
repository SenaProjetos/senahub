"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { notificar } from "@/lib/notificar";
import { CADASTRO_ROLES, HR_ADMIN_ROLES, INTERNAL_ROLES } from "@/lib/roles";
import { MOTIVO_NADA_A_PEDIR, MOTIVO_PEDIDO_ABERTO, temAlgoAPedir } from "./preencher";
import { confirmarMeusDadosNoBanco, preencherDadosNoBanco, situacaoDaPessoa } from "./pedido-service";
import { MOTIVO_SO_ABERTO_CANCELA, MOTIVO_SO_ABERTO_LEMBRA } from "./acoes-pedido";

const rhBase = { modulo: "rh", roles: HR_ADMIN_ROLES, entidade: "PedidoDadosCadastro" } as const;
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");


const pedidoSchema = z.object({
  prazo: dataIso.nullable().optional(),
  mensagem: z.string().trim().max(300, "Mensagem com no máximo 300 caracteres.").nullable().optional(),
});

function revalidar(userId?: string) {
  revalidatePath("/rh/pessoas");
  revalidatePath("/minha-ficha");
  if (userId) revalidatePath(`/rh/pessoas/${userId}`);
  // A faixa vive no layout do dashboard: toda rota precisa ser recalculada.
  revalidatePath("/", "layout");
}

async function avisarPessoa(userId: string, mensagem: string | null | undefined, prazo: string | null | undefined, lembrete = false) {
  const quando = prazo ? ` até ${prazo.slice(8, 10)}/${prazo.slice(5, 7)}` : "";
  await notificar(userId, {
    titulo: lembrete ? "Lembrete: complete seus dados" : "O RH pediu para você completar seus dados",
    corpo: `${mensagem?.trim() ? `${mensagem.trim()} ` : ""}Preencha o que falta no seu cadastro${quando}.`,
    href: "/minha-ficha?completar=1",
    tag: "pedido-dados",
  });
}

/** Cria o pedido (sem validar quem pediu). P2002 = já havia um aberto (índice parcial). */
async function criarPedido(userId: string, solicitadoPorId: string, prazo?: string | null, mensagem?: string | null) {
  try {
    return await prisma.pedidoDadosCadastro.create({
      data: {
        userId,
        solicitadoPorId,
        prazo: prazo ? new Date(`${prazo}T00:00:00Z`) : null,
        mensagem: mensagem?.trim() || null,
      },
      select: { id: true },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new ActionError(MOTIVO_PEDIDO_ABERTO);
    throw e;
  }
}

/** RH pede a UMA pessoa que complete os próprios dados. */
export const pedirAtualizacaoDados = defineAction(
  {
    ...rhBase,
    acao: "pedir-atualizacao-dados",
    schema: pedidoSchema.extend({ userId: z.string().min(1) }),
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (i, { user }) => {
    const situacao = await situacaoDaPessoa(i.userId);
    if (!situacao || !temAlgoAPedir(situacao)) throw new ActionError(MOTIVO_NADA_A_PEDIR);
    const r = await criarPedido(i.userId, user.id, i.prazo, i.mensagem);
    await avisarPessoa(i.userId, i.mensagem, i.prazo);
    revalidar(i.userId);
    return r;
  },
);

/**
 * RH pede a TODOS com cadastro incompleto que tenham algo a preencher e nenhum pedido aberto.
 * Quem só depende do RH (cargo, salário…) fica de fora: não há o que pedir.
 */
export const pedirAtualizacaoEmLote = defineAction(
  { ...rhBase, acao: "pedir-atualizacao-dados-lote", schema: pedidoSchema },
  async (i, { user }) => {
    const candidatos = await prisma.user.findMany({
      where: { ativo: true, role: { in: [...CADASTRO_ROLES] }, pedidosDados: { none: { status: "aberto" } } },
      select: { id: true },
    });
    let pedidos = 0;
    for (const c of candidatos) {
      const situacao = await situacaoDaPessoa(c.id);
      if (!situacao || !temAlgoAPedir(situacao)) continue;
      try {
        await criarPedido(c.id, user.id, i.prazo, i.mensagem);
      } catch (e) {
        if (e instanceof ActionError) continue; // aberto por outro clique no meio do caminho
        throw e;
      }
      await avisarPessoa(c.id, i.mensagem, i.prazo);
      pedidos++;
    }
    revalidar();
    return { pedidos };
  },
);

/** Reenvia o aviso de um pedido aberto. */
export const reenviarLembretePedido = defineAction(
  { ...rhBase, acao: "reenviar-lembrete-pedido-dados", schema: z.object({ id: z.string().min(1) }), entidadeId: (_d, i) => i.id },
  async (i) => {
    const p = await prisma.pedidoDadosCadastro.findUnique({ where: { id: i.id }, select: { userId: true, status: true, mensagem: true, prazo: true } });
    if (!p || p.status !== "aberto") throw new ActionError(MOTIVO_SO_ABERTO_LEMBRA);
    await avisarPessoa(p.userId, p.mensagem, p.prazo?.toISOString().slice(0, 10), true);
    await prisma.pedidoDadosCadastro.update({ where: { id: i.id }, data: { lembradoEm: new Date() } });
    revalidar(p.userId);
    return { id: i.id };
  },
);

/** Cancela um pedido aberto: a faixa some. */
export const cancelarPedidoDados = defineAction(
  {
    ...rhBase,
    acao: "cancelar-pedido-dados",
    schema: z.object({ id: z.string().min(1) }),
    entidadeId: (_d, i) => i.id,
    capturarAntes: (i) => prisma.pedidoDadosCadastro.findUnique({ where: { id: i.id }, select: { status: true } }),
  },
  async (i) => {
    const p = await prisma.pedidoDadosCadastro.findUnique({ where: { id: i.id }, select: { userId: true } });
    const r = await prisma.pedidoDadosCadastro.updateMany({ where: { id: i.id, status: "aberto" }, data: { status: "cancelado" } });
    if (r.count !== 1) throw new ActionError(MOTIVO_SO_ABERTO_CANCELA);
    revalidar(p?.userId);
    return { id: i.id };
  },
);

/**
 * A pessoa preenche os campos VAZIOS do próprio cadastro. Comum vale na hora (auditado por
 * `defineAction`); CPF e RG vão para a aprovação do RH (mesma fila da Fase 4). Campo já
 * preenchido é ignorado: mudar o que existe segue "Editar meus dados".
 */
export const preencherMeusDados = defineAction(
  {
    modulo: "rh",
    roles: INTERNAL_ROLES,
    acao: "preencher-meus-dados",
    entidade: "User",
    schema: z.object({ valores: z.record(z.string(), z.string().max(500, "Texto longo demais para este campo.")) }),
  },
  async (i, { user }) => {
    const r = await preencherDadosNoBanco({ id: user.id, name: user.name }, i.valores);
    revalidar(user.id);
    return r;
  },
);

/** "Está tudo certo": a pessoa confirma que o cadastro continua certo (reconfirmação anual). */
export const confirmarMeusDados = defineAction(
  { modulo: "rh", roles: INTERNAL_ROLES, acao: "confirmar-meus-dados", entidade: "User", schema: z.object({}) },
  async (_i, { user }) => {
    const r = await confirmarMeusDadosNoBanco(user.id);
    revalidar(user.id);
    return r;
  },
);

/**
 * RH pede a TODOS (sem pedido aberto) que confiram os dados. É a primeira rodada da reconfirmação:
 * depois dela, o job reabre sozinho 12 meses após cada confirmação.
 */
export const pedirReconfirmacaoEmLote = defineAction(
  { ...rhBase, acao: "pedir-reconfirmacao-dados-lote", schema: pedidoSchema },
  async (i, { user }) => {
    const candidatos = await prisma.user.findMany({
      where: { ativo: true, role: { in: [...CADASTRO_ROLES] }, pedidosDados: { none: { status: "aberto" } } },
      select: { id: true },
    });
    let pedidos = 0;
    for (const c of candidatos) {
      try {
        await prisma.pedidoDadosCadastro.create({
          data: {
            userId: c.id,
            solicitadoPorId: user.id,
            tipo: "reconfirmar",
            prazo: i.prazo ? new Date(`${i.prazo}T00:00:00Z`) : null,
            mensagem: i.mensagem?.trim() || null,
          },
        });
      } catch (e) {
        if ((e as { code?: string }).code === "P2002") continue;
        throw e;
      }
      await notificar(c.id, {
        titulo: "Confira seus dados de cadastro",
        corpo: `${i.mensagem?.trim() ? `${i.mensagem.trim()} ` : ""}Veja se contato, endereço e contato de emergência continuam certos.`,
        href: "/minha-ficha?confirmar=1",
        tag: "pedido-dados",
      });
      pedidos++;
    }
    revalidar();
    return { pedidos };
  },
);
