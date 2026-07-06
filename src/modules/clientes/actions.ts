"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import {
  criarClienteSchema,
  editarClienteSchema,
  clienteIdSchema,
  adicionarContatoSchema,
} from "@/modules/clientes/schemas";

const REVALIDATE = "/clientes";

function normalizar<T extends { email?: string; tipo?: "PF" | "PJ"; nomeFantasia?: string | null }>(input: T): T {
  return {
    ...input,
    email: input.email || undefined,
    // Defesa no servidor: PF não tem nome fantasia. `null` explícito limpa o campo
    // no update (undefined significaria "não mexe" e o valor de quando era PJ ficaria).
    ...(input.tipo === "PF" ? { nomeFantasia: null } : {}),
  };
}

export const criarCliente = defineAction(
  {
    modulo: "clientes",
    acao: "criar-cliente",
    recurso: "clientes",
    permissao: "gerir",
    entidade: "Cliente",
    schema: criarClienteSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
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
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
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
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
  },
  async (input) => {
    await prisma.cliente.update({ where: { id: input.id }, data: { ativo: false } });
    revalidatePath(REVALIDATE);
    return { id: input.id };
  },
);

export const adicionarContato = defineAction(
  {
    modulo: "clientes",
    acao: "adicionar-contato",
    recurso: "clientes",
    permissao: "gerir",
    entidade: "ContatoCliente",
    schema: adicionarContatoSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
  },
  async (input) => {
    const { clienteId, email, ...rest } = input;
    const contato = await prisma.contatoCliente.create({
      data: { ...rest, email: email || null, cliente: { connect: { id: clienteId } } },
    });
    revalidatePath(`/clientes/${clienteId}`);
    return { id: contato.id };
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
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
  },
  async (input) => {
    await prisma.cliente.update({ where: { id: input.id }, data: { ativo: true } });
    revalidatePath(REVALIDATE);
    return { id: input.id };
  },
);
