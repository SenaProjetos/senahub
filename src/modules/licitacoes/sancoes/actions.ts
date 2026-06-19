"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

const base = { modulo: "licitacoes", recurso: "licitacoes", permissao: "gerir" } as const;
const revSanc = () => revalidatePath("/licitacoes/sancoes");
const rev = () => revalidatePath("/licitacoes");

const sancaoFields = {
  tipo: z.enum(["advertencia", "multa", "suspensao", "impedimento", "inidoneidade"]),
  valor: z.number().nonnegative().optional(),
  inicio: z.string().optional().or(z.literal("")),
  fim: z.string().optional().or(z.literal("")),
  orgao: z.string().optional().or(z.literal("")),
  processo: z.string().optional().or(z.literal("")),
  observacao: z.string().optional().or(z.literal("")),
};

const toData = (i: {
  tipo: string;
  valor?: number;
  inicio?: string;
  fim?: string;
  orgao?: string;
  processo?: string;
  observacao?: string;
}) => ({
  tipo: i.tipo as never,
  valor: i.valor ?? null,
  inicio: i.inicio ? new Date(i.inicio) : null,
  fim: i.fim ? new Date(i.fim) : null,
  orgao: i.orgao || null,
  processo: i.processo || null,
  observacao: i.observacao || null,
});

// ── salvarSancaoPropria (create/update) ───────────────────────
export const salvarSancaoPropria = defineAction(
  {
    ...base,
    acao: "salvar-sancao-propria",
    entidade: "SancaoPropria",
    schema: z.object({ id: z.string().optional(), ...sancaoFields }),
  },
  async (i) => {
    const data = toData(i);
    const r = i.id
      ? await prisma.sancaoPropria.update({ where: { id: i.id }, data })
      : await prisma.sancaoPropria.create({ data });
    revSanc();
    return { id: r.id };
  },
);

// ── excluirSancaoPropria ──────────────────────────────────────
export const excluirSancaoPropria = defineAction(
  {
    ...base,
    acao: "excluir-sancao-propria",
    entidade: "SancaoPropria",
    schema: z.object({ id: z.string().min(1) }),
  },
  async (i) => {
    await prisma.sancaoPropria.delete({ where: { id: i.id } });
    revSanc();
    return { id: i.id };
  },
);

// ── salvarSancaoConcorrente (create/update) ───────────────────
export const salvarSancaoConcorrente = defineAction(
  {
    ...base,
    acao: "salvar-sancao-concorrente",
    entidade: "SancaoConcorrente",
    schema: z.object({
      id: z.string().optional(),
      fornecedorId: z.string().optional().or(z.literal("")),
      nomeLivre: z.string().optional().or(z.literal("")),
      ...sancaoFields,
    }),
  },
  async (i) => {
    const data = {
      ...toData(i),
      fornecedorId: i.fornecedorId || null,
      nomeLivre: i.nomeLivre || null,
    };
    const r = i.id
      ? await prisma.sancaoConcorrente.update({ where: { id: i.id }, data })
      : await prisma.sancaoConcorrente.create({ data });
    revSanc();
    return { id: r.id };
  },
);

// ── excluirSancaoConcorrente ──────────────────────────────────
export const excluirSancaoConcorrente = defineAction(
  {
    ...base,
    acao: "excluir-sancao-concorrente",
    entidade: "SancaoConcorrente",
    schema: z.object({ id: z.string().min(1) }),
  },
  async (i) => {
    await prisma.sancaoConcorrente.delete({ where: { id: i.id } });
    revSanc();
    return { id: i.id };
  },
);

// ── salvarResultado (upsert) ──────────────────────────────────
export const salvarResultado = defineAction(
  {
    ...base,
    acao: "salvar-resultado-licitacao",
    entidade: "ResultadoLicitacao",
    schema: z.object({
      licitacaoId: z.string().min(1),
      vencedor: z.string().optional().or(z.literal("")),
      valorVencedor: z.number().nonnegative().optional(),
      nossaClassificacao: z.number().int().optional(),
      observacao: z.string().optional().or(z.literal("")),
    }),
  },
  async (i) => {
    const { licitacaoId, vencedor, valorVencedor, nossaClassificacao, observacao } = i;
    const payload = {
      vencedor: vencedor || null,
      valorVencedor: valorVencedor ?? null,
      nossaClassificacao: nossaClassificacao ?? null,
      observacao: observacao || null,
    };
    await prisma.resultadoLicitacao.upsert({
      where: { licitacaoId },
      create: { licitacaoId, ...payload },
      update: payload,
    });
    rev();
    return { ok: true };
  },
);
