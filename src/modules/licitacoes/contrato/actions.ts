"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { registrarHistorico } from "../historico";

const base = { modulo: "licitacoes", recurso: "licitacoes", permissao: "gerir" } as const;
const rev = () => revalidatePath("/licitacoes");
const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

// ── salvarContratoLicitacao (upsert) ──────────────────────────
export const salvarContratoLicitacao = defineAction(
  {
    ...base,
    acao: "salvar-contrato-licitacao",
    entidade: "ContratoLicitacao",
    schema: z.object({
      licitacaoId: z.string().min(1),
      numeroContrato: z.string().optional().or(z.literal("")),
      numeroEmpenho: z.string().optional().or(z.literal("")),
      valorHomologado: z.number().nonnegative(),
      vigenciaInicio: z.string().optional().or(z.literal("")),
      vigenciaFim: z.string().optional().or(z.literal("")),
      reajuste: z.string().optional().or(z.literal("")),
      garantiaTipo: z.string().optional().or(z.literal("")),
      garantiaValor: z.number().nonnegative().optional(),
      garantiaValidade: z.string().optional().or(z.literal("")),
      limiteAcrescimoPct: z.number().nonnegative().optional(),
    }),
  },
  async (i, { user }) => {
    const { licitacaoId, valorHomologado, ...rest } = i;

    const lic = await prisma.licitacao.findUnique({ where: { id: licitacaoId }, select: { id: true } });
    if (!lic) throw new ActionError("Licitação não encontrada.");

    const existente = await prisma.contratoLicitacao.findUnique({
      where: { licitacaoId },
      include: { reajustes: { where: { aplicadoEm: { not: null } }, select: { id: true }, take: 1 } },
    });
    const temReajusteAplicado = !!existente && existente.reajustes.length > 0;

    const camposAtuais = {
      valorHomologado,
      numeroContrato: rest.numeroContrato || null,
      numeroEmpenho: rest.numeroEmpenho || null,
      vigenciaInicio: rest.vigenciaInicio ? new Date(rest.vigenciaInicio) : null,
      vigenciaFim: rest.vigenciaFim ? new Date(rest.vigenciaFim) : null,
      reajuste: rest.reajuste || null,
      garantiaTipo: rest.garantiaTipo || null,
      garantiaValor: rest.garantiaValor ?? null,
      garantiaValidade: rest.garantiaValidade ? new Date(rest.garantiaValidade) : null,
      limiteAcrescimoPct: rest.limiteAcrescimoPct ?? null,
    };

    const contrato = await prisma.$transaction(async (tx) => {
      const c = await tx.contratoLicitacao.upsert({
        where: { licitacaoId },
        create: { licitacaoId, ...camposAtuais, valorHomologadoBase: valorHomologado },
        update: { ...camposAtuais, ...(temReajusteAplicado ? {} : { valorHomologadoBase: valorHomologado }) },
      });
      await registrarHistorico(
        tx,
        licitacaoId,
        !!existente
          ? "Contrato atualizado."
          : `Contrato registrado — valor homologado ${brl(valorHomologado)}`,
        user.id,
      );
      return c;
    });

    rev();
    return { id: contrato.id };
  },
);

// ── adicionarAditivoContrato ──────────────────────────────────
export const adicionarAditivoContrato = defineAction(
  {
    ...base,
    acao: "adicionar-aditivo-contrato",
    entidade: "AditivoContrato",
    schema: z.object({
      licitacaoId: z.string().min(1),
      tipo: z.enum(["valor", "prazo", "valor_prazo", "objeto"]),
      valorDelta: z.number().optional(),
      novaVigencia: z.string().optional().or(z.literal("")),
      justificativa: z.string().optional().or(z.literal("")),
      data: z.string().min(1),
    }),
  },
  async (i, { user }) => {
    const { licitacaoId, tipo, valorDelta, novaVigencia, justificativa, data } = i;

    const contrato = await prisma.contratoLicitacao.findUnique({ where: { licitacaoId } });
    if (!contrato) throw new ActionError("Cadastre o contrato antes de lançar aditivos.");

    const aditivo = await prisma.$transaction(async (tx) => {
      const a = await tx.aditivoContrato.create({
        data: {
          contratoId: contrato.id,
          tipo,
          valorDelta: valorDelta ?? null,
          novaVigencia: novaVigencia ? new Date(novaVigencia) : null,
          justificativa: justificativa || null,
          data: new Date(data),
        },
      });
      await registrarHistorico(
        tx,
        licitacaoId,
        `Aditivo (${tipo}) registrado${valorDelta != null ? " — " + brl(valorDelta) : ""}.`,
        user.id,
      );
      return a;
    });

    rev();
    return { id: aditivo.id };
  },
);

// ── removerAditivoContrato ────────────────────────────────────
export const removerAditivoContrato = defineAction(
  {
    ...base,
    acao: "remover-aditivo-contrato",
    entidade: "AditivoContrato",
    schema: z.object({ id: z.string().min(1) }),
  },
  async (i, { user }) => {
    const aditivo = await prisma.aditivoContrato.findUnique({
      where: { id: i.id },
      include: { contrato: { select: { licitacaoId: true } } },
    });
    if (!aditivo) throw new ActionError("Aditivo não encontrado.");

    await prisma.$transaction(async (tx) => {
      await tx.aditivoContrato.delete({ where: { id: i.id } });
      await registrarHistorico(tx, aditivo.contrato.licitacaoId, "Aditivo removido.", user.id);
    });

    rev();
    return { id: i.id };
  },
);
