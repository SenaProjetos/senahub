"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { CAMPOS, variantesDoValor } from "@/lib/campos";
import { campo } from "@/lib/campos/zod";
import { exigirCamposValidos } from "@/lib/campos/exigir";
import { prisma } from "@/lib/prisma";
import { HR_ADMIN_ROLES, PJ_ROLES, type Role } from "@/lib/roles";

const base = { modulo: "rh", roles: HR_ADMIN_ROLES } as const;
const rev = () => revalidatePath("/rh/pessoas-juridicas");
const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

const pjSchema = z.object({
  cnpj: campo.cnpj({ obrigatorio: true, mensagemObrigatorio: "Informe o CNPJ." }),
  razaoSocial: z.string().min(1, "Informe a razão social."),
  nomeFantasia: opt(z.string()),
  email: campo.email(),
  telefone: campo.telefone(),
});
const pjEditarSchema = pjSchema.extend({
  id: z.string().min(1),
  cnpj: campo.cnpj({ obrigatorio: true, legado: true, mensagemObrigatorio: "Informe o CNPJ." }),
  email: campo.email({ legado: true }),
  telefone: campo.telefone({ legado: true }),
});

export const criarPessoaJuridica = defineAction(
  { ...base, acao: "criar-pj", entidade: "PessoaJuridica", schema: pjSchema },
  async (i) => {
    const cnpj = i.cnpj; // já normalizado pelo schema
    // O legado pode estar gravado só com dígitos: procura as formas em que o mesmo CNPJ pode estar.
    const existente = await prisma.pessoaJuridica.findFirst({
      where: { cnpj: { in: variantesDoValor(CAMPOS.cnpj, cnpj) } },
      select: { id: true },
    });
    if (existente) throw new ActionError("Já existe uma PJ com esse CNPJ.", { cnpj: "Já existe uma PJ com esse CNPJ." });
    const pj = await prisma.pessoaJuridica.create({
      data: {
        cnpj,
        razaoSocial: i.razaoSocial.trim(),
        nomeFantasia: i.nomeFantasia || null,
        email: i.email || null,
        telefone: i.telefone || null,
      },
    });
    rev();
    return { id: pj.id };
  },
);

export const editarPessoaJuridica = defineAction(
  { ...base, acao: "editar-pj", entidade: "PessoaJuridica", schema: pjEditarSchema },
  async (i) => {
    const antesDaPj = await prisma.pessoaJuridica.findUnique({
      where: { id: i.id },
      select: { cnpj: true, email: true, telefone: true },
    });
    exigirCamposValidos(i, antesDaPj, { cnpj: "cnpj", email: "email", telefone: "telefone" });
    const cnpj = i.cnpj; // já normalizado pelo schema
    // `NOT: { id }`: com findFirst, a própria PJ (gravada em outra forma) não pode esconder um duplicado.
    const existente = await prisma.pessoaJuridica.findFirst({
      where: { cnpj: { in: variantesDoValor(CAMPOS.cnpj, cnpj) }, NOT: { id: i.id } },
      select: { id: true },
    });
    if (existente) throw new ActionError("CNPJ já usado por outra PJ.", { cnpj: "CNPJ já usado por outra PJ." });
    await prisma.pessoaJuridica.update({
      where: { id: i.id },
      data: {
        cnpj,
        razaoSocial: i.razaoSocial.trim(),
        nomeFantasia: i.nomeFantasia || null,
        email: i.email || null,
        telefone: i.telefone || null,
      },
    });
    rev();
    return { id: i.id };
  },
);

export const alternarAtivoPessoaJuridica = defineAction(
  { ...base, acao: "toggle-pj", entidade: "PessoaJuridica", schema: z.object({ id: z.string().min(1), ativo: z.boolean() }) },
  async (i) => {
    await prisma.pessoaJuridica.update({ where: { id: i.id }, data: { ativo: i.ativo } });
    rev();
    return { id: i.id };
  },
);

/** Vincula/desvincula um perfil de projetista a uma PJ (User.pjId). */
export const atribuirMembroPJ = defineAction(
  {
    ...base,
    acao: "atribuir-membro-pj",
    entidade: "User",
    schema: z.object({ userId: z.string().min(1), pjId: z.string().nullable() }),
  },
  async (i) => {
    const user = await prisma.user.findUnique({ where: { id: i.userId }, select: { role: true } });
    if (!user) throw new ActionError("Usuário não encontrado.");
    if (!PJ_ROLES.includes(user.role as Role)) {
      throw new ActionError("Apenas projetistas PJ/freelancer podem ser vinculados a um CNPJ.");
    }
    if (i.pjId) {
      const pj = await prisma.pessoaJuridica.findUnique({ where: { id: i.pjId }, select: { id: true } });
      if (!pj) throw new ActionError("PJ não encontrada.");
    }
    await prisma.user.update({ where: { id: i.userId }, data: { pjId: i.pjId } });
    rev();
    return { userId: i.userId };
  },
);
