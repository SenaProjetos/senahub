"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { removerArquivo } from "@/lib/storage";

const base = { modulo: "rh", roles: HR_ADMIN_ROLES } as const;
const rev = () => revalidatePath("/rh/funcionarios");
const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

const docMeta = z.object({
  caminho: z.string().min(1),
  nomeArquivo: z.string().min(1),
  mime: z.string().min(1),
  tamanho: z.number().int().nonnegative(),
  hashSha256: z.string().min(1),
});

export const adicionarDependente = defineAction(
  {
    ...base,
    acao: "add-dependente",
    entidade: "Dependente",
    schema: z.object({
      userId: z.string().min(1),
      nome: z.string().min(1, "Informe o nome."),
      nascimento: opt(z.string()),
      parentesco: opt(z.string()),
    }),
  },
  async (i) => {
    const d = await prisma.dependente.create({
      data: {
        userId: i.userId,
        nome: i.nome,
        nascimento: i.nascimento ? new Date(i.nascimento + "T00:00:00Z") : null,
        parentesco: i.parentesco || null,
      },
    });
    rev();
    return { id: d.id };
  },
);

export const removerDependente = defineAction(
  { ...base, acao: "rm-dependente", entidade: "Dependente", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    await prisma.dependente.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

/** Define o salário base do colaborador (p/ geração automática de holerite). */
export const salvarSalario = defineAction(
  { ...base, acao: "salvar-salario", entidade: "User", schema: z.object({ userId: z.string().min(1), salarioBase: z.number().min(0) }) },
  async (i) => {
    await prisma.user.update({ where: { id: i.userId }, data: { salarioBase: i.salarioBase } });
    rev();
    return { id: i.userId };
  },
);

/** Define a data de admissão do colaborador (base do período aquisitivo de férias). */
export const salvarDataAdmissao = defineAction(
  { ...base, acao: "salvar-admissao", entidade: "User", schema: z.object({ userId: z.string().min(1), dataAdmissao: opt(z.string()) }) },
  async (i) => {
    await prisma.user.update({
      where: { id: i.userId },
      data: { dataAdmissao: i.dataAdmissao ? new Date(i.dataAdmissao + "T00:00:00Z") : null },
    });
    rev();
    return { id: i.userId };
  },
);

const TIPOS_DOC = ["contrato", "rg", "cpf", "aso", "diploma", "comprovante", "outro"] as const;

export const adicionarDocumentoFuncionario = defineAction(
  {
    ...base,
    acao: "add-doc-funcionario",
    entidade: "FuncionarioDocumento",
    schema: z.object({
      userId: z.string().min(1),
      tipo: z.enum(TIPOS_DOC),
      nome: z.string().min(1, "Informe o nome."),
      meta: docMeta,
    }),
  },
  async (i, ctx) => {
    const d = await prisma.funcionarioDocumento.create({
      data: {
        userId: i.userId,
        tipo: i.tipo,
        nome: i.nome,
        caminho: i.meta.caminho,
        nomeArquivo: i.meta.nomeArquivo,
        mime: i.meta.mime,
        tamanho: i.meta.tamanho,
        hashSha256: i.meta.hashSha256,
        autorId: ctx.user.id,
      },
    });
    rev();
    return { id: d.id };
  },
);

export const removerDocumentoFuncionario = defineAction(
  { ...base, acao: "rm-doc-funcionario", entidade: "FuncionarioDocumento", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    const d = await prisma.funcionarioDocumento.findUnique({ where: { id: i.id }, select: { caminho: true } });
    if (!d) throw new ActionError("Documento não encontrado.");
    await prisma.funcionarioDocumento.delete({ where: { id: i.id } });
    await removerArquivo(d.caminho);
    rev();
    return { id: i.id };
  },
);
