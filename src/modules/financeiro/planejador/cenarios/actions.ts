"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ActionError, defineAction, type ActionContext } from "@/lib/with-action";
import { paraLinha, type AjusteSimulado } from "@/modules/financeiro/liquidez/ajustes";
import {
  aplicarCenarioSchema,
  idCenarioSchema,
  previaAplicacaoSchema,
  renomearCenarioSchema,
  salvarCenarioSchema,
} from "@/modules/financeiro/planejador/cenarios/schemas";
import { aplicarAjustesAoFinanceiro, previaDaAplicacao } from "@/modules/financeiro/planejador/cenarios/service";

/**
 * Cenários salvos do planejador (spec §11, plano I11): salvar exige VER o Financeiro e o cenário é
 * de quem o criou; quem gere o Financeiro também mexe nos dos outros. Aplicar ao real exige GERIR.
 */
const ver = { modulo: "financeiro", recurso: "financeiro", permissao: "ver", entidade: "CenarioFinanceiro" } as const;
const gerir = { modulo: "financeiro", recurso: "financeiro", permissao: "gerir" } as const;

const MOTIVO_NAO_EDITOR = "Só quem criou o cenário ou quem gere o Financeiro pode alterá-lo.";

function rev() {
  revalidatePath("/financeiro/cenarios");
  revalidatePath("/financeiro/planejador");
}

async function exigirEditor(id: string, user: ActionContext["user"]) {
  const c = await prisma.cenarioFinanceiro.findUnique({ where: { id }, select: { criadoPorId: true, situacao: true, aplicadoEm: true } });
  if (!c) throw new ActionError("Cenário não encontrado.");
  if (c.criadoPorId !== user.id && !(await can(user, "financeiro", "gerir"))) throw new ActionError(MOTIVO_NAO_EDITOR);
  return c;
}

function linhasDosAjustes(cenarioId: string, ajustes: readonly AjusteSimulado[], inicio: number, autorId: string) {
  return ajustes.map((a, i) => {
    const l = paraLinha(a);
    return {
      cenarioId,
      ordem: inicio + i,
      tipo: l.tipo,
      lancamentoId: l.lancamentoId,
      alvo: l.alvo as Prisma.InputJsonValue,
      antes: l.antes ? (l.antes as Prisma.InputJsonValue) : Prisma.DbNull,
      depois: l.depois as Prisma.InputJsonValue,
      criadoPorId: autorId,
    };
  });
}

