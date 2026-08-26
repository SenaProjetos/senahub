"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { registrarAtividade } from "@/modules/comercial/service";
import {
  criarClienteSchema,
  editarClienteSchema,
  clienteIdSchema,
  adicionarContatoSchema,
  editarContatoSchema,
  buscarContatosClienteSchema,
  buscarCandidatosDuplicataSchema,
  consultarCnpjSchema,
  mesclarClientesSchema,
} from "@/modules/clientes/schemas";
import { contatosDoCliente, clientesParaDedupe } from "@/modules/clientes/queries";
import { candidatosDuplicata } from "@/modules/comercial/dedupe";
import { soDigitos } from "@/lib/documento";
import { mesclarClientes, capturarClientesDaFusao } from "@/modules/clientes/fusao";
import { buscarDadosCnpj } from "@/modules/clientes/cnpj";

const REVALIDATE = "/clientes";

function normalizar<
  T extends { email?: string; tipo?: "PF" | "PJ"; nomeFantasia?: string | null; documento?: string | null },
>(input: T): T {
  return {
    ...input,
    email: input.email || undefined,
    // Defesa no servidor: PF não tem nome fantasia. `null` explícito limpa o campo
    // no update (undefined significaria "não mexe" e o valor de quando era PJ ficaria).
    ...(input.tipo === "PF" ? { nomeFantasia: null } : {}),
    // F1.16/ADR-03: documento é gravado SÓ COM DÍGITOS, e vazio vira `null`.
    // Sem isso o índice único parcial vira meia garantia: "40.817.865/0001-60" e
    // "40817865000160" são o mesmo CNPJ e passariam os dois. E string vazia NÃO é NULL —
    // `WHERE documento IS NOT NULL` PEGA o `''`, então dois clientes sem documento salvos
    // como `''` colidiriam no índice (era o estado de 2 registros de produção antes da F1.16).
    ...(input.documento !== undefined ? { documento: soDigitos(input.documento ?? "") || null } : {}),
  };
}

/**
 * ADR-03: CPF/CNPJ é único **quando preenchido**. A garantia real é o índice único parcial
 * `cliente_documento_unico` (migration `20260819...`); esta checagem existe só para trocar o
 * erro técnico do banco por uma mensagem que diz QUEM já tem o documento.
 *
 * Lê com `excluidoEm: { not: undefined }` (o escape hatch da extensão de soft delete, ver
 * `lib/prisma.ts`) porque o índice do banco não sabe de soft delete: um cliente excluído
 * continua ocupando o documento, e sem isso a mensagem amigável não apareceria justamente no
 * caso mais confuso para o usuário — "não existe nenhum cliente com esse CNPJ na lista, mas o
 * sistema diz que já existe".
 */
async function conferirDocumentoUnico(documento: string | null | undefined, ignorarId?: string): Promise<void> {
  if (!documento) return;
  const existente = await prisma.cliente.findFirst({
    where: {
      documento,
      excluidoEm: { not: undefined },
      ...(ignorarId ? { id: { not: ignorarId } } : {}),
    },
    select: { nome: true, excluidoEm: true, fundidoEmId: true },
  });
  if (!existente) return;

  const situacao = existente.excluidoEm
    ? " (cliente excluído)"
    : existente.fundidoEmId
      ? " (cliente já fundido em outro)"
      : "";
  throw new ActionError(`Este CPF/CNPJ já está cadastrado em "${existente.nome}"${situacao}.`);
}

/**
 * Rede de segurança para a corrida entre a checagem acima e o `INSERT`: se dois cadastros com o
 * mesmo documento chegarem juntos, quem perde recebe P2002 do índice. Sem isto o `defineAction`
 * devolveria "erro inesperado" para um caso de negócio perfeitamente normal.
 */
async function comDocumentoUnico<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const codigo = (e as { code?: string }).code;
    const alvo = JSON.stringify((e as { meta?: unknown }).meta ?? "");
    if (codigo === "P2002" && alvo.includes("documento")) {
      throw new ActionError("Este CPF/CNPJ já está cadastrado em outro cliente.");
    }
    throw e;
  }
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
  async (input, ctx) => {
    const dados = normalizar(input);
    await conferirDocumentoUnico(dados.documento);
    const cliente = await comDocumentoUnico(() => prisma.cliente.create({ data: dados }));
    // F3.2 — primeiro evento da história desta empresa na Empresa 360 (Fase 3). Sem ele, a
    // timeline começaria pela primeira prospecção, sem dizer quando a empresa entrou no sistema.
    await registrarAtividade(
      { evento: "EMPRESA_CADASTRADA", nome: cliente.nome },
      { autorId: ctx.user.id, clienteId: cliente.id },
    );
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
    await conferirDocumentoUnico(rest.documento, id);
    await comDocumentoUnico(() => prisma.cliente.update({ where: { id }, data: rest }));
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
  async (input, ctx) => {
    const { clienteId, email, ...rest } = input;
    const contato = await prisma.contatoCliente.create({
      data: { ...rest, email: email || null, cliente: { connect: { id: clienteId } } },
    });
    await registrarAtividade(
      { evento: "CONTATO_CADASTRADO", nome: contato.nome, cargo: contato.cargo },
      { autorId: ctx.user.id, clienteId, contatoId: contato.id },
    );
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

/** Consulta uma fonte pública e devolve os dados para revisão no formulário, sem persistir nada. */
export const consultarCnpj = defineAction(
  {
    modulo: "clientes",
    acao: "consultar-cnpj",
    recurso: "clientes",
    permissao: "gerir",
    schema: consultarCnpjSchema,
  },
  async ({ cnpj }) => {
    const dados = await buscarDadosCnpj(cnpj);
    if (!dados) {
      throw new ActionError("Não foi possível consultar este CNPJ. Preencha o cadastro manualmente.");
    }
    return dados;
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
