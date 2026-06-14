"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

const base = { modulo: "juridico", recurso: "juridico", permissao: "gerir" } as const;
const rev = () => revalidatePath("/juridico");
const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

const docSchema = z.object({
  titulo: z.string().min(1, "Informe o título."),
  tipo: z.enum(["contrato", "aditivo", "proposta", "procuracao", "outro"]),
  projetoId: opt(z.string()),
  clienteId: opt(z.string()),
  pastaId: opt(z.string()),
  observacao: opt(z.string()),
});

const certidaoSchema = z.object({
  tipoId: z.string().min(1, "Selecione o tipo."),
  descricao: opt(z.string()),
  validade: z.string().min(1, "Informe a validade."),
});

const idSchema = z.object({ id: z.string().min(1) });

export const criarDocJuridico = defineAction(
  { ...base, acao: "criar-doc", entidade: "DocumentoJuridico", schema: docSchema },
  async (i) => {
    const d = await prisma.documentoJuridico.create({
      data: {
        titulo: i.titulo,
        tipo: i.tipo,
        projetoId: i.projetoId || null,
        clienteId: i.clienteId || null,
        pastaId: i.pastaId || null,
        observacao: i.observacao || null,
      },
    });
    rev();
    return { id: d.id };
  },
);

export const criarPastaJuridica = defineAction(
  { ...base, acao: "criar-pasta", entidade: "PastaJuridica", schema: z.object({ nome: z.string().min(1, "Informe o nome."), parentId: opt(z.string()) }) },
  async (i) => {
    const max = await prisma.pastaJuridica.aggregate({ where: { parentId: i.parentId || null }, _max: { ordem: true } });
    const p = await prisma.pastaJuridica.create({
      data: { nome: i.nome, parentId: i.parentId || null, ordem: (max._max.ordem ?? -1) + 1 },
    });
    rev();
    return { id: p.id };
  },
);

export const renomearPastaJuridica = defineAction(
  { ...base, acao: "renomear-pasta", entidade: "PastaJuridica", schema: z.object({ id: z.string().min(1), nome: z.string().min(1, "Informe o nome.") }) },
  async (i) => {
    await prisma.pastaJuridica.update({ where: { id: i.id }, data: { nome: i.nome } });
    rev();
    return { id: i.id };
  },
);

export const excluirPastaJuridica = defineAction(
  { ...base, acao: "excluir-pasta", entidade: "PastaJuridica", schema: idSchema },
  async (i) => {
    // onDelete: SetNull desvincula os documentos; filhas viram raiz.
    await prisma.pastaJuridica.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

export const moverDocPasta = defineAction(
  { ...base, acao: "mover-doc-pasta", entidade: "DocumentoJuridico", schema: z.object({ id: z.string().min(1), pastaId: opt(z.string()) }) },
  async (i) => {
    await prisma.documentoJuridico.update({ where: { id: i.id }, data: { pastaId: i.pastaId || null } });
    rev();
    return { id: i.id };
  },
);

export const excluirDocJuridico = defineAction(
  { ...base, acao: "excluir-doc", entidade: "DocumentoJuridico", schema: idSchema },
  async (i) => {
    await prisma.documentoJuridico.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

export const criarCertidao = defineAction(
  { ...base, acao: "criar-certidao", entidade: "Certidao", schema: certidaoSchema },
  async (i) => {
    const c = await prisma.certidao.create({
      data: { tipoId: i.tipoId, descricao: i.descricao || null, validade: new Date(i.validade) },
    });
    rev();
    return { id: c.id };
  },
);

export const excluirCertidao = defineAction(
  { ...base, acao: "excluir-certidao", entidade: "Certidao", schema: idSchema },
  async (i) => {
    const c = await prisma.certidao.findUnique({ where: { id: i.id } });
    if (!c) throw new ActionError("Certidão não encontrada.");
    await prisma.certidao.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);
