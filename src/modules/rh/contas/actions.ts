"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { notificar, notificarMuitos } from "@/lib/notificar";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { normalizarConta, definirContaPrincipal, garantirPrincipal } from "./service";
import { criarContaSchema, editarContaSchema, contaIdSchema, TIPOS_CONTA } from "./schemas";
import { lerContaPendente, gravarContaPendente } from "./pendencia";
import { TIPOS_PIX } from "./pix";
import type { TipoPix } from "./pix";

/**
 * Conta bancária é dado de folha: mesmo gate de `salarioBase` (`rh:folha`), reforçado por
 * `HR_ADMIN_ROLES`. `redact` cobre o input desta action; a redação de fundo (banco/agência/
 * conta/PIX) já é garantida por `sanitize` em `lib/audit.ts`.
 */
const base = {
  modulo: "rh",
  recurso: "rh",
  permissao: "folha",
  roles: HR_ADMIN_ROLES,
  entidade: "ContaBancariaColaborador",
} as const;

const rev = (userId: string) => {
  revalidatePath(`/rh/pessoas/${userId}`);
  revalidatePath("/minha-ficha");
};

/** Converte o "" dos selects do formulário em `null` antes de chegar ao service. */
const opcional = <T extends string>(v: T | "" | undefined): T | null => (v ? (v as T) : null);

export const adicionarContaBancaria = defineAction(
  { ...base, acao: "adicionar-conta-bancaria", schema: criarContaSchema },
  async (i) => {
    const dados = normalizarConta({
      banco: i.banco, agencia: i.agencia, conta: i.conta,
      tipoConta: opcional(i.tipoConta), titular: i.titular,
      pixTipo: opcional(i.pixTipo) as TipoPix | null, pixChave: i.pixChave,
    });
    const criada = await prisma.$transaction(async (tx) => {
      const c = await tx.contaBancariaColaborador.create({ data: { userId: i.userId, ...dados } });
      // Primeira conta da pessoa já entra como principal — ninguém deveria ter conta sem principal.
      await garantirPrincipal(tx, i.userId);
      return c;
    });
    rev(i.userId);
    return { id: criada.id };
  },
);

export const editarContaBancaria = defineAction(
  {
    ...base,
    acao: "editar-conta-bancaria",
    schema: editarContaSchema,
    capturarAntes: async (i) => prisma.contaBancariaColaborador.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    const atual = await prisma.contaBancariaColaborador.findUnique({
      where: { id: i.id },
      select: { userId: true },
    });
    if (!atual) throw new ActionError("Conta não encontrada.");
    const dados = normalizarConta({
      banco: i.banco, agencia: i.agencia, conta: i.conta,
      tipoConta: opcional(i.tipoConta), titular: i.titular,
      pixTipo: opcional(i.pixTipo) as TipoPix | null, pixChave: i.pixChave,
    });
    await prisma.contaBancariaColaborador.update({ where: { id: i.id }, data: dados });
    rev(atual.userId);
    return { id: i.id };
  },
);

export const removerContaBancaria = defineAction(
  {
    ...base,
    acao: "remover-conta-bancaria",
    schema: contaIdSchema,
    capturarAntes: async (i) => prisma.contaBancariaColaborador.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    const atual = await prisma.contaBancariaColaborador.findUnique({
      where: { id: i.id },
      select: { userId: true },
    });
    if (!atual) throw new ActionError("Conta não encontrada.");
    await prisma.$transaction(async (tx) => {
      // A FK de `contaBancariaPrincipalId` é ON DELETE SET NULL: se esta era a principal, o
      // ponteiro zera sozinho — e então elegemos outra, para não sobrar pessoa sem principal.
      await tx.contaBancariaColaborador.delete({ where: { id: i.id } });
      await garantirPrincipal(tx, atual.userId);
    });
    rev(atual.userId);
    return { id: i.id };
  },
);

