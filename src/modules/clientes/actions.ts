"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import {
  criarClienteSchema,
  editarClienteSchema,
  clienteIdSchema,
  adicionarContatoSchema,
  editarContatoSchema,
  buscarContatosClienteSchema,
  buscarCandidatosDuplicataSchema,
  mesclarClientesSchema,
} from "@/modules/clientes/schemas";
import { contatosDoCliente, clientesParaDedupe } from "@/modules/clientes/queries";
import { candidatosDuplicata } from "@/modules/comercial/dedupe";
import { mesclarClientes, capturarClientesDaFusao } from "@/modules/clientes/fusao";

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

/**
 * Edita um contato existente (F1.11, edição inline na aba Contatos).
 *
 * Marcar `principal: true` desmarca os demais contatos do MESMO cliente na mesma transação —
 * o schema não tem constraint de unicidade para isso (não é FK, é regra de negócio), e sem essa
 * reconciliação o cliente acumularia N "principais" sem que nada avisasse.
 */
export const editarContato = defineAction(
  {
    modulo: "clientes",
    acao: "editar-contato",
    recurso: "clientes",
    permissao: "gerir",
    entidade: "ContatoCliente",
    schema: editarContatoSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
  },
  async (input) => {
    const { id, email, principal, ...rest } = input;
    const atual = await prisma.contatoCliente.findUnique({
      where: { id },
      select: { clienteId: true },
    });
    if (!atual) throw new ActionError("Contato não encontrado.");

    await prisma.$transaction(async (tx) => {
      if (principal === true) {
        await tx.contatoCliente.updateMany({
          where: { clienteId: atual.clienteId, id: { not: id } },
          data: { principal: false },
        });
      }
      await tx.contatoCliente.update({
        where: { id },
        data: { ...rest, email: email || null, ...(principal !== undefined ? { principal } : {}) },
      });
    });

    revalidatePath(`/clientes/${atual.clienteId}`);
    return { id };
  },
);

/**
 * Funde dois clientes duplicados (F1.14). ⚠️ Move projeto entre empresas — a escolha de quem
 * sobrevive é humana; esta action só executa. `capturarAntes` grava os dois no `AuditLog`,
 * porque é o registro que alguém vai querer daqui a seis meses quando um projeto parecer estar
 * na empresa errada.
 */
export const mesclarClientesAction = defineAction(
  {
    modulo: "clientes",
    acao: "mesclar-clientes",
    recurso: "clientes",
    permissao: "gerir",
    entidade: "Cliente",
    schema: mesclarClientesSchema,
    entidadeId: (_d, i) => i.sobreviventeId,
    capturarAntes: capturarClientesDaFusao,
  },
  async (input) => {
    const r = await mesclarClientes(input.sobreviventeId, input.absorvidoId);
    revalidatePath(REVALIDATE);
    revalidatePath(`/clientes/${input.sobreviventeId}`);
    revalidatePath(`/clientes/${input.absorvidoId}`);
    return r;
  },
);

/**
 * Candidatos a duplicata (F1.13) para o alerta não bloqueante do formulário de cliente. Não
 * bloqueia nada — só devolve os candidatos, ordenados; a UI decide o que mostrar.
 */
export const buscarCandidatosDuplicata = defineAction(
  {
    modulo: "clientes",
    acao: "buscar-candidatos-duplicata",
    recurso: "clientes",
    permissao: "ver",
    schema: buscarCandidatosDuplicataSchema,
  },
  async (input) => {
    const existentes = await clientesParaDedupe();
    return candidatosDuplicata(existentes, input);
  },
);

/** Lê os contatos de um cliente sob demanda (F1.11) — hidrata a aba Contatos ao ser aberta. */
export const buscarContatosCliente = defineAction(
  {
    modulo: "clientes",
    acao: "buscar-contatos-cliente",
    recurso: "clientes",
    permissao: "ver",
    schema: buscarContatosClienteSchema,
  },
  async (input) => contatosDoCliente(input.clienteId),
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
