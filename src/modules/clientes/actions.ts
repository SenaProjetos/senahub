"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import {
  criarClienteSchema,
  editarClienteSchema,
  clienteIdSchema,
} from "@/modules/clientes/schemas";

const REVALIDATE = "/clientes";

function normalizar<T extends { email?: string }>(input: T): T {
  return { ...input, email: input.email || undefined };
}

export const criarCliente = defineAction(
  {
    modulo: "clientes",
    acao: "criar-cliente",
    recurso: "clientes",
    permissao: "gerir",
    entidade: "Cliente",
    schema: criarClienteSchema,
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (input) => {
    const cliente = await prisma.cliente.create({ data: normalizar(input) });
    revalidatePath(REVALIDATE);
    return { id: cliente.id };
  },
);

export const editarCliente = defineAction(
  {
    modulo: "clientes",
    acao: "editar-cliente",
    recurso: "clientes",
    permissao: "gerir",
    entidade: "Cliente",
    schema: editarClienteSchema,
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (input) => {
    const { id, ...rest } = normalizar(input);
    await prisma.cliente.update({ where: { id }, data: rest });
    revalidatePath(REVALIDATE);
    revalidatePath(`/clientes/${id}`);
    return { id };
  },
);

export const desativarCliente = defineAction(
  {
    modulo: "clientes",
    acao: "desativar-cliente",
    recurso: "clientes",
    permissao: "gerir",
    entidade: "Cliente",
    schema: clienteIdSchema,
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (input) => {
    await prisma.cliente.update({ where: { id: input.id }, data: { ativo: false } });
    revalidatePath(REVALIDATE);
    return { id: input.id };
  },
);

export const reativarCliente = defineAction(
  {
    modulo: "clientes",
    acao: "reativar-cliente",
    recurso: "clientes",
    permissao: "gerir",
    entidade: "Cliente",
    schema: clienteIdSchema,
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (input) => {
    await prisma.cliente.update({ where: { id: input.id }, data: { ativo: true } });
    revalidatePath(REVALIDATE);
    return { id: input.id };
  },
);
