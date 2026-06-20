"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { brl } from "@/lib/utils";
import { registrarHistorico } from "../historico";
import { valorReajustado } from "./reajuste";

const base = { modulo: "licitacoes", recurso: "licitacoes", permissao: "gerir" } as const;
const rev = () => revalidatePath("/licitacoes");
const sinal = (p: number) => (p >= 0 ? "+" : "");

// ── registrarReajuste (manual: cria já aplicado, bumpa homologado) ──
export const registrarReajuste = defineAction(
  {
    ...base,
    acao: "registrar-reajuste",
    entidade: "ReajusteContrato",
    schema: z.object({
      licitacaoId: z.string().min(1),
      indice: z.string().min(1),
      percentual: z.number(),
      dataBase: z.string().optional().or(z.literal("")),
      aniversario: z.string().min(1),
    }),
  },
  async (i, { user }) => {
    const contrato = await prisma.contratoLicitacao.findUnique({ where: { licitacaoId: i.licitacaoId } });
    if (!contrato) throw new ActionError("Cadastre o contrato antes de lançar reajustes.");
    const valorAnterior = Number(contrato.valorHomologado);
    const novo = valorReajustado(valorAnterior, i.percentual);
    const reaj = await prisma.$transaction(async (tx) => {
      const r = await tx.reajusteContrato.create({
        data: {
          contratoId: contrato.id,
          indice: i.indice,
          percentual: i.percentual,
          dataBase: i.dataBase ? new Date(i.dataBase) : null,
          aniversario: new Date(i.aniversario),
          valorAnterior,
          valorReajustado: novo,
          aplicadoEm: new Date(),
        },
      });
      await tx.contratoLicitacao.update({ where: { id: contrato.id }, data: { valorHomologado: novo } });
      await registrarHistorico(
        tx,
        i.licitacaoId,
        `Reajuste aplicado: ${i.indice} ${sinal(i.percentual)}${i.percentual}% → ${brl(novo)}.`,
        user.id,
      );
      return r;
    });
    rev();
    return { id: reaj.id };
  },
);

// ── aplicarReajuste (aplica um pendente; recomputa do homologado atual) ──
export const aplicarReajuste = defineAction(
  { ...base, acao: "aplicar-reajuste", entidade: "ReajusteContrato", schema: z.object({ id: z.string().min(1) }) },
  async (i, { user }) => {
    const reaj = await prisma.reajusteContrato.findUnique({ where: { id: i.id }, include: { contrato: true } });
    if (!reaj) throw new ActionError("Reajuste não encontrado.");
    if (reaj.aplicadoEm) throw new ActionError("Reajuste já aplicado.");
    const percentual = Number(reaj.percentual);
    const valorAnterior = Number(reaj.contrato.valorHomologado);
    const novo = valorReajustado(valorAnterior, percentual);
    await prisma.$transaction(async (tx) => {
      await tx.reajusteContrato.update({
        where: { id: reaj.id },
        data: { aplicadoEm: new Date(), valorAnterior, valorReajustado: novo },
      });
      await tx.contratoLicitacao.update({ where: { id: reaj.contratoId }, data: { valorHomologado: novo } });
      await registrarHistorico(
        tx,
        reaj.contrato.licitacaoId,
        `Reajuste aplicado: ${reaj.indice} ${sinal(percentual)}${percentual}% → ${brl(novo)}.`,
        user.id,
      );
    });
    rev();
    return { id: reaj.id };
  },
);

// ── removerReajuste (só pendente) ──
export const removerReajuste = defineAction(
  { ...base, acao: "remover-reajuste", entidade: "ReajusteContrato", schema: z.object({ id: z.string().min(1) }) },
  async (i, { user }) => {
    const reaj = await prisma.reajusteContrato.findUnique({
      where: { id: i.id },
      include: { contrato: { select: { licitacaoId: true } } },
    });
    if (!reaj) throw new ActionError("Reajuste não encontrado.");
    if (reaj.aplicadoEm) throw new ActionError("Reajuste aplicado não pode ser removido.");
    await prisma.$transaction(async (tx) => {
      await tx.reajusteContrato.delete({ where: { id: reaj.id } });
      await registrarHistorico(tx, reaj.contrato.licitacaoId, "Reajuste pendente removido.", user.id);
    });
    rev();
    return { id: reaj.id };
  },
);