export const salvarCenario = defineAction(
  {
    ...ver,
    acao: "salvar-cenario",
    schema: salvarCenarioSchema,
    capturarAntes: async (i) =>
      i.id ? prisma.cenarioFinanceiro.findUnique({ where: { id: i.id }, select: { nome: true, descricao: true, premissas: true, situacao: true } }) : null,
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (i, { user }) => {
    if (!i.id) {
      const novo = await prisma.$transaction(async (tx) => {
        const c = await tx.cenarioFinanceiro.create({
          data: { nome: i.nome, descricao: i.descricao || null, premissas: i.premissas, criadoPorId: user.id },
          select: { id: true },
        });
        if (i.ajustes.length) await tx.ajusteCenario.createMany({ data: linhasDosAjustes(c.id, i.ajustes, 0, user.id) });
        return c;
      });
      rev();
      return { id: novo.id };
    }

    const atual = await exigirEditor(i.id, user);
    if (atual.situacao === "arquivado") throw new ActionError("Cenário arquivado: restaure antes de alterar.");
    await prisma.$transaction(async (tx) => {
      // Aplicados ficam (histórico); os pendentes viram exatamente o que a tela mostra.
      await tx.ajusteCenario.deleteMany({ where: { cenarioId: i.id!, aplicadoEm: null } });
      const max = await tx.ajusteCenario.aggregate({ where: { cenarioId: i.id! }, _max: { ordem: true } });
      if (i.ajustes.length) {
        await tx.ajusteCenario.createMany({ data: linhasDosAjustes(i.id!, i.ajustes, (max._max.ordem ?? -1) + 1, user.id) });
      }
      await tx.cenarioFinanceiro.update({
        where: { id: i.id! },
        data: {
          nome: i.nome,
          descricao: i.descricao || null,
          premissas: i.premissas,
          // Aplicado que ganhou ajuste novo volta a ser rascunho (ainda há o que aplicar).
          situacao: i.ajustes.length > 0 || !atual.aplicadoEm ? "rascunho" : "aplicado",
        },
      });
    });
    rev();
    return { id: i.id };
  },
);

export const renomearCenario = defineAction(
  {
    ...ver,
    acao: "renomear-cenario",
    schema: renomearCenarioSchema,
    capturarAntes: (i) => prisma.cenarioFinanceiro.findUnique({ where: { id: i.id }, select: { nome: true, descricao: true } }),
    entidadeId: (_d, i) => i.id,
  },
  async (i, { user }) => {
    await exigirEditor(i.id, user);
    await prisma.cenarioFinanceiro.update({ where: { id: i.id }, data: { nome: i.nome, descricao: i.descricao || null } });
    rev();
    return { id: i.id };
  },
);

/** Qualquer um que veja o Financeiro pode duplicar — a cópia é dele. Só os ajustes pendentes vão. */
export const duplicarCenario = defineAction(
  { ...ver, acao: "duplicar-cenario", schema: idCenarioSchema, entidadeId: (d) => (d as { id: string }).id },
  async (i, { user }) => {
    const c = await prisma.cenarioFinanceiro.findUnique({
      where: { id: i.id },
      select: {
        nome: true,
        descricao: true,
        premissas: true,
        ajustes: { where: { aplicadoEm: null }, orderBy: { ordem: "asc" } },
      },
    });
    if (!c) throw new ActionError("Cenário não encontrado.");
    const novo = await prisma.$transaction(async (tx) => {
      const n = await tx.cenarioFinanceiro.create({
        data: {
          nome: `Cópia de ${c.nome}`.slice(0, 120),
          descricao: c.descricao,
          premissas: c.premissas as Prisma.InputJsonValue,
          criadoPorId: user.id,
        },
        select: { id: true },
      });
      if (c.ajustes.length) {
        await tx.ajusteCenario.createMany({
          data: c.ajustes.map((a, k) => ({
            cenarioId: n.id,
            ordem: k,
            tipo: a.tipo,
            lancamentoId: a.lancamentoId,
            alvo: a.alvo as Prisma.InputJsonValue,
            antes: a.antes == null ? Prisma.DbNull : (a.antes as Prisma.InputJsonValue),
            depois: a.depois as Prisma.InputJsonValue,
            criadoPorId: user.id,
          })),
        });
      }
      return n;
    });
    rev();
    return { id: novo.id };
  },
);

export const arquivarCenario = defineAction(
  { ...ver, acao: "arquivar-cenario", schema: idCenarioSchema, entidadeId: (_d, i) => i.id },
  async (i, { user }) => {
    await exigirEditor(i.id, user);
    await prisma.cenarioFinanceiro.update({ where: { id: i.id }, data: { situacao: "arquivado" } });
    rev();
    return { id: i.id };
  },
);

export const restaurarCenario = defineAction(
  { ...ver, acao: "restaurar-cenario", schema: idCenarioSchema, entidadeId: (_d, i) => i.id },
  async (i, { user }) => {
    const c = await exigirEditor(i.id, user);
    const pendentes = await prisma.ajusteCenario.count({ where: { cenarioId: i.id, aplicadoEm: null } });
    await prisma.cenarioFinanceiro.update({
      where: { id: i.id },
      data: { situacao: c.aplicadoEm && pendentes === 0 ? "aplicado" : "rascunho" },
    });
    rev();
    return { id: i.id };
  },
);

export const excluirCenario = defineAction(
  {
    ...ver,
    acao: "excluir-cenario",
    schema: idCenarioSchema,
    capturarAntes: (i) => prisma.cenarioFinanceiro.findUnique({ where: { id: i.id }, select: { nome: true, situacao: true, premissas: true } }),
    entidadeId: (_d, i) => i.id,
  },
  async (i, { user }) => {
    await exigirEditor(i.id, user);
    // Os lançamentos já aplicados não mudam: o histórico deles guarda o cenário de origem.
    await prisma.cenarioFinanceiro.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

/** Diálogo "Aplicar N alterações ao financeiro?": o que vai, o que fica só na simulação, o que não confere. Só lê. */
export const previaAplicacao = defineAction(
  { ...gerir, acao: "previa-aplicar-cenario", schema: previaAplicacaoSchema, audit: false },
  async (i) => previaDaAplicacao(i.ajustes),
);

export const aplicarCenario = defineAction(
  { ...gerir, acao: "aplicar-cenario", entidade: "CenarioFinanceiro", schema: aplicarCenarioSchema, entidadeId: (_d, i) => i.cenarioId ?? undefined },
  async (i, { user, ip }) => {
    const r = await aplicarAjustesAoFinanceiro({ ajustes: i.ajustes, cenarioId: i.cenarioId ?? null, usuarioId: user.id, ip });
    rev();
    revalidatePath("/financeiro/contas");
    revalidatePath("/financeiro/lancamentos");
    revalidatePath("/financeiro");
    return r;
  },
);
