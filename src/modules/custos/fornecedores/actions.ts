"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { validarCpfCnpj } from "@/lib/documento";
import {
  fornecedorSchema,
  fornecedorEditSchema,
  representanteSchema,
  idSchema,
  toggleSchema,
} from "./schemas";

const PATH = "/custos/fornecedores";
const base = { modulo: "custos", recurso: "custos", permissao: "cotacao" } as const;
const rev = () => revalidatePath(PATH);

export const criarFornecedor = defineAction(
  { ...base, acao: "criar-fornecedor", entidade: "CustoFornecedor", schema: fornecedorSchema },
  async (i) => {
    if (i.documento && !validarCpfCnpj(i.documento)) throw new ActionError("CPF/CNPJ inválido.");
    const c = await prisma.custoFornecedor.create({ data: { ...i, email: i.email || null } });
    rev();
    return { id: c.id };
  },
);

export const editarFornecedor = defineAction(
  { ...base, acao: "editar-fornecedor", entidade: "CustoFornecedor", schema: fornecedorEditSchema },
  async (i) => {
    const { id, ...rest } = i;
    if (rest.documento && !validarCpfCnpj(rest.documento)) throw new ActionError("CPF/CNPJ inválido.");
    await prisma.custoFornecedor.update({ where: { id }, data: { ...rest, email: rest.email || null } });
    rev();
    return { id };
  },
);

export const alternarFornecedor = defineAction(
  { ...base, acao: "alternar-fornecedor", entidade: "CustoFornecedor", schema: toggleSchema },
  async (i) => {
    await prisma.custoFornecedor.update({ where: { id: i.id }, data: { ativo: i.ativo } });
    rev();
    return { id: i.id };
  },
);

export const criarRepresentante = defineAction(
  { ...base, acao: "criar-representante", entidade: "CustoFornecedorRepresentante", schema: representanteSchema },
  async (i) => {
    const c = await prisma.custoFornecedorRepresentante.create({
      data: { ...i, email: i.email || null },
    });
    rev();
    return { id: c.id };
  },
);

export const removerRepresentante = defineAction(
  { ...base, acao: "remover-representante", entidade: "CustoFornecedorRepresentante", schema: idSchema },
  async (i) => {
    await prisma.custoFornecedorRepresentante.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);
