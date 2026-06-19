"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { registrarHistorico } from "../historico";
import { intervalosSobrepoem, excedeTetoSubcontratacao } from "./conflito";

const base = { modulo: "licitacoes", recurso: "licitacoes", permissao: "gerir" } as const;
const rev = () => revalidatePath("/licitacoes");

// ── RT global ────────────────────────────────────────────────────

export const salvarResponsavelTecnico = defineAction(
  {
    ...base,
    acao: "salvar-rt",
    entidade: "ResponsavelTecnico",
    schema: z.object({
      id: z.string().optional(),
      nome: z.string().min(1),
      registro: z.string().min(1),
      conselho: z.string().optional().or(z.literal("")),
      userId: z.string().optional().or(z.literal("")),
      ativo: z.boolean().optional(),
    }),
  },
  async (i) => {
    const data = {
      nome: i.nome,
      registro: i.registro,
      conselho: i.conselho || null,
      userId: i.userId || null,
      ativo: i.ativo ?? true,
    };
    const rt = i.id
      ? await prisma.responsavelTecnico.update({ where: { id: i.id }, data })
      : await prisma.responsavelTecnico.create({ data });
    rev();
    return { id: rt.id };
  },
);

export const excluirResponsavelTecnico = defineAction(
  {
    ...base,
    acao: "excluir-rt",
    entidade: "ResponsavelTecnico",
    schema: z.object({ id: z.string().min(1) }),
  },
  async (i) => {
    await prisma.responsavelTecnico.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

// ── Vincular RT à licitação ──────────────────────────────────────

export const vincularResponsavelTecnico = defineAction(
  {
    ...base,
    acao: "vincular-rt",
    entidade: "LicitacaoResponsavelTecnico",
    schema: z.object({
      licitacaoId: z.string().min(1),
      responsavelId: z.string().min(1),
      documentoTipo: z.enum(["ART", "RRT", "CAT"]),
      numeroDocumento: z.string().optional().or(z.literal("")),
    }),
  },
  async (i, { user }) => {
    const lic = await prisma.licitacao.findUnique({
      where: { id: i.licitacaoId },
      include: { contrato: { select: { vigenciaInicio: true, vigenciaFim: true } } },
    });
    if (!lic) throw new ActionError("Licitação não encontrada.");

    const vinc = await prisma.licitacaoResponsavelTecnico.create({
      data: {
        licitacaoId: i.licitacaoId,
        responsavelId: i.responsavelId,
        documentoTipo: i.documentoTipo,
        numeroDocumento: i.numeroDocumento || null,
      },
    });

    await registrarHistorico(
      prisma,
      i.licitacaoId,
      `Responsável técnico vinculado (${i.documentoTipo}).`,
      user.id,
    );

    // Conflito: outras licitações do mesmo RT com vigência de contrato sobreposta
    const aIni = lic.contrato?.vigenciaInicio
      ? lic.contrato.vigenciaInicio.toISOString().slice(0, 10)
      : null;
    const aFim = lic.contrato?.vigenciaFim
      ? lic.contrato.vigenciaFim.toISOString().slice(0, 10)
      : null;

    const outras = await prisma.licitacaoResponsavelTecnico.findMany({
      where: { responsavelId: i.responsavelId, licitacaoId: { not: i.licitacaoId } },
      include: {
        licitacao: {
          select: {
            titulo: true,
            contrato: { select: { vigenciaInicio: true, vigenciaFim: true } },
          },
        },
      },
    });

    const conflitos = outras.filter((o) => {
      const bIni = o.licitacao.contrato?.vigenciaInicio
        ? o.licitacao.contrato.vigenciaInicio.toISOString().slice(0, 10)
        : null;
      const bFim = o.licitacao.contrato?.vigenciaFim
        ? o.licitacao.contrato.vigenciaFim.toISOString().slice(0, 10)
        : null;
      return intervalosSobrepoem(aIni, aFim, bIni, bFim);
    });

    const aviso =
      conflitos.length > 0
        ? `Atenção: este responsável técnico já atua em ${conflitos.length} obra(s) com vigência sobreposta.`
        : undefined;

    rev();
    return { id: vinc.id, aviso };
  },
);

export const desvincularResponsavelTecnico = defineAction(
  {
    ...base,
    acao: "desvincular-rt",
    entidade: "LicitacaoResponsavelTecnico",
    schema: z.object({ id: z.string().min(1) }),
  },
  async (i) => {
    await prisma.licitacaoResponsavelTecnico.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

// ── Subcontratação ───────────────────────────────────────────────

export const salvarSubcontratacaoMax = defineAction(
  {
    ...base,
    acao: "salvar-subcontratacao-max",
    entidade: "Licitacao",
    schema: z.object({
      licitacaoId: z.string().min(1),
      subcontratacaoMaxPct: z.number().nonnegative().optional(),
    }),
  },
  async (i) => {
    await prisma.licitacao.update({
      where: { id: i.licitacaoId },
      data: { subcontratacaoMaxPct: i.subcontratacaoMaxPct ?? null },
    });
    rev();
    return { ok: true };
  },
);

export const adicionarSubcontratacao = defineAction(
  {
    ...base,
    acao: "adicionar-subcontratacao",
    entidade: "SubcontratacaoLicitacao",
    schema: z.object({
      licitacaoId: z.string().min(1),
      fornecedorId: z.string().optional().or(z.literal("")),
      nomeLivre: z.string().optional().or(z.literal("")),
      objeto: z.string().min(1),
      percentual: z.number().positive(),
    }),
  },
  async (i) => {
    const lic = await prisma.licitacao.findUnique({
      where: { id: i.licitacaoId },
      select: { subcontratacaoMaxPct: true, subcontratacoes: { select: { percentual: true } } },
    });
    if (!lic) throw new ActionError("Licitação não encontrada.");

    const somaAtual = lic.subcontratacoes.reduce((s, x) => s + Number(x.percentual), 0);
    const teto = lic.subcontratacaoMaxPct != null ? Number(lic.subcontratacaoMaxPct) : null;

    if (excedeTetoSubcontratacao(somaAtual, i.percentual, teto)) {
      throw new ActionError(
        `Subcontratação excede o teto do edital (${teto}%). Já alocado: ${somaAtual}%.`,
      );
    }

    await prisma.subcontratacaoLicitacao.create({
      data: {
        licitacaoId: i.licitacaoId,
        fornecedorId: i.fornecedorId || null,
        nomeLivre: i.nomeLivre || null,
        objeto: i.objeto,
        percentual: i.percentual,
      },
    });

    rev();
    return { ok: true };
  },
);

export const removerSubcontratacao = defineAction(
  {
    ...base,
    acao: "remover-subcontratacao",
    entidade: "SubcontratacaoLicitacao",
    schema: z.object({ id: z.string().min(1) }),
  },
  async (i) => {
    await prisma.subcontratacaoLicitacao.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);