export const definirPrincipal = defineAction(
  { ...base, acao: "definir-conta-principal", schema: contaIdSchema },
  async (i) => {
    const c = await prisma.contaBancariaColaborador.findUnique({
      where: { id: i.id },
      select: { userId: true },
    });
    if (!c) throw new ActionError("Conta não encontrada.");
    await definirContaPrincipal(prisma, c.userId, i.id);
    rev(c.userId);
    return { id: i.id };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Auto-serviço (2.2f): o colaborador PROPÕE, o RH aprova/recusa. Nada muda em
// `ContaBancariaColaborador` até a aprovação — fica em `UserPreference.dados.contaPendente`.
// ─────────────────────────────────────────────────────────────────────────────

const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

const proporContaSchema = z.object({
  tipo: z.enum(["criar", "editar", "remover"]),
  /** Obrigatório para editar/remover (validado no handler, não dá pra tipar no union do zod aqui). */
  contaId: opt(z.string()),
  banco: opt(z.string()),
  agencia: opt(z.string()),
  conta: opt(z.string()),
  tipoConta: z.enum(TIPOS_CONTA).optional().or(z.literal("")),
  titular: opt(z.string()),
  pixTipo: z.enum(TIPOS_PIX).optional().or(z.literal("")),
  pixChave: opt(z.string()),
});

/** Sem `roles`: qualquer colaborador autenticado propõe — mesmo padrão de `proporAlteracaoCadastro`. */
export const proporContaBancaria = defineAction(
  { modulo: "rh", acao: "propor-conta-bancaria", entidade: "ContaBancariaColaborador", schema: proporContaSchema },
  async (i, ctx) => {
    const propostoEm = new Date().toISOString();

    if (i.tipo === "remover" || i.tipo === "editar") {
      if (!i.contaId) throw new ActionError("Selecione a conta.");
      const conta = await prisma.contaBancariaColaborador.findUnique({
        where: { id: i.contaId },
        select: { userId: true },
      });
      if (!conta || conta.userId !== ctx.user.id) throw new ActionError("Conta não encontrada.");
    }

    if (i.tipo === "remover") {
      await gravarContaPendente(ctx.user.id, { tipo: "remover", contaId: i.contaId!, propostoEm });
    } else {
      // Mesma validação/normalização (PIX, campos) que a RH usa ao editar direto — a proposta
      // já chega pronta pra aplicar, sem o RH ter que adivinhar se o formato está certo.
      const dados = normalizarConta({
        banco: i.banco, agencia: i.agencia, conta: i.conta,
        tipoConta: i.tipoConta || null, titular: i.titular,
        pixTipo: (i.pixTipo || null) as TipoPix | null, pixChave: i.pixChave,
      });
      await gravarContaPendente(
        ctx.user.id,
        i.tipo === "criar"
          ? { tipo: "criar", dados, propostoEm }
          : { tipo: "editar", contaId: i.contaId!, dados, propostoEm },
      );
    }

    const gestores = await prisma.user.findMany({
      where: { ativo: true, role: { in: HR_ADMIN_ROLES } },
      select: { id: true },
    });
    await notificarMuitos(
      gestores.map((g) => g.id),
      {
        titulo: "Conta bancária para validar",
        corpo: `${ctx.user.name} propôs uma alteração de conta bancária.`,
        href: "/rh/pessoas",
        tag: "conta-bancaria-pendente",
      },
    );

    revalidatePath("/minha-ficha");
    return { ok: true };
  },
);

const hrBase = { modulo: "rh", roles: HR_ADMIN_ROLES, entidade: "ContaBancariaColaborador" } as const;
const alvoSchema = z.object({ userId: z.string().min(1) });

/** RH aprova: aplica a proposta em `ContaBancariaColaborador` e limpa o pendente. */
export const aprovarContaPendente = defineAction(
  { ...hrBase, acao: "aprovar-conta-pendente", schema: alvoSchema, entidadeId: (_, i) => (i as { userId: string }).userId },
  async (i) => {
    const p = await lerContaPendente(i.userId);
    if (!p) throw new ActionError("Não há proposta de conta pendente para este usuário.");

    if (p.tipo === "criar") {
      await prisma.$transaction(async (tx) => {
        await tx.contaBancariaColaborador.create({ data: { userId: i.userId, ...p.dados } });
        await garantirPrincipal(tx, i.userId);
      });
    } else if (p.tipo === "editar") {
      const existe = await prisma.contaBancariaColaborador.findUnique({ where: { id: p.contaId }, select: { id: true } });
      if (existe) await prisma.contaBancariaColaborador.update({ where: { id: p.contaId }, data: p.dados });
      // Se a conta sumiu entre a proposta e a aprovação (removida por outro caminho), segue —
      // não há mais o que editar, mas a proposta não deve travar a fila por isso.
    } else {
      await prisma.$transaction(async (tx) => {
        await tx.contaBancariaColaborador.deleteMany({ where: { id: p.contaId, userId: i.userId } });
        await garantirPrincipal(tx, i.userId);
      });
    }

    await gravarContaPendente(i.userId, null);
    await notificar(i.userId, {
      titulo: "Conta bancária atualizada",
      corpo: "Sua proposta de conta bancária foi aprovada pelo RH.",
      href: "/minha-ficha",
    });
    revalidatePath("/rh/pessoas");
    revalidatePath(`/rh/pessoas/${i.userId}`);
    revalidatePath("/minha-ficha");
    return { ok: true };
  },
);

/** RH recusa: descarta a proposta (nada muda em ContaBancariaColaborador) e avisa o motivo. */
export const rejeitarContaPendente = defineAction(
  {
    ...hrBase,
    acao: "rejeitar-conta-pendente",
    schema: z.object({ userId: z.string().min(1), motivo: opt(z.string()) }),
    entidadeId: (_, i) => (i as { userId: string }).userId,
  },
  async (i) => {
    const p = await lerContaPendente(i.userId);
    if (!p) throw new ActionError("Não há proposta de conta pendente para este usuário.");
    await gravarContaPendente(i.userId, null);
    await notificar(i.userId, {
      titulo: "Conta bancária recusada",
      corpo: i.motivo?.trim() ? `Recusada pelo RH: ${i.motivo.trim()}` : "Sua proposta de conta bancária foi recusada pelo RH.",
      href: "/minha-ficha",
    });
    revalidatePath("/rh/pessoas");
    return { ok: true };
  },
);
